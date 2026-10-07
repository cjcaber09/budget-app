import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from '@supabase/supabase-js/cors';
import {
  MAX_OCR_TEXT_CHARS,
  OCR_BUCKET,
  clampOcrText,
  isUuid,
  ocrScanPath,
  timingSafeEqual,
  validateImagePayload,
  reconcileReceipt,
  receiptForClient,
  type OcrScanResult,
} from './shared.ts';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_TIMEOUT_MS,
  VISION_TIMEOUT_MS,
  VISION_URL,
  buildGeminiBody,
  buildVisionBody,
  geminiUrl,
  parseGeminiResponse,
  parseVisionResponse,
  readWithFallback,
  type ProviderAttempt,
} from './ocrProviders.ts';
import { publishReceipt, readReceipt, receiptPath } from './receiptStorage.ts';

// deno-lint-ignore no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

// The SDK's own list of headers its clients send (kept in sync by supabase-js),
// so web preflights don't break when it adds one. Wildcard origin is fine: auth
// is a bearer token or shared secret, never cookies.
const CORS_HEADERS: Record<string, string> = corsHeaders;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...headers },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// A definite "that user doesn't exist" from auth-js (AuthApiError code 'user_not_found').
// A bare HTTP 404 is not enough: purgeUserFolder wipes files on this answer, so a stray
// 404 from a gateway or proxy must not count as proof.
function isAuthUserNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'user_not_found';
}

// A definite "that object isn't there" from storage-js (StorageApiError: statusCode '404',
// sometimes with HTTP status 400). Anything else (network, 5xx, timeouts) is a failure.
function isStorageObjectNotFound(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown } | null;
  return e?.status === 404 || e?.statusCode === '404';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Best effort: if this write also fails, the row stays 'pending' with no .txt and
// try_consume_ocr_quota reconciles it to 'failed' after 10 minutes.
async function markFailed(admin: AdminClient, scanId: string) {
  await admin.from('ocr_scans').update({ status: 'failed' }).eq('id', scanId);
}

// Runs after the .txt is stored. If every attempt fails, the row stays 'pending'
// with its .txt present; a replay of the same requestId or the 10-minute
// reconciliation in try_consume_ocr_quota completes it.
async function markCompleted(admin: AdminClient, scanId: string, charCount: number): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await admin
      .from('ocr_scans')
      .update({ status: 'completed', char_count: charCount })
      .eq('id', scanId);
    if (!error) return true;
    await sleep(200 * attempt);
  }
  return false;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    // Key in a header, not the URL, so it can't leak through logged URLs.
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify(body),
    // A hung provider must not block the fallback (or outlast the client's own timeout).
    signal: AbortSignal.timeout(timeoutMs),
  });
  const reader = res.body?.getReader();
  if (!reader) return { status: res.status, json: null };
  const decoder = new TextDecoder();
  let responseText = ''; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256 * 1024) { await reader.cancel(); return { status: 502, json: null }; }
      responseText += decoder.decode(chunk.value, { stream: true });
    }
    responseText += decoder.decode();
    return { status: res.status, json: JSON.parse(responseText) };
  } catch { return { status: res.status, json: null }; }
}

// Gemini structured extraction first; Vision text fallback when configured.
function ocrAttempts(imageBase64: string, mimeType: string): ProviderAttempt[] {
  const attempts: ProviderAttempt[] = [];
  const visionKey = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (visionKey) {
    attempts.push({
      name: 'vision',
      run: async () => {
        const { status, json } = await postJson(VISION_URL, visionKey, buildVisionBody(imageBase64), VISION_TIMEOUT_MS);
        return parseVisionResponse(status, json);
      },
    });
  }
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (geminiKey) {
    const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    attempts.push({
      name: 'gemini',
      run: async () => {
        const { status, json } = await postJson(
          geminiUrl(model),
          geminiKey,
          buildGeminiBody(imageBase64, mimeType),
          GEMINI_TIMEOUT_MS
        );
        return parseGeminiResponse(status, json);
      },
    });
  }
  return attempts.sort((a, b) => a.name === b.name ? 0 : a.name === 'gemini' ? -1 : 1);
}

async function runNewScan(
  admin: AdminClient,
  userId: string,
  scanId: string,
  imageBase64: string,
  mimeType: string,
  receiptVersion: 1 | 2 = 1
): Promise<Response> {
  const outcome = await readWithFallback(ocrAttempts(imageBase64, mimeType));
  // Reason codes only (e.g. BILLING_DISABLED, RESOURCE_EXHAUSTED) — never messages or text.
  for (const failure of outcome.failures) console.error('ocr: provider failed', { scanId, ...failure });
  if (outcome.text === null) {
    await markFailed(admin, scanId);
    return json(502, { error: 'ocr_failed' });
  }
  console.log('ocr: text read', { scanId, provider: outcome.provider });

  const { text, truncated } = clampOcrText(outcome.text);
  const path = ocrScanPath(userId, scanId);
  const receipt = outcome.receipt ? reconcileReceipt(outcome.receipt) : null;
  const published = await publishReceipt(admin.storage.from(OCR_BUCKET), path, text, receipt);
  if (receipt && !published.jsonSaved) console.error('ocr: receipt publication failed', { scanId });
  if (!published.textSaved) {
    if (published.cleanupFailed) console.error('ocr: failed artifact cleanup requires retry', { scanId });
    await markFailed(admin, scanId);
    console.error('ocr: upload failed', { scanId });
    return json(500, { error: 'storage_failed' });
  }

  if (!(await markCompleted(admin, scanId, text.length))) {
    console.error('ocr: status update failed after upload; left for reconciliation', { scanId });
  }
  const result: OcrScanResult = { scanId, text, path, truncated, receipt: receiptForClient(receipt,receiptVersion) };
  return json(200, result);
}

// Same requestId again (client retry, lost response) or an image this user already
// scanned: never spend another Vision unit.
async function replayScan(admin: AdminClient, userId: string, scanId: string, status: string, receiptVersion: 1 | 2 = 1): Promise<Response> {
  if (status === 'failed') {
    // Explicit replay retry also retries an orphan JSON cleanup after failed text publication.
    const { error } = await admin.storage.from(OCR_BUCKET).remove([receiptPath(userId, scanId)]);
    return json(error ? 500 : 502, { error: error ? 'storage_failed' : 'ocr_failed' });
  }
  if (status === 'deleted') return json(410, { error: 'deleted' });

  const path = ocrScanPath(userId, scanId);
  const { data: file, error: downloadError } = await admin.storage.from(OCR_BUCKET).download(path);
  if (!file) {
    // A storage failure must not be reported as 'deleted' / 'in_progress'.
    if (downloadError && !isStorageObjectNotFound(downloadError)) return json(500, { error: 'storage_failed' });
    // 'completed' without its .txt: gone. 'pending' without a .txt: the original
    // request is still running (or died before uploading).
    return status === 'completed' ? json(410, { error: 'deleted' }) : json(409, { error: 'in_progress' });
  }

  const text = await file.text();
  if (status === 'pending') await markCompleted(admin, scanId, text.length); // upload landed, status didn't
  let receipt;
  try { receipt = await readReceipt(admin.storage.from(OCR_BUCKET), userId, scanId); }
  catch { return json(500, { error: 'storage_failed' }); }
  const result: OcrScanResult = { scanId, text, path, truncated: text.length >= MAX_OCR_TEXT_CHARS, receipt:receiptForClient(receipt,receiptVersion) };
  return json(200, result);
}

async function scanImage(admin: AdminClient, userId: string, body: unknown): Promise<Response> {
  const payload = validateImagePayload(body);
  if (!payload.ok) return json(400, { error: payload.error });
  const requestedVersion = (body as { receiptSchemaVersion?: unknown }).receiptSchemaVersion;
  if (requestedVersion !== undefined && requestedVersion !== 1 && requestedVersion !== 2) return json(400,{error:'invalid_request'});
  const receiptVersion = requestedVersion === 2 ? 2 : 1;

  const { data: rows, error } = await admin.rpc('try_consume_ocr_quota', {
    p_user_id: userId,
    p_request_id: payload.requestId,
    p_image_sha256: await sha256Hex(payload.bytes),
  });
  const quota = rows?.[0];
  if (error || !quota) {
    console.error('ocr: quota check failed', { code: error?.code });
    return json(500, { error: 'quota_check_failed' });
  }

  if (quota.outcome === 'blocked') {
    return json(
      429,
      { error: 'rate_limited', reason: quota.reason, retryAfterSeconds: quota.retry_after_seconds },
      { 'Retry-After': String(quota.retry_after_seconds) }
    );
  }
  if (quota.outcome === 'replay') return replayScan(admin, userId, quota.scan_id, quota.scan_status,receiptVersion);
  return runNewScan(admin, userId, quota.scan_id, payload.imageBase64, payload.mimeType,receiptVersion);
}

async function deleteScan(admin: AdminClient, userId: string, body: unknown): Promise<Response> {
  const scanId = (body as { scanId?: unknown } | null)?.scanId;
  if (!isUuid(scanId)) return json(400, { error: 'invalid_request' });

  const { data: scan, error: lookupError } = await admin
    .from('ocr_scans')
    .select('status')
    .eq('id', scanId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError) return json(500, { error: 'lookup_failed' }); // a DB error is not 'not found'
  if (!scan) return json(404, { error: 'not_found' });
  if (scan.status === 'deleted') return noContent(); // idempotent
  if (scan.status !== 'completed' && scan.status !== 'failed') return json(409, { error: 'not_deletable' });

  // remove() succeeds for paths that don't exist, so a .txt that's already gone
  // (manual cleanup, or an earlier delete whose row update failed) just proceeds.
  const { error: removeError } = await admin.storage.from(OCR_BUCKET).remove([ocrScanPath(userId, scanId), receiptPath(userId, scanId)]);
  if (removeError) return json(500, { error: 'storage_failed' });

  // Keep the row: it still counts toward the rate limit.
  const { error: updateError } = await admin.from('ocr_scans').update({ status: 'deleted' }).eq('id', scanId);
  if (updateError) return json(500, { error: 'delete_incomplete' }); // file is gone; retrying finishes it
  return noContent();
}

// Called by the on_auth_user_deleted_ocr_cleanup trigger (Task 4) via pg_net.
async function purgeUserFolder(admin: AdminClient, body: unknown): Promise<Response> {
  const userId = (body as { userId?: unknown } | null)?.userId;
  if (!isUuid(userId)) return json(400, { error: 'invalid_request' });

  // pg_net sends only after the delete commits, so the trigger's calls always
  // find the account gone. A live account means the call came from elsewhere
  // (e.g. a leaked secret): refuse instead of wiping a real user's files.
  const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (existing?.user) return json(409, { error: 'user_exists' });
  // Fail closed: only a definite not-found proves the account is gone; any other lookup error deletes nothing.
  if (lookupError && !isAuthUserNotFound(lookupError)) return json(503, { error: 'lookup_failed' });

  let removed = 0;
  for(const bucket of [OCR_BUCKET,'budget-tracker-avatars']) {
  // Bounded: each pass lists then removes up to 100 files.
  for (let pass = 0; pass < 100; pass++) {
    const { data: files, error: listError } = await admin.storage.from(bucket).list(userId, { limit: 100 });
    if (listError) return json(500, { error: 'storage_failed' });
    if (!files || files.length === 0) break;
    const { error: removeError } = await admin.storage
      .from(bucket)
      .remove(files.map((file) => `${userId}/${file.name}`));
    if (removeError) return json(500, { error: 'storage_failed' });
    removed += files.length;
  }
  }
  console.log('ocr: purged deleted account folder', { removed });
  return json(200, { removed });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('ocr: missing Supabase environment');
    return json(500, { error: 'server_misconfigured' });
  }
  const admin: AdminClient = createClient(supabaseUrl, serviceKey, {
    db: { schema: 'budget_tracker' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Server-to-server path from the auth.users delete trigger.
  const providedSecret = req.headers.get('x-ocr-webhook-secret');
  if (providedSecret !== null) {
    const expectedSecret = Deno.env.get('OCR_WEBHOOK_SECRET');
    if (!expectedSecret || req.method !== 'POST' || !timingSafeEqual(providedSecret, expectedSecret)) {
      return json(401, { error: 'unauthorized' });
    }
    return purgeUserFolder(admin, await req.json().catch(() => null));
  }

  // User path. verify_jwt is off at the gateway, so this check is the auth.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: 'unauthorized' });

  const body = await req.json().catch(() => null);
  if (req.method === 'DELETE') return deleteScan(admin, authData.user.id, body);
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Checked before validation and quota, so a misconfigured deploy never spends a scan.
  if (!Deno.env.get('GOOGLE_VISION_API_KEY') && !Deno.env.get('GEMINI_API_KEY')) {
    console.error('ocr: no OCR provider configured');
    return json(500, { error: 'server_misconfigured' });
  }
  return scanImage(admin, authData.user.id, body);
});

// Request builders and response parsers for the OCR providers, plus the fallback
// order. Pure, so Jest can test it (Deno isn't installed locally) — index.ts does
// the actual fetches. Like shared.ts, keep it free of imports: Deno needs `.ts`
// specifiers and the root tsconfig rejects them.

// Per-provider fetch timeouts. Their sum plus about 3 s of DB/storage work stays
// under the client's 30 s invoke timeout (OCR_TIMEOUT_MS in src/hooks/useOcr.ts),
// so a hung Vision call still leaves Gemini time to answer before the client gives up.
export const VISION_TIMEOUT_MS = 10_000;
export const GEMINI_TIMEOUT_MS = 17_000;

export type OcrProviderName = 'vision' | 'gemini';

export type ProviderResult = { ok: true; text: string } | { ok: false; status: number; reason: string };

export interface ProviderAttempt {
  name: OcrProviderName;
  run: () => Promise<ProviderResult>;
}

export interface ReadOutcome {
  provider: OcrProviderName | null;
  text: string | null;
  failures: { name: OcrProviderName; status: number; reason: string }[];
}

interface GoogleError {
  code?: number;
  status?: string;
  details?: { reason?: string }[];
}

// Most specific first (PERMISSION_DENIED + BILLING_DISABLED → BILLING_DISABLED).
// Codes only — never the message, which can echo request details.
function googleErrorReason(error: GoogleError | undefined, fallback: string): string {
  const detailReason = error?.details?.find((detail) => detail.reason)?.reason;
  if (detailReason) return detailReason;
  if (error?.status) return error.status;
  if (typeof error?.code === 'number') return `code_${error.code}`;
  return fallback;
}

function isHttpOk(status: number): boolean {
  return status >= 200 && status < 300;
}

// Vision: free tier = 1,000 units/month, 1 unit per image per feature, so exactly
// one feature. The field mask keeps only the text — by default Vision also returns
// per-word geometry, often megabytes.
export const VISION_URL =
  'https://vision.googleapis.com/v1/images:annotate?fields=responses(fullTextAnnotation/text,error)';

export function buildVisionBody(imageBase64: string) {
  return { requests: [{ image: { content: imageBase64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] };
}

export function parseVisionResponse(status: number, body: unknown): ProviderResult {
  const parsed = body as {
    error?: GoogleError;
    responses?: { error?: GoogleError; fullTextAnnotation?: { text?: string } }[];
  } | null;
  if (!isHttpOk(status)) return { ok: false, status, reason: googleErrorReason(parsed?.error, 'http_error') };
  const result = parsed?.responses?.[0];
  if (!result) return { ok: false, status, reason: 'no_response' };
  if (result.error) return { ok: false, status, reason: googleErrorReason(result.error, 'vision_error') };
  return { ok: true, text: result.fullTextAnnotation?.text ?? '' };
}

// Gemini (Google AI Studio key) — the fallback when Vision fails, including when
// Vision's billing is off: Gemini's free tier needs no billing account. That free
// tier may use submitted content to improve Google's products; AddTransactionSheet's
// privacy note says so. generateContent is the stable, stateless endpoint. Set the
// GEMINI_MODEL secret to switch models when Google retires this one.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

const GEMINI_PROMPT =
  'Transcribe all text in this image exactly as it appears, preserving line breaks and reading order. ' +
  'Output only the transcribed text, with no commentary or formatting. If the image has no text, output nothing.';

export function buildGeminiBody(imageBase64: string, mimeType: string) {
  return {
    contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: GEMINI_PROMPT }] }],
    // ~4 characters per token: 8192 tokens comfortably covers the 20,000-character clamp.
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  };
}

const GEMINI_OK_FINISH_REASONS = new Set(['STOP', 'MAX_TOKENS']);

// Models sometimes wrap plain output in a Markdown fence despite the prompt.
function stripCodeFence(text: string): string {
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(text);
  return fenced ? fenced[1] : text;
}

export function parseGeminiResponse(status: number, body: unknown): ProviderResult {
  const parsed = body as {
    error?: GoogleError;
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  } | null;
  if (!isHttpOk(status)) return { ok: false, status, reason: googleErrorReason(parsed?.error, 'http_error') };
  const blockReason = parsed?.promptFeedback?.blockReason;
  if (blockReason) return { ok: false, status, reason: `blocked_${blockReason}` };
  const candidate = parsed?.candidates?.[0];
  if (!candidate) return { ok: false, status, reason: 'no_candidate' };
  if (candidate.finishReason && !GEMINI_OK_FINISH_REASONS.has(candidate.finishReason)) {
    return { ok: false, status, reason: candidate.finishReason };
  }
  const text = (candidate.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  return { ok: true, text: stripCodeFence(text.trim()) };
}

// Tries each provider in order; the first success wins. Any failure — billing off,
// quota, outage, blocked content, network — moves on to the next one.
export async function readWithFallback(attempts: ProviderAttempt[]): Promise<ReadOutcome> {
  const failures: ReadOutcome['failures'] = [];
  for (const attempt of attempts) {
    let result: ProviderResult;
    try {
      result = await attempt.run();
    } catch (error) {
      // AbortSignal.timeout rejects with a DOMException named 'TimeoutError' (Deno and Node).
      const timedOut = (error as { name?: unknown } | null)?.name === 'TimeoutError';
      result = { ok: false, status: 0, reason: timedOut ? 'timeout' : 'network_error' };
    }
    if (result.ok) return { provider: attempt.name, text: result.text, failures };
    failures.push({ name: attempt.name, status: result.status, reason: result.reason });
  }
  return { provider: null, text: null, failures };
}

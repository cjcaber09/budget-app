# Receipt OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen by the user: inline in this session, with checkpoints between tasks) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick a receipt image (camera or file), extract its text with rate-limited, idempotent server-side OCR that stays inside Google Vision's free tier (1,000 images/month), save the text as a `.txt` in Supabase Storage, prefill the new transaction's note, and remove a user's files when their account is deleted.

**Architecture:** The client shrinks the picked image (≤ 1600 px JPEG), tags it with a `requestId`, and hands it to the Add Transaction screen through an in-memory zustand store (never a URL param). That screen calls the `ocr` Edge Function, which authenticates the user in-function, validates the payload, hashes the image, and asks a Postgres function to either replay an earlier result (same `requestId`, or same image already scanned), block on quota, or open a new ledger row — all under one advisory lock. Only new scans call Google Cloud Vision (one feature, text-only response), clamp the text, upload `{user_id}/{scan_id}.txt`, and mark the row completed; anything left half-done is reconciled from what's actually in Storage. An `auth.users` delete trigger (via `pg_net`) calls the same function's purge route, authenticated by a Vault-held shared secret.

**Tech Stack:** Expo SDK 57 / React Native 0.86 / expo-router, TanStack Query v5, zustand, `expo-image-picker`, `expo-image-manipulator` (new), `lucide-react-native`, Supabase (Postgres, Storage, Vault, `pg_net`, Edge Functions on Deno), Google Cloud Vision `DOCUMENT_TEXT_DETECTION`, Gemini API `generateContent` (fallback), Jest + RTL (jest-expo).

## Amendment — Gemini fallback (added 2026-10-05, mid-execution)

**Why:** the live test (Task 3) is blocked because Google Vision answers every call with `403 BILLING_DISABLED`: Vision needs a billing account even within its free tier. The user asked to also integrate a Google AI endpoint and use it whenever Vision isn't available.

**Decisions:**
- **Endpoint:** the Gemini API (Google AI Studio key), `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, with the key in the `x-goog-api-key` header. `generateContent` is the stable, stateless call and is still fully supported. The newer Interactions API targets agents and multi-step work, which an OCR call doesn't need.
- **Model:** default `gemini-3.5-flash-lite`, Google's cheapest current image-capable model. Its free tier needs no billing, and it defaults to minimal thinking, so no thinking config is sent. The optional `GEMINI_MODEL` secret overrides the model, so a model retirement doesn't need a code change.
- **Order:**
  - Vision is tried first when `GOOGLE_VISION_API_KEY` is set. **Any** failure (HTTP error such as billing disabled, quota or outage, a per-image error, a network error) falls through to Gemini when `GEMINI_API_KEY` is set.
  - Either key alone works. Neither configured means `500 server_misconfigured` before any quota is spent.
- **Quota:** unchanged. There is one ledger row per new scan whichever provider answers, and all existing caps still apply.
- **Privacy** (user's choice: disclose): Google's pricing page says Gemini's free tier uses submitted content to improve Google's products. The + sheet's note says so (Task 14).
- **Testability:** the provider request builders, response parsers and fallback loop live in a new pure, import-free module, `supabase/functions/ocr/ocrProviders.ts`, unit-tested in Jest. `index.ts` only does the `fetch` calls.

**Execution status and order from here:**
- Done and reviewed: Tasks 1, 2 and 5–11.
- Task 3: code written but not committed. Its deploy and live test are blocked on Vision billing.
- Run order: **Task 13** (provider module) → **Task 14** (privacy note) → **Task 3** (`index.ts` per the updated code below; deploy; live test, where section #2 now passes through Gemini while Vision billing is off) → **Task 4** → **Task 12** → final whole-branch review.
- Before Task 13:
  - Copy this plan over `docs/superpowers/plans/2026-10-05-receipt-ocr.md` and commit it: `docs: amend receipt OCR plan with Gemini fallback`, ending with the Co-Authored-By trailer.
  - Regenerate the task briefs for Tasks 3, 12, 13 and 14 from the repo copy.
  - Task 3's uncommitted `index.ts` gets updated to the code below as part of Task 3, after Task 13 lands.
- Execution stays subagent-driven on Sonnet (the user's choice).
- User action needed before Task 3's deploy: Prerequisite step 4 (set `GEMINI_API_KEY`).

## Global Constraints

- **Google Vision free tier: 1,000 images/month, 1 unit per image per feature.** The app sends exactly one feature (`DOCUMENT_TEXT_DETECTION`) per image, and never calls Vision for a replay.
- Limits (user-chosen, spread over the month): **900 per calendar month across all users** (Pacific Time — Google's billing clock; 100 units spare for boundary drift and manual tests), **40 per rolling 24 hours across all users, 20 per rolling 24 hours per user, 5 per rolling 1 hour per user.** Checked longest window first so `retryAfterSeconds` is the real wait. Every new attempt that passes validation counts (including failed Vision calls and later-deleted scans).
- **Replays never count and never call Vision:** same `requestId` again, or the same image (SHA-256 of the bytes) that this user already has a completed scan for.
- Extracted text is clamped to **20,000 characters**; responses carry `truncated: boolean`.
- Images: client normalizes to **JPEG, long edge ≤ 1600 px, compress 0.6** (Vision bills per image, not per byte — smaller just means faster uploads); server accepts only `image/jpeg`, `image/png`, `image/webp`, decoded **≤ 1.5 MiB (1572864 bytes)**, magic bytes must match the declared type. No image is ever stored (only its hash).
- Vision request: API key in the **`X-Goog-Api-Key` header** (never the URL); response trimmed with the field mask **`fields=responses(fullTextAnnotation/text,error)`** (drops per-word geometry, often megabytes).
- **OCR fallback:** if Vision fails for any reason, the same image goes to **Gemini `generateContent`** (default model **`gemini-3.5-flash-lite`**, overridable with the **`GEMINI_MODEL`** secret). Same `X-Goog-Api-Key` header, `temperature: 0`, `maxOutputTokens: 8192`, and a transcribe-only prompt. Gemini's text gets the same 20,000-char clamp. Provider failures are logged as `{ scanId, name, status, reason }` codes only, never error messages or text.
- Every scan request carries a client-generated **`requestId` (UUID)**, unique per user; the outcome of a `requestId` is final.
- Storage: bucket **`budget-tracker-ocr`**, private, 1 MiB file limit, object path **`{user_id}/{scan_id}.txt`** (always derived, never stored). Project is shared with other apps — every new name is prefixed.
- Edge Function **`ocr`**, **`verify_jwt = false`** with auth enforced in-function on every path (user JWT via `auth.getUser`, or the shared secret for the account-deletion trigger, which can't carry a user JWT). Secrets: **`GOOGLE_VISION_API_KEY`** and/or **`GEMINI_API_KEY`** (at least one; optional **`GEMINI_MODEL`**), **`OCR_WEBHOOK_SECRET`**. Deploy with **`--use-api --project-ref axcuqumgplgbuwlnzfpt`** (no Docker locally).
- **`pg_net`** gets enabled on the shared project (user-approved). Vault secrets: `budget_tracker_ocr_function_url`, `budget_tracker_ocr_webhook_secret`.
- Schema **`budget_tracker`**. Migration 0001 grants `all on functions/tables` to `anon, authenticated` by default → every new function must explicitly revoke.
- `supabase/functions/ocr/shared.ts` is imported by both the Deno function and the app: **one file, no imports** (the root tsconfig has no `allowImportingTsExtensions`; Deno needs `.ts` specifiers).
- Never log image bytes, extracted text, user ids, or secrets (scan ids, status codes, counts only).
- Client OCR timeout **30 s**, at most **1 automatic retry** (network/timeout/in-progress only).
- Work directly on `main` (existing practice); do not push unless the user asks.
- Every commit message ends with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Prerequisite (user, before Task 3)

1. Google Cloud: enable **Cloud Vision API** (it requires a billing account even when usage stays in the free tier); create an API key with **API restrictions → Cloud Vision API only** and **Application restrictions → None** (calls come from Supabase's servers, so a website/app/IP restriction would reject every request).
2. Backstops in case the app-side caps ever fail: a billing **budget alert at $1**, and optionally a lower requests-per-minute quota (Cloud Console → APIs & Services → Cloud Vision API → Quotas).
3. Set the key yourself so it never passes through chat:
   `npx supabase secrets set GOOGLE_VISION_API_KEY=<key> --project-ref axcuqumgplgbuwlnzfpt` (done)
4. **Gemini fallback key (amendment):** create a free key at https://aistudio.google.com/apikey (no billing needed), then set it the same way. First load the Supabase token into the terminal; in PowerShell:
   `$env:SUPABASE_ACCESS_TOKEN = (Get-Content .env | Where-Object { $_ -like 'EXPO_SUPABASE_ACCESS_TOKEN=*' }) -replace '^EXPO_SUPABASE_ACCESS_TOKEN=', ''`
   `npx supabase secrets set GEMINI_API_KEY=<key> --project-ref axcuqumgplgbuwlnzfpt`

## File Structure

| File | Responsibility |
|---|---|
| `supabase/functions/ocr/shared.ts` (new) | Runtime-agnostic contract + pure logic shared by function and app: limits, bucket, path, payload validation, text clamp, UUID check, constant-time compare |
| `supabase/functions/ocr/index.ts` (new) | Edge Function: auth, scan (new/replay), delete, purge; does the provider `fetch` calls |
| `supabase/functions/ocr/ocrProviders.ts` (new, amendment) | Pure, import-free: Vision + Gemini request builders and response parsers, Vision → Gemini fallback loop |
| `supabase/functions/ocr/deno.json` (new) | Import map for the function |
| `supabase/config.toml` (modify) | `[functions.ocr] verify_jwt = false` |
| `supabase/migrations/0008_ocr_scans.sql` (new) | Ledger table, RLS, quota/replay/dedupe/reconcile function, bucket, storage read policy |
| `supabase/migrations/0009_ocr_account_cleanup.sql` (new) | `pg_net` + `auth.users` delete trigger |
| `src/domain/ocr.ts` (new) | Client-only pure helpers: size estimate, limit message, request id |
| `src/lib/prepareScanImage.ts` (new) | Resize/re-encode a picked image to JPEG base64 |
| `src/stores/useScanStore.ts` (new) | In-memory handoff of the picked image to the Add Transaction screen |
| `src/hooks/useOcr.ts` (new) | Scan mutation (+retry), scan list, delete mutation, signed download URL, error mapping |
| `src/components/AddTransactionSheet.tsx` (modify) | 3 options + privacy note |
| `src/components/AddTransactionFab.tsx` (modify) | Pick → prepare → tag requestId → store → navigate |
| `app/(tabs)/transaction/new.tsx` (modify) | Per-`visit` content (tab screens stay mounted); consume store, run OCR once, Skip, prefill note, truncation notice; drop `photoUri` |
| `src/components/TransactionForm.tsx` (modify) | Partial `initialValues`; multiline note |
| `src/components/TransactionListItem.tsx` (modify) | Let the text column shrink; clamp long notes to 2 lines |
| `app/(tabs)/settings.tsx` (modify) | "Scanned Receipts" card |
| `tsconfig.json`, `jest.config.js`, `app.json` (modify) | Exclude Deno code; map lucide to CJS; picker permissions |
| `CLAUDE.md`, `README.md` (modify) | Architecture, deploy, setup, orphan check |

---

### Task 1: Shared OCR module

**Files:**
- Create: `supabase/functions/ocr/shared.ts`
- Test: `__tests__/functions/ocrShared.test.ts`

**Interfaces:**
- Produces: `OCR_BUCKET = 'budget-tracker-ocr'`; `MAX_IMAGE_BYTES = 1572864`; `MAX_OCR_TEXT_CHARS = 20000`; `type AllowedImageType`; `type OcrLimitReason = 'user_hourly' | 'user_daily' | 'global_daily' | 'global_monthly'`; `interface OcrScanResult { scanId: string; text: string; path: string; truncated: boolean }`; `isUuid(value: unknown): value is string`; `ocrScanPath(userId: string, scanId: string): string`; `sniffImageType(bytes: Uint8Array): AllowedImageType | null`; `decodeBase64(b64: string): Uint8Array | null`; `validateImagePayload(body: unknown): { ok: true; imageBase64: string; bytes: Uint8Array; mimeType: AllowedImageType; requestId: string } | { ok: false; error: 'invalid_request' | 'unsupported_type' | 'too_large' | 'type_mismatch' }`; `clampOcrText(text: string): { text: string; truncated: boolean }`; `timingSafeEqual(a: string, b: string): boolean`.

- [ ] **Step 0: Save this plan into the repo**

Copy this file to `docs/superpowers/plans/2026-10-05-receipt-ocr.md` (repo convention), then:
```bash
git add docs/superpowers/plans/2026-10-05-receipt-ocr.md
git commit -m "docs: add receipt OCR implementation plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 1: Write the failing test**

Create `__tests__/functions/ocrShared.test.ts`:
```typescript
import {
  MAX_IMAGE_BYTES,
  MAX_OCR_TEXT_CHARS,
  sniffImageType,
  decodeBase64,
  validateImagePayload,
  clampOcrText,
  isUuid,
  ocrScanPath,
  timingSafeEqual,
} from '../../supabase/functions/ocr/shared';

// Minimal headers: JPEG FF D8 FF E0, PNG 89 50 4E 47 0D 0A 1A 0A, WebP "RIFF" + 4 bytes + "WEBP".
const JPEG_B64 = '/9j/4A==';
const PNG_B64 = 'iVBORw0KGgo=';
const WEBP_B64 = 'UklGRgAAAABXRUJQ';
const REQUEST_ID = '3f8a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b';

describe('sniffImageType', () => {
  it('recognizes jpeg, png and webp headers', () => {
    expect(sniffImageType(decodeBase64(JPEG_B64)!)).toBe('image/jpeg');
    expect(sniffImageType(decodeBase64(PNG_B64)!)).toBe('image/png');
    expect(sniffImageType(decodeBase64(WEBP_B64)!)).toBe('image/webp');
  });

  it('returns null for anything else', () => {
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
  });
});

describe('decodeBase64', () => {
  it('returns null for invalid base64', () => {
    expect(decodeBase64('!!!')).toBeNull();
  });
});

describe('validateImagePayload', () => {
  it('accepts a matching jpeg payload and returns its decoded bytes', () => {
    expect(validateImagePayload({ imageBase64: JPEG_B64, mimeType: 'image/jpeg', requestId: REQUEST_ID })).toEqual({
      ok: true,
      imageBase64: JPEG_B64,
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      mimeType: 'image/jpeg',
      requestId: REQUEST_ID,
    });
  });

  it('rejects a missing or malformed body', () => {
    const invalid = { ok: false, error: 'invalid_request' };
    expect(validateImagePayload(null)).toEqual(invalid);
    expect(validateImagePayload({ imageBase64: JPEG_B64, requestId: REQUEST_ID })).toEqual(invalid);
    expect(validateImagePayload({ imageBase64: '!!!', mimeType: 'image/jpeg', requestId: REQUEST_ID })).toEqual(invalid);
    expect(validateImagePayload({ imageBase64: JPEG_B64, mimeType: 'image/jpeg' })).toEqual(invalid);
    expect(validateImagePayload({ imageBase64: JPEG_B64, mimeType: 'image/jpeg', requestId: 'abc' })).toEqual(invalid);
  });

  it('rejects unsupported types', () => {
    expect(validateImagePayload({ imageBase64: JPEG_B64, mimeType: 'image/gif', requestId: REQUEST_ID })).toEqual({
      ok: false,
      error: 'unsupported_type',
    });
  });

  it('rejects bytes that do not match the declared type', () => {
    expect(validateImagePayload({ imageBase64: PNG_B64, mimeType: 'image/jpeg', requestId: REQUEST_ID })).toEqual({
      ok: false,
      error: 'type_mismatch',
    });
  });

  it('rejects payloads over the size limit before decoding', () => {
    const tooBig = 'A'.repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4);
    expect(validateImagePayload({ imageBase64: tooBig, mimeType: 'image/jpeg', requestId: REQUEST_ID })).toEqual({
      ok: false,
      error: 'too_large',
    });
  });
});

describe('clampOcrText', () => {
  it('leaves text under the limit untouched', () => {
    expect(clampOcrText('TOTAL 12.50')).toEqual({ text: 'TOTAL 12.50', truncated: false });
  });

  it('cuts text over the limit and flags it', () => {
    const result = clampOcrText('x'.repeat(MAX_OCR_TEXT_CHARS + 50));
    expect(result.text).toHaveLength(MAX_OCR_TEXT_CHARS);
    expect(result.truncated).toBe(true);
  });

  it('never splits a surrogate pair at the cut', () => {
    const result = clampOcrText('a'.repeat(MAX_OCR_TEXT_CHARS - 1) + '😀' + 'b');
    expect(result.text).toBe('a'.repeat(MAX_OCR_TEXT_CHARS - 1));
    expect(result.truncated).toBe(true);
  });
});

describe('isUuid', () => {
  it('accepts uuids only', () => {
    expect(isUuid(REQUEST_ID)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe('ocrScanPath', () => {
  it('builds the per-user object path', () => {
    expect(ocrScanPath('u1', 's1')).toBe('u1/s1.txt');
  });
});

describe('timingSafeEqual', () => {
  it('compares strings without early exit semantics leaking into results', () => {
    expect(timingSafeEqual('secret-value', 'secret-value')).toBe(true);
    expect(timingSafeEqual('secret-value', 'secret-valuf')).toBe(false);
    expect(timingSafeEqual('secret', 'secret-value')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest ocrShared`
Expected: FAIL — `Cannot find module '../../supabase/functions/ocr/shared'`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/ocr/shared.ts`:
```typescript
// Imported by the Deno edge function (index.ts) AND by the app/Jest. Keep it one
// file with no imports: the root tsconfig has no allowImportingTsExtensions, and
// Deno needs `.ts` specifiers, so any import here would break one side.

export const OCR_BUCKET = 'budget-tracker-ocr';
// The client sends ≤ 1600px JPEGs (a few hundred KB); this only bounds abuse.
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_OCR_TEXT_CHARS = 20_000;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export type OcrLimitReason = 'user_hourly' | 'user_daily' | 'global_daily' | 'global_monthly';

export interface OcrScanResult {
  scanId: string;
  text: string;
  path: string;
  truncated: boolean;
}

export type ImagePayloadResult =
  | { ok: true; imageBase64: string; bytes: Uint8Array; mimeType: AllowedImageType; requestId: string }
  | { ok: false; error: 'invalid_request' | 'unsupported_type' | 'too_large' | 'type_mismatch' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function ocrScanPath(userId: string, scanId: string): string {
  return `${userId}/${scanId}.txt`;
}

function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function decodeBase64(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function validateImagePayload(body: unknown): ImagePayloadResult {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'invalid_request' };
  const { imageBase64, mimeType, requestId } = body as Record<string, unknown>;
  if (
    typeof imageBase64 !== 'string' ||
    typeof mimeType !== 'string' ||
    imageBase64.length === 0 ||
    !isUuid(requestId)
  ) {
    return { ok: false, error: 'invalid_request' };
  }
  if (!isAllowedImageType(mimeType)) return { ok: false, error: 'unsupported_type' };
  if (imageBase64.length > MAX_BASE64_LENGTH) return { ok: false, error: 'too_large' };

  const bytes = decodeBase64(imageBase64);
  if (!bytes) return { ok: false, error: 'invalid_request' };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: 'too_large' };
  if (sniffImageType(bytes) !== mimeType) return { ok: false, error: 'type_mismatch' };

  return { ok: true, imageBase64, bytes, mimeType, requestId };
}

export function clampOcrText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_OCR_TEXT_CHARS) return { text, truncated: false };
  let end = MAX_OCR_TEXT_CHARS;
  // Don't cut an emoji (two UTF-16 units) in half.
  const lastCode = text.charCodeAt(end - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) end -= 1;
  return { text: text.slice(0, end), truncated: true };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest ocrShared && npx tsc --noEmit`
Expected: PASS, 14 tests; tsc no output.

- [ ] **Step 5: Commit**
```bash
git add supabase/functions/ocr/shared.ts __tests__/functions/ocrShared.test.ts
git commit -m "feat: add shared OCR validation, text limit, and path helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Ledger, quota/replay/reconcile function, storage bucket

**Files:**
- Create: `supabase/migrations/0008_ocr_scans.sql`

**Interfaces:**
- Produces: table `budget_tracker.ocr_scans(id uuid, user_id uuid, request_id uuid, image_sha256 text, status text in ('pending','completed','failed','deleted'), char_count int null, created_at timestamptz)`, `unique (user_id, request_id)`; helper `budget_tracker.ocr_rolling_wait(p_user_id uuid, p_window interval, p_limit integer) returns integer`; function `budget_tracker.try_consume_ocr_quota(p_user_id uuid, p_request_id uuid, p_image_sha256 text) returns table(outcome text, scan_id uuid, scan_status text, retry_after_seconds integer, reason text)` with `outcome ∈ {'new','replay','blocked'}` and `reason ∈ {'global_monthly','user_daily','global_daily','user_hourly'}` when blocked; bucket `budget-tracker-ocr`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_ocr_scans.sql`:
```sql
create table budget_tracker.ocr_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Client-generated idempotency key: a retried request replays instead of
  -- calling Vision (and consuming quota) again.
  request_id uuid not null,
  -- SHA-256 of the image bytes (never the image itself): re-scanning an image
  -- the user already has a result for replays it instead of spending a
  -- free-tier Vision unit.
  image_sha256 text not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'deleted')),
  char_count integer,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index ocr_scans_user_created_idx on budget_tracker.ocr_scans (user_id, created_at desc);
create index ocr_scans_created_idx on budget_tracker.ocr_scans (created_at);
create index ocr_scans_user_image_idx on budget_tracker.ocr_scans (user_id, image_sha256);

alter table budget_tracker.ocr_scans enable row level security;

-- Read-only for users on purpose: rows double as the OCR rate-limit ledger,
-- so only the ocr edge function (service role) writes them. A user able to
-- delete rows could reset their own quota.
create policy "ocr_scans_select_own" on budget_tracker.ocr_scans
  for select using (auth.uid() = user_id);

-- Seconds until a rolling window drops back under p_limit, or null when it's
-- already under. p_user_id null = all users. When over, the p_limit-th newest
-- row is the one whose expiry frees a slot.
create or replace function budget_tracker.ocr_rolling_wait(p_user_id uuid, p_window interval, p_limit integer)
returns integer
language sql
stable
set search_path = budget_tracker, pg_temp
as $$
  select greatest(1, ceil(extract(epoch from (w.created_at + p_window - now()))))::integer
    from (
      select s.created_at
        from ocr_scans s
       where (p_user_id is null or s.user_id = p_user_id)
         and s.created_at > now() - p_window
       order by s.created_at desc
      offset p_limit - 1
       limit 1
    ) w;
$$;

create or replace function budget_tracker.try_consume_ocr_quota(p_user_id uuid, p_request_id uuid, p_image_sha256 text)
returns table (outcome text, scan_id uuid, scan_status text, retry_after_seconds integer, reason text)
language plpgsql
security definer
set search_path = budget_tracker, pg_temp
as $$
declare
  -- Google's free tier (1,000 units) resets on the Pacific Time calendar month.
  v_month_start timestamptz :=
    date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  v_count integer;
  v_wait integer;
  v_scan_id uuid;
  v_status text;
begin
  -- One global lock (not per-user) so the global cap can't be raced past by
  -- concurrent requests from different users. Volume is tiny.
  perform pg_advisory_xact_lock(hashtext('budget_tracker:ocr_quota'));

  -- Reconcile this user's stuck rows (function died mid-request, or the final
  -- status update failed after upload): the stored .txt is the source of truth.
  update ocr_scans s
     set status = case when exists (
           select 1 from storage.objects o
            where o.bucket_id = 'budget-tracker-ocr'
              and o.name = s.user_id::text || '/' || s.id::text || '.txt'
         ) then 'completed' else 'failed' end
   where s.user_id = p_user_id
     and s.status = 'pending'
     and s.created_at < now() - interval '10 minutes';

  select s.id, s.status into v_scan_id, v_status
    from ocr_scans s
   where s.user_id = p_user_id and s.request_id = p_request_id;
  if found then
    return query select 'replay'::text, v_scan_id, v_status, 0, null::text;
    return;
  end if;

  -- Same image already read for this user, and its .txt still exists: serve it.
  select s.id into v_scan_id
    from ocr_scans s
   where s.user_id = p_user_id
     and s.image_sha256 = p_image_sha256
     and s.status = 'completed'
     and exists (
       select 1 from storage.objects o
        where o.bucket_id = 'budget-tracker-ocr'
          and o.name = s.user_id::text || '/' || s.id::text || '.txt'
     )
   order by s.created_at desc
   limit 1;
  if found then
    return query select 'replay'::text, v_scan_id, 'completed'::text, 0, null::text;
    return;
  end if;

  -- Longest window first, so retry_after_seconds is the real wait when
  -- several limits are hit at once.
  select count(*) into v_count from ocr_scans s where s.created_at >= v_month_start;
  if v_count >= 900 then
    return query select 'blocked'::text, null::uuid, null::text,
      greatest(1, ceil(extract(epoch from (
        ((v_month_start at time zone 'America/Los_Angeles') + interval '1 month') at time zone 'America/Los_Angeles'
        - now()
      ))))::integer,
      'global_monthly'::text;
    return;
  end if;

  v_wait := ocr_rolling_wait(p_user_id, interval '24 hours', 20);
  if v_wait is not null then
    return query select 'blocked'::text, null::uuid, null::text, v_wait, 'user_daily'::text;
    return;
  end if;

  v_wait := ocr_rolling_wait(null, interval '24 hours', 40);
  if v_wait is not null then
    return query select 'blocked'::text, null::uuid, null::text, v_wait, 'global_daily'::text;
    return;
  end if;

  v_wait := ocr_rolling_wait(p_user_id, interval '1 hour', 5);
  if v_wait is not null then
    return query select 'blocked'::text, null::uuid, null::text, v_wait, 'user_hourly'::text;
    return;
  end if;

  insert into ocr_scans (user_id, request_id, image_sha256) values (p_user_id, p_request_id, p_image_sha256)
  returning id into v_scan_id;
  return query select 'new'::text, v_scan_id, 'pending'::text, 0, null::text;
end;
$$;

-- 0001's default privileges grant execute on new functions to anon and
-- authenticated; these must only be callable by the edge function.
revoke execute on function budget_tracker.ocr_rolling_wait(uuid, interval, integer) from public, anon, authenticated;
revoke execute on function budget_tracker.try_consume_ocr_quota(uuid, uuid, text) from public, anon, authenticated;
grant execute on function budget_tracker.try_consume_ocr_quota(uuid, uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('budget-tracker-ocr', 'budget-tracker-ocr', false, 1048576)
on conflict (id) do nothing;

-- Read own folder only. No user write/delete policies: the edge function
-- (service role) is the only writer.
create policy "budget_tracker_ocr_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'budget-tracker-ocr' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Push**

Run:
```bash
export SUPABASE_ACCESS_TOKEN=$(grep EXPO_SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
cat supabase/.temp/project-ref   # must print axcuqumgplgbuwlnzfpt (CLAUDE.md gotcha)
npx supabase db push
```
Expected: `Applying migration 0008_ocr_scans.sql...` then `Finished supabase db push.` If the storage policy fails with an ownership error, stop and report — don't work around it.

- [ ] **Step 3: Verify structure and privileges**

Run each with `npx supabase db query --linked "<sql>"`:
```sql
select policyname, cmd from pg_policies where schemaname = 'budget_tracker' and tablename = 'ocr_scans';
-- Expected: exactly one row: ocr_scans_select_own | SELECT

select conname from pg_constraint where conrelid = 'budget_tracker.ocr_scans'::regclass and contype = 'u';
-- Expected: ocr_scans_user_id_request_id_key

select has_function_privilege('authenticated', 'budget_tracker.try_consume_ocr_quota(uuid, uuid, text)', 'execute') as auth_exec,
       has_function_privilege('anon', 'budget_tracker.try_consume_ocr_quota(uuid, uuid, text)', 'execute') as anon_exec,
       has_function_privilege('service_role', 'budget_tracker.try_consume_ocr_quota(uuid, uuid, text)', 'execute') as service_exec,
       has_function_privilege('authenticated', 'budget_tracker.ocr_rolling_wait(uuid, interval, integer)', 'execute') as helper_exec;
-- Expected: false | false | true | false

select date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles' as pt_month_start;
-- Expected: the 1st of the current month at 07:00 or 08:00 UTC (PT midnight)

select id, public, file_size_limit from storage.buckets where id = 'budget-tracker-ocr';
-- Expected: budget-tracker-ocr | false | 1048576

select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'budget_tracker_ocr%';
-- Expected: budget_tracker_ocr_read_own
```
(Quota, replay, dedupe, and reconciliation behavior are tested live in Task 3 — they need real users for the FK.)

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/0008_ocr_scans.sql
git commit -m "feat: add OCR scan ledger with free-tier quota, replay, dedupe, and reconciliation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `ocr` Edge Function, deploy, live verification

**Files:**
- Create: `supabase/functions/ocr/index.ts`, `supabase/functions/ocr/deno.json`
- Modify: `tsconfig.json` (add exclude), `supabase/config.toml` (append function config)
- Test: `<scratch>/ocr-live-test.sh` (not committed), where `<scratch>` = `C:/Users/Lenovo/AppData/Local/Temp/claude/c--Users-Lenovo-ai-projects-Budget-management/4d89e7d9-6252-45db-92e9-7bd18358d707/scratchpad`

**Interfaces:**
- Consumes: everything in Task 1; `try_consume_ocr_quota`, `ocr_scans`, bucket (Task 2); `ocrProviders.ts` exports (Task 13 — committed before this task's code lands).
- Produces:
  - `POST /functions/v1/ocr` (Bearer user JWT) body `{ imageBase64, mimeType, requestId }` → 200 `OcrScanResult` (new scan, or replay by `requestId` / identical image) | 400 `{ error }` | 401 | 409 `{ error: 'in_progress' }` | 410 `{ error: 'deleted' }` | 429 `{ error: 'rate_limited', reason: OcrLimitReason, retryAfterSeconds }` + `Retry-After` | 500 `{ error: 'storage_failed' | 'quota_check_failed' }` | 502 `{ error: 'ocr_failed' }`.
  - `DELETE /functions/v1/ocr` (Bearer user JWT) body `{ scanId }` → 204 (also for already-deleted / missing file) | 400 | 404 | 409 `{ error: 'not_deletable' }` | 500.
  - `POST /functions/v1/ocr` with header `x-ocr-webhook-secret` body `{ userId }` → 200 `{ removed: number }` | 400 | 401 | 409 `{ error: 'user_exists' }` (account still exists — refuses to purge) — used by Task 4's trigger.

- [ ] **Step 1: Exclude Deno code from the root type-check; disable gateway JWT check**

`tsconfig.json` — add after `"include": [...]`:
```json
  "exclude": [
    "node_modules",
    "babel.config.js",
    "metro.config.js",
    "jest.config.js",
    "android",
    "ios",
    "supabase/functions"
  ]
```
An `exclude` here **replaces** the one inherited from `expo/tsconfig.base` (TypeScript doesn't merge it), so the base's entries are repeated. Without `node_modules`, the `**/*.ts` include would type-check every `.ts` file under `node_modules`. (`shared.ts` is still type-checked through the app/test files that import it — intended.)

Append to `supabase/config.toml`:
```toml
# Auth is enforced inside the function on every path (user JWT, or the shared
# secret for the auth.users delete trigger, which can't carry a user JWT).
[functions.ocr]
verify_jwt = false
```

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Write the function**

Create `supabase/functions/ocr/deno.json` — pinned to the app's exact supabase-js (2.110.7, from `package.json`) via npm, which also provides the `/cors` subpath export; the trailing-slash entry maps subpaths:
```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.110.7",
    "@supabase/supabase-js/": "npm:/@supabase/supabase-js@2.110.7/"
  }
}
```

Create `supabase/functions/ocr/index.ts`:
```typescript
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
  type OcrScanResult,
} from './shared.ts';
import {
  DEFAULT_GEMINI_MODEL,
  VISION_URL,
  buildGeminiBody,
  buildVisionBody,
  geminiUrl,
  parseGeminiResponse,
  parseVisionResponse,
  readWithFallback,
  type ProviderAttempt,
} from './ocrProviders.ts';

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

async function postJson(url: string, apiKey: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    // Key in a header, not the URL, so it can't leak through logged URLs.
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// Vision first (when configured), Gemini as the fallback (when configured).
function ocrAttempts(imageBase64: string, mimeType: string): ProviderAttempt[] {
  const attempts: ProviderAttempt[] = [];
  const visionKey = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (visionKey) {
    attempts.push({
      name: 'vision',
      run: async () => {
        const { status, json } = await postJson(VISION_URL, visionKey, buildVisionBody(imageBase64));
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
        const { status, json } = await postJson(geminiUrl(model), geminiKey, buildGeminiBody(imageBase64, mimeType));
        return parseGeminiResponse(status, json);
      },
    });
  }
  return attempts;
}

async function runNewScan(
  admin: AdminClient,
  userId: string,
  scanId: string,
  imageBase64: string,
  mimeType: string
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
  const { error: uploadError } = await admin.storage
    .from(OCR_BUCKET)
    .upload(path, new Blob([text], { type: 'text/plain;charset=utf-8' }), {
      contentType: 'text/plain;charset=utf-8',
      upsert: false,
    });
  if (uploadError) {
    await markFailed(admin, scanId);
    console.error('ocr: upload failed', { scanId });
    return json(500, { error: 'storage_failed' });
  }

  if (!(await markCompleted(admin, scanId, text.length))) {
    console.error('ocr: status update failed after upload; left for reconciliation', { scanId });
  }
  const result: OcrScanResult = { scanId, text, path, truncated };
  return json(200, result);
}

// Same requestId again (client retry, lost response) or an image this user already
// scanned: never spend another Vision unit.
async function replayScan(admin: AdminClient, userId: string, scanId: string, status: string): Promise<Response> {
  if (status === 'failed') return json(502, { error: 'ocr_failed' });
  if (status === 'deleted') return json(410, { error: 'deleted' });

  const path = ocrScanPath(userId, scanId);
  const { data: file } = await admin.storage.from(OCR_BUCKET).download(path);
  if (!file) {
    // 'completed' without its .txt: gone. 'pending' without a .txt: the original
    // request is still running (or died before uploading).
    return status === 'completed' ? json(410, { error: 'deleted' }) : json(409, { error: 'in_progress' });
  }

  const text = await file.text();
  if (status === 'pending') await markCompleted(admin, scanId, text.length); // upload landed, status didn't
  const result: OcrScanResult = { scanId, text, path, truncated: text.length >= MAX_OCR_TEXT_CHARS };
  return json(200, result);
}

async function scanImage(admin: AdminClient, userId: string, body: unknown): Promise<Response> {
  const payload = validateImagePayload(body);
  if (!payload.ok) return json(400, { error: payload.error });

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
  if (quota.outcome === 'replay') return replayScan(admin, userId, quota.scan_id, quota.scan_status);
  return runNewScan(admin, userId, quota.scan_id, payload.imageBase64, payload.mimeType);
}

async function deleteScan(admin: AdminClient, userId: string, body: unknown): Promise<Response> {
  const scanId = (body as { scanId?: unknown } | null)?.scanId;
  if (!isUuid(scanId)) return json(400, { error: 'invalid_request' });

  const { data: scan } = await admin
    .from('ocr_scans')
    .select('status')
    .eq('id', scanId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!scan) return json(404, { error: 'not_found' });
  if (scan.status === 'deleted') return noContent(); // idempotent
  if (scan.status !== 'completed') return json(409, { error: 'not_deletable' });

  // remove() succeeds for paths that don't exist, so a .txt that's already gone
  // (manual cleanup, or an earlier delete whose row update failed) just proceeds.
  const { error: removeError } = await admin.storage.from(OCR_BUCKET).remove([ocrScanPath(userId, scanId)]);
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
  const { data: existing } = await admin.auth.admin.getUserById(userId);
  if (existing?.user) return json(409, { error: 'user_exists' });

  let removed = 0;
  // Bounded: each pass lists then removes up to 100 files.
  for (let pass = 0; pass < 100; pass++) {
    const { data: files, error: listError } = await admin.storage.from(OCR_BUCKET).list(userId, { limit: 100 });
    if (listError) return json(500, { error: 'storage_failed' });
    if (!files || files.length === 0) break;
    const { error: removeError } = await admin.storage
      .from(OCR_BUCKET)
      .remove(files.map((file) => `${userId}/${file.name}`));
    if (removeError) return json(500, { error: 'storage_failed' });
    removed += files.length;
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
```

- [ ] **Step 3: Confirm the OCR secrets exist (prerequisite)**

Run: `npx supabase secrets list --project-ref axcuqumgplgbuwlnzfpt` (print names only)
Expected: `GOOGLE_VISION_API_KEY` and `GEMINI_API_KEY` both listed. Either one alone is a valid deployment, but this rollout's live test relies on Gemini while Vision billing is off. If `GEMINI_API_KEY` is missing, **stop and ask the user** to run Prerequisite step 4.

- [ ] **Step 4: Deploy**

Run:
```bash
export SUPABASE_ACCESS_TOKEN=$(grep EXPO_SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
npx supabase functions deploy ocr --use-api --no-verify-jwt --project-ref axcuqumgplgbuwlnzfpt
```
Expected: `Deployed Functions on project axcuqumgplgbuwlnzfpt: ocr`.

- [ ] **Step 5: Create the test image**

PowerShell:
```powershell
Add-Type -AssemblyName System.Drawing
$out = 'C:\Users\Lenovo\AppData\Local\Temp\claude\c--Users-Lenovo-ai-projects-Budget-management\4d89e7d9-6252-45db-92e9-7bd18358d707\scratchpad\receipt.png'
$bmp = New-Object System.Drawing.Bitmap 800, 300
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font 'Arial', 40
$g.DrawString('COFFEE SHOP', $font, [System.Drawing.Brushes]::Black, 20, 30)
$g.DrawString('TOTAL 12.50', $font, [System.Drawing.Brushes]::Black, 20, 150)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
```
Expected: `receipt.png` exists in the scratchpad.

- [ ] **Step 6: Write and run the live test script**

Two throwaway users via the admin API with `email_confirm: true` (no email sent, avoids the 2/hour mailer limit), on the plus-address pattern the user approved earlier. The service key is fetched at runtime into a shell variable only. The cleanup trap removes their files through the Storage API (the Task 4 trigger doesn't exist yet), then deletes the users. Only section #2 reaches an OCR provider, costing one request: Vision, or Gemini when Vision fails. Every other check is a replay, a rejection, or SQL. **While Vision billing is disabled, a `200` in section #2 can only have come from the Gemini fallback**, so a passing run proves the fallback end to end. Vision itself fails fast with a 403 and is not charged.

Save as `<scratch>/ocr-live-test.sh`:
```bash
#!/usr/bin/env bash
set -uo pipefail
cd "c:/Users/Lenovo/ai-projects/Budget-management"
SCRATCH="C:/Users/Lenovo/AppData/Local/Temp/claude/c--Users-Lenovo-ai-projects-Budget-management/4d89e7d9-6252-45db-92e9-7bd18358d707/scratchpad"
REF=axcuqumgplgbuwlnzfpt
BUCKET=budget-tracker-ocr
export SUPABASE_ACCESS_TOKEN=$(grep EXPO_SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
URL=$(grep EXPO_PUBLIC_SUPABASE_URL .env | cut -d= -f2)
ANON=$(grep EXPO_PUBLIC_SUPABASE_ANON_KEY .env | cut -d= -f2)
SERVICE=$(curl -s "https://api.supabase.com/v1/projects/$REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | node -e "
  const keys = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const k = keys.find(k => k.name === 'service_role') ?? keys.find(k => k.type === 'secret');
  process.stdout.write(k.api_key);")
FAILED=0
check() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (expected '$3', got '$2')"; FAILED=1; fi; }
field() { node -e "const j = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); process.stdout.write(String(($2)(j)))" "$1"; }
sql() { npx supabase db query --linked "$1" 2>&1 | node -e "
  const s = require('fs').readFileSync(0, 'utf8');
  const j = JSON.parse(s.slice(s.indexOf('{')));
  const v = Object.values((j.rows || [])[0] || {})[0];
  process.stdout.write(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));"; }
new_uuid() { node -e "process.stdout.write(require('crypto').randomUUID())"; }
TS=$(date +%s)
create_user() { curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"Test1234!ocr\",\"email_confirm\":true}" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).id)"; }
token_for() { curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$1\",\"password\":\"Test1234!ocr\"}" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).access_token)"; }
service_upload() { curl -s -o /dev/null -X POST "$URL/storage/v1/object/$BUCKET/$1" -H "apikey: $SERVICE" \
  -H "Authorization: Bearer $SERVICE" -H "Content-Type: text/plain" --data-binary "$2"; }
remove_folder() {
  local names; names=$(sql "select coalesce(json_agg(name), '[]'::json) from storage.objects where bucket_id = '$BUCKET' and name like '$1/%';")
  curl -s -o /dev/null -X DELETE "$URL/storage/v1/object/$BUCKET" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Type: application/json" -d "{\"prefixes\":$names}"
}
object_count() { sql "select count(*) from storage.objects where bucket_id = '$BUCKET' and name = '$1';"; }
EMAIL_A="cjcaber09+ocrtest-a-$TS@gmail.com"; EMAIL_B="cjcaber09+ocrtest-b-$TS@gmail.com"
USER_A=$(create_user "$EMAIL_A"); USER_B=$(create_user "$EMAIL_B")
cleanup() {
  remove_folder "$USER_A"; remove_folder "$USER_B"
  for u in "$USER_A" "$USER_B"; do
    curl -s -o /dev/null -X DELETE "$URL/auth/v1/admin/users/$u" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"
  done
  echo "cleanup: test files and users deleted"
}
trap cleanup EXIT
TOKEN_A=$(token_for "$EMAIL_A"); TOKEN_B=$(token_for "$EMAIL_B")
count_a() { sql "select count(*) from budget_tracker.ocr_scans where user_id = '$USER_A';"; }
status_of() { sql "select status from budget_tracker.ocr_scans where id = '$1';"; }
invoke() { curl -s -o "$SCRATCH/resp.json" -w "%{http_code}" -X "$2" "$URL/functions/v1/ocr" \
  -H "Authorization: Bearer $1" -H "apikey: $ANON" -H "Content-Type: application/json" --data-binary "$3"; }
payload() { # $1 mime, $2 requestId or "-" to omit -> path of a payload file
  node -e "
    const fs = require('fs'); const [dir, mime, rid] = process.argv.slice(1);
    const body = { imageBase64: fs.readFileSync(dir + '/receipt.png').toString('base64'), mimeType: mime };
    if (rid !== '-') body.requestId = rid;
    fs.writeFileSync(dir + '/payload.json', JSON.stringify(body));" "$SCRATCH" "$1" "$2"
  echo "@$SCRATCH/payload.json"; }

R1=$(new_uuid)
# 1. Auth and validation
check "no token -> 401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/ocr" -d '{}')" "401"
check "web preflight allows DELETE + SDK headers" "$(curl -s -o /dev/null -D - -X OPTIONS "$URL/functions/v1/ocr" \
  -H 'Origin: http://localhost:8081' -H 'Access-Control-Request-Method: DELETE' \
  -H 'Access-Control-Request-Headers: authorization,x-client-info,apikey,content-type' \
  | grep -qiE '^access-control-allow-headers:.*x-client-info' && echo yes || echo no)" "yes"
check "missing requestId -> 400" "$(invoke "$TOKEN_A" POST "$(payload image/png -)")" "400"
check "type mismatch -> 400" "$(invoke "$TOKEN_A" POST "$(payload image/jpeg "$R1")")" "400"
check "rejections consumed no quota" "$(count_a)" "0"
# 2. New scan (the only Vision call in this script)
check "real image -> 200" "$(invoke "$TOKEN_A" POST "$(payload image/png "$R1")")" "200"
check "text contains TOTAL" "$(field "$SCRATCH/resp.json" 'j => /TOTAL/.test(j.text)')" "true"
check "not truncated" "$(field "$SCRATCH/resp.json" 'j => j.truncated')" "false"
SCAN_1=$(field "$SCRATCH/resp.json" 'j => j.scanId'); PATH_1="$USER_A/$SCAN_1.txt"
check "row completed" "$(status_of "$SCAN_1")" "completed"
check ".txt stored" "$(object_count "$PATH_1")" "1"
# 3. Idempotent replay: same requestId -> same result, no new row, no Vision call
check "replay -> 200" "$(invoke "$TOKEN_A" POST "$(payload image/png "$R1")")" "200"
check "replay same scanId" "$(field "$SCRATCH/resp.json" 'j => j.scanId')" "$SCAN_1"
check "replay added no row" "$(count_a)" "1"
# 3b. Same image, new requestId (user re-picked the file) -> served from the saved .txt, no Vision call
check "same image -> 200" "$(invoke "$TOKEN_A" POST "$(payload image/png "$(new_uuid)")")" "200"
check "same image same scanId" "$(field "$SCRATCH/resp.json" 'j => j.scanId')" "$SCAN_1"
check "same image added no row" "$(count_a)" "1"
# 4. Owner can sign + download; other user can't sign
curl -s -X POST "$URL/storage/v1/object/sign/$BUCKET/$PATH_1" -H "Authorization: Bearer $TOKEN_A" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d '{"expiresIn":60}' > "$SCRATCH/sign.json"
check "owner download has text" "$(curl -s "$URL/storage/v1$(field "$SCRATCH/sign.json" 'j => j.signedURL')" | grep -c TOTAL)" "1"
check "other user cannot sign" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/storage/v1/object/sign/$BUCKET/$PATH_1" \
  -H "Authorization: Bearer $TOKEN_B" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"expiresIn":60}' | grep -c '^200$')" "0"
# 5. No bypass via PostgREST or Storage
curl -s -o /dev/null -X DELETE "$URL/rest/v1/ocr_scans?user_id=eq.$USER_A" -H "Authorization: Bearer $TOKEN_A" \
  -H "apikey: $ANON" -H "Accept-Profile: budget_tracker" -H "Content-Profile: budget_tracker"
check "direct row delete blocked" "$(count_a)" "1"
check "direct rpc blocked" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/rest/v1/rpc/try_consume_ocr_quota" \
  -H "Authorization: Bearer $TOKEN_A" -H "apikey: $ANON" -H "Content-Profile: budget_tracker" -H "Content-Type: application/json" \
  -d "{\"p_user_id\":\"$USER_A\",\"p_request_id\":\"$(new_uuid)\",\"p_image_sha256\":\"test\"}" | grep -c '^200$')" "0"
check "direct rpc added no row" "$(count_a)" "1"
curl -s -o /dev/null -X DELETE "$URL/storage/v1/object/$BUCKET/$PATH_1" -H "Authorization: Bearer $TOKEN_A" -H "apikey: $ANON"
check "direct storage delete blocked" "$(object_count "$PATH_1")" "1"
# 6. Upload landed but status update failed -> replay completes it
sql "update budget_tracker.ocr_scans set status = 'pending' where id = '$SCAN_1';" >/dev/null
check "replay of stuck row -> 200" "$(invoke "$TOKEN_A" POST "$(payload image/png "$R1")")" "200"
check "stuck row now completed" "$(status_of "$SCAN_1")" "completed"
# 7. Same requestId still running (pending, no .txt) -> 409
R2=$(new_uuid)
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256) values ('$USER_A', '$R2', 'test');" >/dev/null
check "in progress -> 409" "$(invoke "$TOKEN_A" POST "$(payload image/png "$R2")")" "409"
# 8. Lazy reconciliation of rows stuck > 10 min (P1: no .txt, P2: .txt present)
P1=$(new_uuid); P2=$(new_uuid)
sql "insert into budget_tracker.ocr_scans (id, user_id, request_id, image_sha256, created_at) values ('$P1', '$USER_A', gen_random_uuid(), 'test', now() - interval '15 minutes'), ('$P2', '$USER_A', gen_random_uuid(), 'test', now() - interval '15 minutes');" >/dev/null
service_upload "$USER_A/$P2.txt" "reconciled text"
invoke "$TOKEN_A" POST "$(payload image/png "$R1")" >/dev/null   # any call runs reconciliation first
check "stuck row without .txt -> failed" "$(status_of "$P1")" "failed"
check "stuck row with .txt -> completed" "$(status_of "$P2")" "completed"
# 9. Delete: works, is idempotent, and tolerates a missing file
check "delete -> 204" "$(invoke "$TOKEN_A" DELETE "{\"scanId\":\"$SCAN_1\"}")" "204"
check "file removed" "$(object_count "$PATH_1")" "0"
check "row kept as deleted" "$(status_of "$SCAN_1")" "deleted"
check "delete again -> 204" "$(invoke "$TOKEN_A" DELETE "{\"scanId\":\"$SCAN_1\"}")" "204"
check "replay of deleted -> 410" "$(invoke "$TOKEN_A" POST "$(payload image/png "$R1")")" "410"
remove_folder "$USER_A"   # P2's .txt vanishes out from under its 'completed' row
check "delete with missing file -> 204" "$(invoke "$TOKEN_A" DELETE "{\"scanId\":\"$P2\"}")" "204"
check "row marked deleted" "$(status_of "$P2")" "deleted"
# 10. Per-user hourly limit (5) -> 429 with no new row (A has 4 rows this hour; add 1).
#     SCAN_1 is deleted now, so the same image no longer dedupes and reaches the limits.
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256, status, created_at) select '$USER_A', gen_random_uuid(), 'test', 'completed', now() - interval '5 minutes' from generate_series(1, 1);" >/dev/null
check "user hourly -> 429" "$(invoke "$TOKEN_A" POST "$(payload image/png "$(new_uuid)")")" "429"
check "reason user_hourly" "$(field "$SCRATCH/resp.json" 'j => j.reason')" "user_hourly"
check "429 added no row" "$(count_a)" "5"
# 11. Global daily limit (40): A back to 1 row, B gets 40
sql "delete from budget_tracker.ocr_scans where user_id = '$USER_A' and id <> '$SCAN_1';" >/dev/null
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256, status, created_at) select '$USER_B', gen_random_uuid(), 'test', 'completed', now() - interval '1 minute' from generate_series(1, 40);" >/dev/null
check "global daily -> 429" "$(invoke "$TOKEN_A" POST "$(payload image/png "$(new_uuid)")")" "429"
check "reason global_daily" "$(field "$SCRATCH/resp.json" 'j => j.reason')" "global_daily"
# 11b. Free-tier monthly cap (900): checked first, so it wins even though the daily cap is also hit
sql "delete from budget_tracker.ocr_scans where user_id = '$USER_B';" >/dev/null
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256, status, created_at) select '$USER_B', gen_random_uuid(), 'test', 'completed', now() - interval '1 minute' from generate_series(1, 900);" >/dev/null
check "global monthly -> 429" "$(invoke "$TOKEN_A" POST "$(payload image/png "$(new_uuid)")")" "429"
check "reason global_monthly" "$(field "$SCRATCH/resp.json" 'j => j.reason')" "global_monthly"
check "waits until next PT month" "$(field "$SCRATCH/resp.json" 'j => j.retryAfterSeconds > 0 && j.retryAfterSeconds <= 31 * 86400')" "true"
# 12. Concurrency: A at 4 this hour, 5 parallel new requests -> exactly 1 'new'
sql "delete from budget_tracker.ocr_scans where user_id = '$USER_B';" >/dev/null
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256, status, created_at) select '$USER_A', gen_random_uuid(), 'test', 'completed', now() - interval '5 minutes' from generate_series(1, 3);" >/dev/null
for i in 1 2 3 4 5; do
  curl -s -X POST "$URL/rest/v1/rpc/try_consume_ocr_quota" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Profile: budget_tracker" -H "Content-Type: application/json" \
    -d "{\"p_user_id\":\"$USER_A\",\"p_request_id\":\"$(new_uuid)\",\"p_image_sha256\":\"concurrency-$i\"}" > "$SCRATCH/rpc_$i.json" &
done
wait
check "concurrency: exactly 1 new" "$(cat "$SCRATCH"/rpc_*.json | grep -o '"outcome":"new"' | wc -l | tr -d ' ')" "1"

if [ "$FAILED" = "0" ]; then echo "ALL LIVE CHECKS PASSED"; else echo "SOME LIVE CHECKS FAILED"; fi
```
Run: `bash "<scratch>/ocr-live-test.sh"`
Expected: every line `PASS: …`, then `ALL LIVE CHECKS PASSED`, then `cleanup: test files and users deleted`. Then confirm: `select count(*) from budget_tracker.ocr_scans;` → `0`, and `select count(*) from storage.objects where bucket_id = 'budget-tracker-ocr';` → `0`. Each run spends exactly 1 of the month's free Vision units.
If `real image -> 200` fails with 502, both providers failed. The function logs one `ocr: provider failed` line per provider, with `{ name, status, reason }`; read them in Dashboard → Edge Functions → ocr → Logs.
- A Vision `400` with a field-mask complaint: drop `?fields=…` from `VISION_URL` in `ocrProviders.ts`, redeploy, and rerun. A new run uses new users, so there's no stale state.
- A Gemini `404`/`NOT_FOUND`: the model ID was retired. Set the `GEMINI_MODEL` secret to a current Flash-Lite ID and rerun. No redeploy is needed.
- A Gemini `403`/`PERMISSION_DENIED`: the API key is wrong or restricted. Stop and ask the user.
- If the logs aren't reachable, don't deploy diagnostic variants. Report BLOCKED with the 502 and the steps you tried.

- [ ] **Step 7: Commit**
```bash
git add supabase/functions/ocr/index.ts supabase/functions/ocr/deno.json supabase/config.toml tsconfig.json
git commit -m "feat: add idempotent, free-tier-capped OCR edge function backed by Cloud Vision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Remove a user's files when their account is deleted

**Files:**
- Create: `supabase/migrations/0009_ocr_account_cleanup.sql`
- Test: `<scratch>/ocr-cleanup-setup.sh`, `<scratch>/ocr-cleanup-test.sh` (not committed)

**Interfaces:**
- Consumes: Task 3's purge route (`x-ocr-webhook-secret`, body `{ userId }`).
- Produces: trigger `on_auth_user_deleted_ocr_cleanup` on `auth.users`; Vault secrets `budget_tracker_ocr_function_url`, `budget_tracker_ocr_webhook_secret`; function secret `OCR_WEBHOOK_SECRET`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_ocr_account_cleanup.sql`:
```sql
create extension if not exists pg_net with schema extensions;

-- Deleting storage.objects rows in SQL would orphan the actual files, so the
-- cleanup goes through the Storage API in the ocr edge function. pg_net queues
-- the call inside this transaction and sends it after commit.
create or replace function budget_tracker.enqueue_ocr_account_cleanup()
returns trigger
language plpgsql
security definer
set search_path = budget_tracker, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'budget_tracker_ocr_function_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'budget_tracker_ocr_webhook_secret';

  -- Never block an account deletion over cleanup config.
  if v_url is null or v_secret is null then
    raise warning 'budget_tracker: OCR cleanup not configured; .txt files for a deleted user were left in storage';
    return old;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ocr-webhook-secret', v_secret),
    body := jsonb_build_object('userId', old.id),
    -- pg_net's default is 5 s; a cold-started function listing and removing
    -- files can take longer, and a timed-out call is never retried.
    timeout_milliseconds := 30000
  );
  return old;
end;
$$;

revoke execute on function budget_tracker.enqueue_ocr_account_cleanup() from public, anon, authenticated;

drop trigger if exists on_auth_user_deleted_ocr_cleanup on auth.users;
create trigger on_auth_user_deleted_ocr_cleanup
  after delete on auth.users
  for each row execute function budget_tracker.enqueue_ocr_account_cleanup();
```

- [ ] **Step 2: Push and verify structure**

Run:
```bash
export SUPABASE_ACCESS_TOKEN=$(grep EXPO_SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
npx supabase db push
```
Expected: `Applying migration 0009_ocr_account_cleanup.sql...`, `Finished supabase db push.`
Then via `npx supabase db query --linked`:
```sql
select extname from pg_extension where extname = 'pg_net';
-- Expected: pg_net
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by 1;
-- Expected: on_auth_user_created, on_auth_user_deleted_ocr_cleanup
select has_function_privilege('authenticated', 'budget_tracker.enqueue_ocr_account_cleanup()', 'execute');
-- Expected: false
```

- [ ] **Step 3: Set the shared secret (function + Vault)**

The secret is generated locally, kept in a shell variable, and never printed. Save as `<scratch>/ocr-cleanup-setup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "c:/Users/Lenovo/ai-projects/Budget-management"
REF=axcuqumgplgbuwlnzfpt
export SUPABASE_ACCESS_TOKEN=$(grep EXPO_SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
URL=$(grep EXPO_PUBLIC_SUPABASE_URL .env | cut -d= -f2)
SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
sql_value() { npx supabase db query --linked "$1" 2>&1 | node -e "
  const s = require('fs').readFileSync(0, 'utf8'); const j = JSON.parse(s.slice(s.indexOf('{')));
  process.stdout.write(String(Object.values((j.rows || [])[0] || {})[0] ?? ''));"; }
upsert_vault() { # $1 name, $2 value
  if [ "$(sql_value "select count(*) from vault.secrets where name = '$1';")" = "0" ]; then
    npx supabase db query --linked "select vault.create_secret('$2', '$1');" >/dev/null
  else
    npx supabase db query --linked "select vault.update_secret((select id from vault.secrets where name = '$1'), '$2');" >/dev/null
  fi
}
npx supabase secrets set OCR_WEBHOOK_SECRET="$SECRET" --project-ref "$REF" >/dev/null
upsert_vault budget_tracker_ocr_function_url "$URL/functions/v1/ocr"
upsert_vault budget_tracker_ocr_webhook_secret "$SECRET"
npx supabase functions deploy ocr --use-api --no-verify-jwt --project-ref "$REF" >/dev/null
echo "cleanup secret configured (function + vault), function redeployed"
```
Run: `bash "<scratch>/ocr-cleanup-setup.sh"`
Expected: `cleanup secret configured (function + vault), function redeployed`.

- [ ] **Step 4: Live test the cleanup**

Save as `<scratch>/ocr-cleanup-test.sh`:
```bash
#!/usr/bin/env bash
set -uo pipefail
cd "c:/Users/Lenovo/ai-projects/Budget-management"
REF=axcuqumgplgbuwlnzfpt
BUCKET=budget-tracker-ocr
export SUPABASE_ACCESS_TOKEN=$(grep EXPO_SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
URL=$(grep EXPO_PUBLIC_SUPABASE_URL .env | cut -d= -f2)
SERVICE=$(curl -s "https://api.supabase.com/v1/projects/$REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | node -e "
  const keys = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const k = keys.find(k => k.name === 'service_role') ?? keys.find(k => k.type === 'secret');
  process.stdout.write(k.api_key);")
FAILED=0
check() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (expected '$3', got '$2')"; FAILED=1; fi; }
sql() { npx supabase db query --linked "$1" 2>&1 | node -e "
  const s = require('fs').readFileSync(0, 'utf8'); const j = JSON.parse(s.slice(s.indexOf('{')));
  process.stdout.write(String(Object.values((j.rows || [])[0] || {})[0] ?? ''));"; }
SECRET=$(sql "select decrypted_secret from vault.decrypted_secrets where name = 'budget_tracker_ocr_webhook_secret';")
purge() { curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/ocr" -H "Content-Type: application/json" \
  -H "x-ocr-webhook-secret: $1" -d "$2"; }

check "wrong secret -> 401" "$(purge wrong-secret '{"userId":"3f8a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b"}')" "401"
check "right secret, bad userId -> 400" "$(purge "$SECRET" '{"userId":"nope"}')" "400"

USER_C=$(curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"cjcaber09+ocrtest-c-$(date +%s)@gmail.com\",\"password\":\"Test1234!ocr\",\"email_confirm\":true}" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).id)")
for f in a b; do
  curl -s -o /dev/null -X POST "$URL/storage/v1/object/$BUCKET/$USER_C/$f.txt" -H "apikey: $SERVICE" \
    -H "Authorization: Bearer $SERVICE" -H "Content-Type: text/plain" --data-binary "file $f"
done
check "files present before delete" "$(sql "select count(*) from storage.objects where bucket_id = '$BUCKET' and name like '$USER_C/%';")" "2"
check "purge of a live account -> 409" "$(purge "$SECRET" "{\"userId\":\"$USER_C\"}")" "409"
check "live account's files untouched" "$(sql "select count(*) from storage.objects where bucket_id = '$BUCKET' and name like '$USER_C/%';")" "2"

curl -s -o /dev/null -X DELETE "$URL/auth/v1/admin/users/$USER_C" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"
REMAINING=2
for i in $(seq 1 20); do
  REMAINING=$(sql "select count(*) from storage.objects where bucket_id = '$BUCKET' and name like '$USER_C/%';")
  [ "$REMAINING" = "0" ] && break
  sleep 1
done
check "account delete purged files" "$REMAINING" "0"
check "pg_net call succeeded" "$(sql "select status_code from net._http_response order by created desc limit 1;")" "200"

if [ "$FAILED" = "0" ]; then echo "ALL CLEANUP CHECKS PASSED"; else echo "SOME CLEANUP CHECKS FAILED"; fi
```
Run: `bash "<scratch>/ocr-cleanup-test.sh"`
Expected: every line `PASS: …`, then `ALL CLEANUP CHECKS PASSED`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/0009_ocr_account_cleanup.sql
git commit -m "feat: purge a user's OCR files when their account is deleted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client OCR domain helpers

**Files:**
- Create: `src/domain/ocr.ts`
- Test: `__tests__/domain/ocr.test.ts`

**Interfaces:**
- Consumes: `OcrLimitReason`, `isUuid` (Task 1).
- Produces: `estimateBase64Bytes(base64: string): number`; `formatOcrLimitMessage(reason: OcrLimitReason, retryAfterSeconds: number): string`; `createRequestId(): string` (UUID v4).

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/ocr.test.ts`:
```typescript
import { estimateBase64Bytes, formatOcrLimitMessage, createRequestId } from '../../src/domain/ocr';
import { isUuid } from '../../supabase/functions/ocr/shared';

describe('estimateBase64Bytes', () => {
  it('accounts for padding', () => {
    expect(estimateBase64Bytes('QUJD')).toBe(3);
    expect(estimateBase64Bytes('QUI=')).toBe(2);
    expect(estimateBase64Bytes('QQ==')).toBe(1);
  });
});

describe('formatOcrLimitMessage', () => {
  it('formats per-user limits in minutes', () => {
    expect(formatOcrLimitMessage('user_hourly', 720)).toBe('Scan limit reached — try again in 12 min.');
  });

  it('never shows less than a minute', () => {
    expect(formatOcrLimitMessage('user_daily', 10)).toBe('Scan limit reached — try again in 1 min.');
  });

  it('formats long waits in hours and uses the global wording', () => {
    expect(formatOcrLimitMessage('global_daily', 3 * 3600)).toBe(
      'Scanning is busy right now — try again in 3 h.'
    );
  });

  it('explains the monthly free-tier cap in days', () => {
    expect(formatOcrLimitMessage('global_monthly', 10 * 86400)).toBe(
      'Monthly scan limit reached — try again in 10 days.'
    );
  });
});

describe('createRequestId', () => {
  it('produces distinct v4 uuids the server accepts', () => {
    const a = createRequestId();
    const b = createRequestId();
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('4');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest domain/ocr`
Expected: FAIL — `Cannot find module '../../src/domain/ocr'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/ocr.ts`:
```typescript
import type { OcrLimitReason } from '../../supabase/functions/ocr/shared';

export function estimateBase64Bytes(base64: string): number {
  let padding = 0;
  if (base64.endsWith('==')) padding = 2;
  else if (base64.endsWith('=')) padding = 1;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function formatWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.ceil(hours / 24)} days`;
}

export function formatOcrLimitMessage(reason: OcrLimitReason, retryAfterSeconds: number): string {
  const wait = formatWait(retryAfterSeconds);
  if (reason === 'global_monthly') return `Monthly scan limit reached — try again in ${wait}.`;
  if (reason === 'global_daily') return `Scanning is busy right now — try again in ${wait}.`;
  return `Scan limit reached — try again in ${wait}.`;
}

// Idempotency key, unique per user on the server (unique (user_id, request_id)).
// It isn't a secret, so Math.random is enough and avoids a crypto dependency.
export function createRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest domain/ocr && npx tsc --noEmit`
Expected: PASS, 6 tests; tsc no output.

- [ ] **Step 5: Commit**
```bash
git add src/domain/ocr.ts __tests__/domain/ocr.test.ts
git commit -m "feat: add client OCR helpers for size checks, limit messages, and request ids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Image normalization + scan handoff store

**Files:**
- Create: `src/lib/prepareScanImage.ts`, `src/stores/useScanStore.ts`
- Modify: `package.json`/`package-lock.json` (via `npx expo install`), `app.json` (image-picker plugin options)
- Test: `__tests__/lib/prepareScanImage.test.ts`

**Interfaces:**
- Produces: `interface PreparedScanImage { uri: string; base64: string; mimeType: 'image/jpeg' }`; `interface PendingScanImage extends PreparedScanImage { requestId: string }`; `useScanStore` with `{ pendingImage: PendingScanImage | null; setPendingImage(image: PendingScanImage): void; clearPendingImage(): void }`; `prepareScanImage(source: { uri: string; width: number; height: number }): Promise<PreparedScanImage>`.

- [ ] **Step 1: Install and confirm the manipulator API**

Run:
```bash
npx expo install expo-image-manipulator
grep -nE "manipulate\(|SaveFormat|renderAsync|saveAsync" node_modules/expo-image-manipulator/build/*.d.ts | head
```
Expected: `ImageManipulator.manipulate`, `renderAsync`, `saveAsync`, `SaveFormat` present. If only `manipulateAsync` is exported, use the alternative in Step 4 instead.

- [ ] **Step 2: Write the failing test**

Create `__tests__/lib/prepareScanImage.test.ts`:
```typescript
const mockResize = jest.fn();
const mockSaveAsync = jest.fn();
const mockRenderAsync = jest.fn(async () => ({ saveAsync: mockSaveAsync }));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn(() => ({ resize: mockResize, renderAsync: mockRenderAsync })) },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { prepareScanImage } from '../../src/lib/prepareScanImage';

describe('prepareScanImage', () => {
  beforeEach(() => {
    mockResize.mockReset();
    mockSaveAsync.mockReset().mockResolvedValue({ uri: 'file:///out.jpg', base64: 'QUJD', width: 1, height: 1 });
  });

  it('caps the long edge of a landscape image at 1600px', async () => {
    await prepareScanImage({ uri: 'file:///in.jpg', width: 4000, height: 3000 });
    expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
  });

  it('caps the long edge of a portrait image at 1600px', async () => {
    await prepareScanImage({ uri: 'file:///in.jpg', width: 3000, height: 4000 });
    expect(mockResize).toHaveBeenCalledWith({ height: 1600 });
  });

  it('does not upscale small images', async () => {
    await prepareScanImage({ uri: 'file:///in.jpg', width: 800, height: 600 });
    expect(mockResize).not.toHaveBeenCalled();
  });

  it('re-encodes to jpeg and returns base64', async () => {
    const image = await prepareScanImage({ uri: 'file:///in.jpg', width: 800, height: 600 });
    expect(mockSaveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.6, base64: true });
    expect(image).toEqual({ uri: 'file:///out.jpg', base64: 'QUJD', mimeType: 'image/jpeg' });
  });

  it('throws when no base64 comes back', async () => {
    mockSaveAsync.mockResolvedValue({ uri: 'file:///out.jpg', width: 1, height: 1 });
    await expect(prepareScanImage({ uri: 'file:///in.jpg', width: 800, height: 600 })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest prepareScanImage`
Expected: FAIL — `Cannot find module '../../src/lib/prepareScanImage'`.

- [ ] **Step 4: Write minimal implementation**

Create `src/stores/useScanStore.ts`:
```typescript
import { create } from 'zustand';

export interface PreparedScanImage {
  uri: string;
  base64: string;
  mimeType: 'image/jpeg';
}

export interface PendingScanImage extends PreparedScanImage {
  requestId: string;
}

interface ScanState {
  pendingImage: PendingScanImage | null;
  setPendingImage: (image: PendingScanImage) => void;
  clearPendingImage: () => void;
}

// In-memory handoff from the FAB to the Add Transaction screen. Deliberately not a
// URL param: params are reachable by any deep link, and base64 is too large anyway.
export const useScanStore = create<ScanState>((set) => ({
  pendingImage: null,
  setPendingImage: (pendingImage) => set({ pendingImage }),
  clearPendingImage: () => set({ pendingImage: null }),
}));
```

Create `src/lib/prepareScanImage.ts`:
```typescript
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { PreparedScanImage } from '../stores/useScanStore';

// Plenty for receipt text (Google suggests ~1024px for text detection). Vision
// bills per image, not per byte, so this is about a small, fast upload.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.6;

// Normalizes whatever the picker returned (HEIC, PNG, huge camera JPEGs) into a
// bounded JPEG the OCR function accepts.
export async function prepareScanImage(source: {
  uri: string;
  width: number;
  height: number;
}): Promise<PreparedScanImage> {
  const context = ImageManipulator.manipulate(source.uri);
  if (source.width > MAX_EDGE || source.height > MAX_EDGE) {
    context.resize(source.width >= source.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  if (!result.base64) throw new Error('Could not encode the image.');
  return { uri: result.uri, base64: result.base64, mimeType: 'image/jpeg' };
}
```
Alternative only if Step 1 showed no contextual API (then mock `manipulateAsync` in the test instead):
```typescript
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
// ...
const actions =
  source.width > MAX_EDGE || source.height > MAX_EDGE
    ? [{ resize: source.width >= source.height ? { width: MAX_EDGE } : { height: MAX_EDGE } }]
    : [];
const result = await manipulateAsync(source.uri, actions, { compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true });
```

- [ ] **Step 5: Fix the image-picker plugin permissions**

`app.json` — replace the `expo-image-picker` plugin entry:
```json
      [
        "expo-image-picker",
        {
          "cameraPermission": "Allow Budget Tracker to use the camera to scan receipts.",
          "photosPermission": "Allow Budget Tracker to read photos you choose so it can scan receipts.",
          "microphonePermission": false
        }
      ],
```
(Without `microphonePermission: false` the plugin adds Android `RECORD_AUDIO`, which this app never uses — shipped by mistake in 41f0c3e.)

- [ ] **Step 6: Run tests and type-check**

Run: `npx jest prepareScanImage && npx tsc --noEmit`
Expected: PASS, 5 tests; tsc no output.

- [ ] **Step 7: Commit**
```bash
git add src/lib/prepareScanImage.ts src/stores/useScanStore.ts __tests__/lib/prepareScanImage.test.ts app.json package.json package-lock.json
git commit -m "feat: normalize picked images to bounded JPEG for OCR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: OCR hooks

**Files:**
- Create: `src/hooks/useOcr.ts`
- Test: `__tests__/hooks/useOcr.test.ts`

**Interfaces:**
- Consumes: `OCR_BUCKET`, `ocrScanPath`, `OcrLimitReason`, `OcrScanResult` (Task 1); `formatOcrLimitMessage` (Task 5); function contract (Task 3).
- Produces: `class OcrRequestError extends Error { retryable: boolean }`; `mapOcrInvokeError(error: unknown): Promise<OcrRequestError>`; `shouldRetryOcrScan(failureCount: number, error: unknown): boolean`; `interface OcrScanRow { id: string; user_id: string; char_count: number | null; created_at: string }`; `useOcrScan()` → mutation with variables `{ base64: string; mimeType: string; requestId: string }` and data `OcrScanResult`; `useOcrScans()` → query `OcrScanRow[]` (key `['ocrScans']`); `useDeleteOcrScan()` → mutation with variable `scanId: string`; `getOcrDownloadUrl(scan: OcrScanRow): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/hooks/useOcr.test.ts`:
```typescript
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

// The real client throws at import without EXPO_PUBLIC_* env vars.
jest.mock('../../src/lib/supabase', () => ({ supabase: {} }));

import { mapOcrInvokeError, shouldRetryOcrScan } from '../../src/hooks/useOcr';

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError({ status, json: async () => body });
}

describe('mapOcrInvokeError', () => {
  it('turns a 429 into the friendly limit message and does not retry it', async () => {
    const error = await mapOcrInvokeError(
      httpError(429, { error: 'rate_limited', reason: 'user_hourly', retryAfterSeconds: 720 })
    );
    expect(error.message).toBe('Scan limit reached — try again in 12 min.');
    expect(error.retryable).toBe(false);
  });

  it('uses the global wording for the global cap', async () => {
    const error = await mapOcrInvokeError(
      httpError(429, { error: 'rate_limited', reason: 'global_daily', retryAfterSeconds: 7200 })
    );
    expect(error.message).toBe('Scanning is busy right now — try again in 2 h.');
  });

  it('retries a scan that is still in progress', async () => {
    const error = await mapOcrInvokeError(httpError(409, { error: 'in_progress' }));
    expect(error.retryable).toBe(true);
  });

  it('retries network and timeout failures', async () => {
    const error = await mapOcrInvokeError(new FunctionsFetchError(new Error('timeout')));
    expect(error.message).toBe("Couldn't reach the scanner. Check your connection and try again.");
    expect(error.retryable).toBe(true);
  });

  it('falls back to a generic, non-retryable message for anything else', async () => {
    for (const input of [httpError(502, { error: 'ocr_failed' }), new Error('boom')]) {
      const error = await mapOcrInvokeError(input);
      expect(error.message).toBe("Couldn't read text from that image.");
      expect(error.retryable).toBe(false);
    }
  });
});

describe('shouldRetryOcrScan', () => {
  it('retries a retryable error once, and never a non-retryable one', () => {
    expect(shouldRetryOcrScan(0, { retryable: true })).toBe(true);
    expect(shouldRetryOcrScan(1, { retryable: true })).toBe(false);
    expect(shouldRetryOcrScan(0, { retryable: false })).toBe(false);
    expect(shouldRetryOcrScan(0, new Error('boom'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest hooks/useOcr`
Expected: FAIL — `Cannot find module '../../src/hooks/useOcr'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useOcr.ts`:
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatOcrLimitMessage } from '../domain/ocr';
import {
  OCR_BUCKET,
  ocrScanPath,
  type OcrLimitReason,
  type OcrScanResult,
} from '../../supabase/functions/ocr/shared';

const OCR_TIMEOUT_MS = 30_000;
const GENERIC_SCAN_ERROR = "Couldn't read text from that image.";

export interface OcrScanRow {
  id: string;
  user_id: string;
  char_count: number | null;
  created_at: string;
}

export class OcrRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'OcrRequestError';
    this.retryable = retryable;
  }
}

// Thrown messages surface through the global MutationCache.onError toast in app/_layout.tsx.
export async function mapOcrInvokeError(error: unknown): Promise<OcrRequestError> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    if (status === 429) {
      const body = (await error.context.json().catch(() => null)) as {
        reason?: OcrLimitReason;
        retryAfterSeconds?: number;
      } | null;
      if (body?.reason && typeof body.retryAfterSeconds === 'number') {
        return new OcrRequestError(formatOcrLimitMessage(body.reason, body.retryAfterSeconds), false);
      }
    }
    if (status === 409) return new OcrRequestError('Still reading that receipt — one moment.', true);
    if (status === 410) return new OcrRequestError('That scan was deleted.', false);
    return new OcrRequestError(GENERIC_SCAN_ERROR, false);
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return new OcrRequestError("Couldn't reach the scanner. Check your connection and try again.", true);
  }
  return new OcrRequestError(GENERIC_SCAN_ERROR, false);
}

// One automatic retry for transient failures. Safe because every attempt carries the
// same requestId: the server replays a finished scan instead of calling Vision again.
export function shouldRetryOcrScan(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && (error as { retryable?: unknown } | null)?.retryable === true;
}

export function useOcrScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      base64,
      mimeType,
      requestId,
    }: {
      base64: string;
      mimeType: string;
      requestId: string;
    }): Promise<OcrScanResult> => {
      const { data, error } = await supabase.functions.invoke<OcrScanResult>('ocr', {
        body: { imageBase64: base64, mimeType, requestId },
        timeout: OCR_TIMEOUT_MS,
      });
      if (error) throw await mapOcrInvokeError(error);
      if (!data) throw new OcrRequestError(GENERIC_SCAN_ERROR, false);
      return data;
    },
    retry: shouldRetryOcrScan,
    retryDelay: 1500,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ocrScans'] }),
  });
}

export function useOcrScans() {
  return useQuery({
    queryKey: ['ocrScans'],
    queryFn: async (): Promise<OcrScanRow[]> => {
      const { data, error } = await supabase
        .from('ocr_scans')
        .select('id, user_id, char_count, created_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export function useDeleteOcrScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string) => {
      const { error } = await supabase.functions.invoke('ocr', { method: 'DELETE', body: { scanId } });
      if (error) throw new Error("Couldn't delete that scan.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ocrScans'] }),
  });
}

export async function getOcrDownloadUrl(scan: OcrScanRow): Promise<string> {
  const { data, error } = await supabase.storage
    .from(OCR_BUCKET)
    .createSignedUrl(ocrScanPath(scan.user_id, scan.id), 60, {
      download: `receipt-${scan.created_at.slice(0, 10)}.txt`,
    });
  if (error) throw error;
  return data.signedUrl;
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest hooks/useOcr && npx tsc --noEmit`
Expected: PASS, 6 tests; tsc no output.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useOcr.ts __tests__/hooks/useOcr.test.ts
git commit -m "feat: add OCR hooks with idempotent retry, history, delete, and download

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Form accepts a partial prefill; long notes stay readable

**Files:**
- Modify: `src/components/TransactionForm.tsx` (`initialValues` prop type; Note `TextInput`; styles)
- Modify: `src/components/TransactionListItem.tsx` (left column `flex: 1`; note clamped to 2 lines)
- Test: `__tests__/components/AddTransactionForm.test.tsx` (add a case)

**Interfaces:**
- Produces: `TransactionForm` prop `initialValues?: Partial<TransactionFormValues>` (existing full-value callers like `app/(tabs)/transaction/[id].tsx` remain valid).

- [ ] **Step 1: Write the failing test**

Append inside the `describe('TransactionForm', ...)` block of `__tests__/components/AddTransactionForm.test.tsx`:
```typescript
  it('prefills only the note and keeps defaults for everything else', () => {
    const onSubmit = jest.fn();
    render(
      <TransactionForm
        categories={categories}
        initialValues={{ note: 'COFFEE SHOP\nTOTAL 12.50' }}
        submitLabel="Add Transaction"
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByDisplayValue('COFFEE SHOP\nTOTAL 12.50')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '12.50');
    fireEvent.press(screen.getByText('Add Transaction'));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'expense',
      categoryId: 'cat-1',
      amount: 12.5,
      note: 'COFFEE SHOP\nTOTAL 12.50',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — type error: `{ note: string }` is missing `type`, `categoryId`, `amount` required by `TransactionFormValues`. (Jest alone would pass — the form's `?? default` fallbacks already handle it at runtime; the gap is the type.)

- [ ] **Step 3: Write minimal implementation**

In `src/components/TransactionForm.tsx`, change the prop type:
```typescript
  initialValues?: Partial<TransactionFormValues>;
```
Replace the Note input:
```tsx
      <TextInput
        style={[styles.input, styles.noteInput]}
        value={note}
        onChangeText={setNote}
        placeholder="Note"
        multiline
      />
```
Add to `styles`:
```typescript
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
```
In `src/components/TransactionListItem.tsx`, give the left column room to shrink and clamp the note. The column `<View>` currently has no style, so a long note sizes it to the text and shoves the amount off the row — `numberOfLines` alone doesn't fix that, because the text never gets a bounded width to wrap in. Replace the left column:
```tsx
      <View style={styles.info}>
        <Text style={styles.category}>{isIncome ? 'Income' : (category?.name ?? 'Unknown')}</Text>
        {transaction.note ? (
          <Text style={styles.note} numberOfLines={2}>
            {transaction.note}
          </Text>
        ) : null}
        <Text style={styles.date}>{format(new Date(transaction.occurred_at), 'MMM d')}</Text>
      </View>
```
Add to `styles`:
```typescript
  info: { flex: 1, marginRight: 12 },
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx tsc --noEmit && npx jest AddTransactionForm`
Expected: tsc no output; PASS, 6 tests.

- [ ] **Step 5: Commit**
```bash
git add src/components/TransactionForm.tsx src/components/TransactionListItem.tsx __tests__/components/AddTransactionForm.test.tsx
git commit -m "feat: allow note-only prefill and multiline notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Three-option sheet + FAB wiring

**Files:**
- Modify: `src/components/AddTransactionSheet.tsx` (full replacement below)
- Modify: `src/components/AddTransactionFab.tsx` (full replacement below)
- Modify: `jest.config.js` (add `moduleNameMapper`)
- Test: `__tests__/components/AddTransactionSheet.test.tsx`

**Interfaces:**
- Consumes: `useScanStore` (Task 6), `prepareScanImage` (Task 6), `estimateBase64Bytes`, `createRequestId` (Task 5), `MAX_IMAGE_BYTES` (Task 1).
- Produces: `AddTransactionSheet` props `{ visible: boolean; onClose(): void; onDismiss?(): void; onTakePhoto(): void; onUploadImage(): void; onManualEntry(): void }` (`onDismiss` is passed straight to `Modal`; RN fires it on iOS and web once the sheet has finished closing). Navigation contract used by Task 10: every push to `/transaction/new` passes `params: { visit: string }` — a fresh id for Manual Entry, the image's `requestId` for a scan.

- [ ] **Step 1: Map lucide to its CJS build for Jest**

jest-expo only transforms `\.[jt]sx?$`, and lucide's `react-native` entry is `.mjs`, so `transformIgnorePatterns` can't fix it. In `jest.config.js`, add next to `transformIgnorePatterns`:
```javascript
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/components/AddTransactionSheet.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AddTransactionSheet } from '../../src/components/AddTransactionSheet';

function renderSheet() {
  const handlers = {
    onClose: jest.fn(),
    onTakePhoto: jest.fn(),
    onUploadImage: jest.fn(),
    onManualEntry: jest.fn(),
  };
  render(<AddTransactionSheet visible {...handlers} />);
  return handlers;
}

describe('AddTransactionSheet', () => {
  it('offers three options that fire their own handlers', () => {
    const handlers = renderSheet();

    fireEvent.press(screen.getByText('Take Photo'));
    fireEvent.press(screen.getByText('Upload Image'));
    fireEvent.press(screen.getByText('Manual Entry'));

    expect(handlers.onTakePhoto).toHaveBeenCalledTimes(1);
    expect(handlers.onUploadImage).toHaveBeenCalledTimes(1);
    expect(handlers.onManualEntry).toHaveBeenCalledTimes(1);
  });

  it('tells users where their image goes', () => {
    renderSheet();
    expect(
      screen.getByText('Photos are sent to Google Cloud Vision to read the text and are not stored.')
    ).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest AddTransactionSheet`
Expected: FAIL — `Unable to find an element with text: Take Photo`.

- [ ] **Step 4: Write minimal implementation**

Replace `src/components/AddTransactionSheet.tsx`:
```tsx
import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { Camera, ImageUp, PenLine } from 'lucide-react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onTakePhoto: () => void;
  onUploadImage: () => void;
  onManualEntry: () => void;
}

export function AddTransactionSheet({
  visible,
  onClose,
  onDismiss,
  onTakePhoto,
  onUploadImage,
  onManualEntry,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add Transaction</Text>
          <Pressable style={styles.option} onPress={onTakePhoto}>
            <Camera color="#2196F3" size={22} />
            <Text style={styles.optionText}>Take Photo</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={onUploadImage}>
            <ImageUp color="#2196F3" size={22} />
            <Text style={styles.optionText}>Upload Image</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={onManualEntry}>
            <PenLine color="#2196F3" size={22} />
            <Text style={styles.optionText}>Manual Entry</Text>
          </Pressable>
          <Text style={styles.privacy}>
            Photos are sent to Google Cloud Vision to read the text and are not stored.
          </Text>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 12, textAlign: 'center', color: '#666' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  optionText: { fontSize: 17, fontWeight: '600' },
  privacy: { marginTop: 12, fontSize: 12, color: '#888', textAlign: 'center' },
  cancelButton: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#D32F2F' },
});
```

Replace `src/components/AddTransactionFab.tsx`:
```tsx
import { useRef, useState } from 'react';
import { Platform, Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { AddTransactionSheet } from './AddTransactionSheet';
import { useToastStore } from '../stores/useToastStore';
import { useScanStore } from '../stores/useScanStore';
import { prepareScanImage } from '../lib/prepareScanImage';
import { estimateBase64Bytes, createRequestId } from '../domain/ocr';
import { MAX_IMAGE_BYTES } from '../../supabase/functions/ocr/shared';

const FAB_SIZE = 56;

type ImageSource = 'camera' | 'library';

function showToast(message: string) {
  useToastStore.getState().showToast(message);
}

// On desktop web, the camera picker falls back to a file dialog.
async function pickImage(source: ImageSource) {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'] };
  if (source === 'library') return ImagePicker.launchImageLibraryAsync(options);

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    showToast('Camera access is needed to scan a receipt.');
    return null;
  }
  return ImagePicker.launchCameraAsync(options);
}

export function AddTransactionFab() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const afterSheetClosesRef = useRef<(() => void) | null>(null);

  // iOS can't present the camera/library while the sheet's Modal is still
  // animating closed — the picker silently never appears. There, wait for the
  // Modal's onDismiss (iOS-only on native), with a timeout fallback so a missed
  // onDismiss can't swallow the tap. Android and web open immediately, which
  // also keeps web inside the click's user-activation window.
  function closeSheetThen(action: () => void) {
    setSheetOpen(false);
    if (Platform.OS !== 'ios') {
      action();
      return;
    }
    afterSheetClosesRef.current = action;
    setTimeout(handleSheetDismiss, 800);
  }

  // Runs at most once per tap: whichever of onDismiss / the fallback comes first.
  function handleSheetDismiss() {
    const action = afterSheetClosesRef.current;
    afterSheetClosesRef.current = null;
    action?.();
  }

  // Every navigation carries a fresh `visit` id: the Add Transaction screen is a
  // tab screen, which stays mounted between visits, and keys its content on it.
  function handleManualEntry() {
    setSheetOpen(false);
    router.push({ pathname: '/transaction/new', params: { visit: createRequestId() } });
  }

  async function handleScan(source: ImageSource) {
    const result = await pickImage(source);
    const asset = result && !result.canceled ? result.assets[0] : undefined;
    if (!asset) return;

    try {
      const image = await prepareScanImage(asset);
      if (estimateBase64Bytes(image.base64) > MAX_IMAGE_BYTES) {
        showToast('That image is too large to scan.');
        return;
      }
      // One requestId per picked image, reused by any automatic retry. It doubles
      // as the visit id, which is how the screen knows this image is for it.
      const requestId = createRequestId();
      useScanStore.getState().setPendingImage({ ...image, requestId });
      router.push({ pathname: '/transaction/new', params: { visit: requestId } });
    } catch {
      showToast("Couldn't read that image.");
    }
  }

  return (
    <>
      <Pressable
        style={styles.fab}
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <AddTransactionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onDismiss={handleSheetDismiss}
        onTakePhoto={() => closeSheetThen(() => void handleScan('camera'))}
        onUploadImage={() => closeSheetThen(() => void handleScan('library'))}
        onManualEntry={handleManualEntry}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -FAB_SIZE / 2,
    // Rendered as a sibling to the whole Tabs navigator (not nested inside
    // a single screen), so "bottom" here is relative to the full
    // content+tab-bar height. This places the button's vertical center
    // exactly on the tab bar's top edge, straddling content and tab bar.
    bottom: TAB_BAR_HEIGHT - FAB_SIZE / 2,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 12px rgba(33, 150, 243, 0.45)',
    elevation: 8,
    zIndex: 100,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx jest AddTransactionSheet && npx tsc --noEmit && npx jest`
Expected: PASS, 2 tests; tsc no output; full suite green.

- [ ] **Step 6: Commit**
```bash
git add src/components/AddTransactionSheet.tsx src/components/AddTransactionFab.tsx jest.config.js __tests__/components/AddTransactionSheet.test.tsx
git commit -m "feat: add Take Photo / Upload Image / Manual Entry options to the FAB sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Add Transaction screen runs OCR and prefills the note

**Files:**
- Modify: `app/(tabs)/transaction/new.tsx` (full replacement below — drops `photoUri`, `useLocalSearchParams`, `SAFE_LOCAL_URI_PREFIXES`, `isSafeLocalImageUri`)
- Test: `__tests__/components/NewTransaction.test.tsx`

**Interfaces:**
- Consumes: `useScanStore`, `PendingScanImage` (Task 6); `useOcrScan` (Task 7); `MAX_OCR_TEXT_CHARS`, `OcrScanResult` (Task 1); `TransactionForm` partial `initialValues` (Task 8); the `visit` param contract (Task 9).

**Why `visit`:** `transaction/new` is a hidden `Tabs.Screen`, and tab screens stay mounted after their first visit (expo-router 57's bottom tabs have no `unmountOnBlur`; `popToTopOnBlur` only resets nested stacks). Reading the picked image once at mount would scan only the *first* image ever picked, and the form would keep the last visit's amount and note. So the screen remounts its content per `visit` id (`key={visit}`), and uses the pending image only when its `requestId` equals that `visit` — a deep link with any other `visit` gets a plain form.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/NewTransaction.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import NewTransactionScreen from '../../app/(tabs)/transaction/new';
import { useScanStore } from '../../src/stores/useScanStore';
import { useToastStore } from '../../src/stores/useToastStore';

const mockRunOcr = jest.fn();

jest.mock('../../src/hooks/useOcr', () => ({
  useOcrScan: () => ({ mutate: mockRunOcr }),
}));

jest.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [{ id: 'cat-1', user_id: 'u1', name: 'Groceries', color: '#4CAF50', icon: 'cart', is_default: true }],
  }),
}));

jest.mock('../../src/hooks/useTransactions', () => ({
  useAddTransaction: () => ({ mutate: jest.fn() }),
}));

jest.mock('../../src/stores/useUiStore', () => ({
  useUiStore: (selector: (state: { selectedMonth: string }) => unknown) =>
    selector({ selectedMonth: '2026-10-01' }),
}));

let mockParams: { visit?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const IMAGE = {
  uri: 'file:///scan.jpg',
  base64: 'QUJD',
  mimeType: 'image/jpeg' as const,
  requestId: '3f8a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b',
};

describe('NewTransactionScreen', () => {
  beforeEach(() => {
    mockRunOcr.mockReset();
    mockParams = { visit: IMAGE.requestId };
    useScanStore.getState().clearPendingImage();
    useToastStore.getState().dismissToast();
  });

  it('scans the pending image exactly once and prefills the note', async () => {
    mockRunOcr.mockImplementation((_variables, options) =>
      options.onSuccess({ scanId: 's1', text: 'TOTAL 12.50', path: 'u1/s1.txt', truncated: false })
    );
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen />);

    expect(await screen.findByDisplayValue('TOTAL 12.50')).toBeTruthy();
    expect(mockRunOcr).toHaveBeenCalledTimes(1);
    expect(mockRunOcr.mock.calls[0][0]).toEqual({
      base64: 'QUJD',
      mimeType: 'image/jpeg',
      requestId: IMAGE.requestId,
    });
    expect(useScanStore.getState().pendingImage).toBeNull();
  });

  it('tells the user when the text was cut off', async () => {
    mockRunOcr.mockImplementation((_variables, options) =>
      options.onSuccess({ scanId: 's1', text: 'LONG TEXT', path: 'u1/s1.txt', truncated: true })
    );
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen />);

    await screen.findByDisplayValue('LONG TEXT');
    expect(useToastStore.getState().message).toBe('That text was long — kept the first 20,000 characters.');
  });

  it('lets the user skip a slow scan and enter details manually', () => {
    mockRunOcr.mockImplementation(() => {});
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen />);

    expect(screen.getByText('Reading text…')).toBeTruthy();
    fireEvent.press(screen.getByText('Skip — enter manually'));
    expect(screen.getByText('Add Transaction')).toBeTruthy();
  });

  it('goes straight to the form when there is no image', () => {
    render(<NewTransactionScreen />);

    expect(mockRunOcr).not.toHaveBeenCalled();
    expect(screen.getByText('Add Transaction')).toBeTruthy();
  });

  it('ignores a pending image that belongs to a different visit (e.g. a crafted deep link)', () => {
    useScanStore.getState().setPendingImage(IMAGE);
    mockParams = { visit: 'not-this-image' };

    render(<NewTransactionScreen />);

    expect(mockRunOcr).not.toHaveBeenCalled();
    expect(screen.getByText('Add Transaction')).toBeTruthy();
  });

  it('starts fresh on the next visit even though the screen stays mounted', () => {
    mockParams = { visit: 'visit-1' };
    const { rerender } = render(<NewTransactionScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '42');
    expect(screen.getByDisplayValue('42')).toBeTruthy();

    mockParams = { visit: 'visit-2' };
    rerender(<NewTransactionScreen />);

    expect(screen.queryByDisplayValue('42')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest NewTransaction`
Expected: FAIL — the first test times out waiting for display value `TOTAL 12.50` (current screen never calls OCR).

- [ ] **Step 3: Write minimal implementation**

Replace `app/(tabs)/transaction/new.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Image, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddTransaction } from '../../../src/hooks/useTransactions';
import { useOcrScan } from '../../../src/hooks/useOcr';
import { useUiStore } from '../../../src/stores/useUiStore';
import { useScanStore, type PendingScanImage } from '../../../src/stores/useScanStore';
import { useToastStore } from '../../../src/stores/useToastStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { pageLayout } from '../../../src/styles/pageLayout';
import { MAX_OCR_TEXT_CHARS } from '../../../supabase/functions/ocr/shared';

function showToast(message: string) {
  useToastStore.getState().showToast(message);
}

// Tab screens stay mounted between visits, so all per-visit state lives in
// NewTransactionContent, remounted for every `visit` id the FAB navigates with.
// The pending image is only used when it was picked for this visit.
export default function NewTransactionScreen() {
  const { visit } = useLocalSearchParams<{ visit?: string }>();
  const pendingImage = useScanStore((state) => state.pendingImage);
  const scanImage = pendingImage && pendingImage.requestId === visit ? pendingImage : null;

  return <NewTransactionContent key={visit ?? 'direct'} scanImage={scanImage} />;
}

function NewTransactionContent({ scanImage: initialScanImage }: { scanImage: PendingScanImage | null }) {
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: addTransaction } = useAddTransaction(selectedMonth);
  const { mutate: runOcr } = useOcrScan();

  // Captured once per visit: the effect below clears the store, which turns the
  // parent's prop to null — the preview and scan must survive that. The ref
  // keeps a StrictMode double-effect from starting a second scan.
  const [scanImage] = useState(initialScanImage);
  const [isScanning, setIsScanning] = useState(scanImage !== null);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const scanStartedRef = useRef(false);

  useEffect(() => {
    if (!scanImage || scanStartedRef.current) return;
    scanStartedRef.current = true;
    useScanStore.getState().clearPendingImage();

    runOcr(
      { base64: scanImage.base64, mimeType: scanImage.mimeType, requestId: scanImage.requestId },
      {
        onSuccess: (result) => {
          if (result.truncated) {
            showToast(`That text was long — kept the first ${MAX_OCR_TEXT_CHARS.toLocaleString('en-US')} characters.`);
          } else if (!result.text.trim()) {
            showToast('No text found in that image.');
          }
          if (result.text.trim()) setPrefillNote(result.text);
          setIsScanning(false);
        },
        // The error toast comes from the global MutationCache handler.
        onError: () => setIsScanning(false),
      }
    );
  }, [scanImage, runOcr]);

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        {scanImage && <Image source={{ uri: scanImage.uri }} style={styles.preview} />}
        {isScanning ? (
          <View style={styles.scanning}>
            <ActivityIndicator />
            <Text style={styles.scanningText}>Reading text…</Text>
            <Pressable style={styles.skipButton} onPress={() => setIsScanning(false)}>
              <Text style={styles.skipText}>Skip — enter manually</Text>
            </Pressable>
          </View>
        ) : (
          <TransactionForm
            categories={categories}
            initialValues={prefillNote ? { note: prefillNote } : undefined}
            submitLabel="Add Transaction"
            onSubmit={({ type, categoryId, amount, note }) => {
              addTransaction(
                { type, categoryId, amount, note, occurredAt: new Date().toISOString() },
                { onSuccess: () => router.back() }
              );
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  scanning: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  scanningText: { color: '#666' },
  skipButton: { paddingVertical: 8, paddingHorizontal: 12 },
  skipText: { color: '#2196F3', fontWeight: '600' },
});
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest NewTransaction && npx tsc --noEmit && npx jest`
Expected: PASS, 6 tests; tsc no output; full suite green. If `tsc` rejects the object-form `router.push` params in Task 9 as a stale typed route, cycle the dev server and hit `/transaction/new` first (CLAUDE.md gotcha) — the same call shape type-checked for `photoUri` before.

- [ ] **Step 5: Commit**
```bash
git add "app/(tabs)/transaction/new.tsx" __tests__/components/NewTransaction.test.tsx
git commit -m "feat: run OCR on the picked image and prefill the transaction note

Replaces the photoUri URL param with an in-memory store handoff, so the
preview image is no longer reachable from a crafted deep link. Each visit
is keyed by a visit id, since tab screens stay mounted between visits.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Scanned Receipts in Settings

**Files:**
- Modify: `app/(tabs)/settings.tsx` (imports, hooks, new card between the Recurring Rules card and the Sign Out card, styles)
- Test: `__tests__/components/SettingsScans.test.tsx`

**Interfaces:**
- Consumes: `useOcrScans`, `useDeleteOcrScan`, `getOcrDownloadUrl`, `OcrScanRow` (Task 7); lucide mapper (Task 9).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/SettingsScans.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import SettingsScreen from '../../app/(tabs)/settings';

const mockDeleteScan = jest.fn();
let mockScans: { id: string; user_id: string; char_count: number | null; created_at: string }[] = [];

jest.mock('../../src/hooks/useOcr', () => ({
  useOcrScans: () => ({ data: mockScans }),
  useDeleteOcrScan: () => ({ mutate: mockDeleteScan }),
  getOcrDownloadUrl: jest.fn(async () => 'https://example.test/signed'),
}));
jest.mock('../../src/hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('../../src/hooks/useRecurringRules', () => ({ useRecurringRules: () => ({ data: [] }) }));
jest.mock('../../src/lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('Settings — Scanned Receipts', () => {
  beforeEach(() => mockDeleteScan.mockReset());

  it('shows an empty state', () => {
    mockScans = [];
    render(<SettingsScreen />);
    expect(screen.getByText('Scanned Receipts')).toBeTruthy();
    expect(screen.getByText('No scans yet.')).toBeTruthy();
  });

  it('lists scans and deletes one', () => {
    mockScans = [{ id: 'scan-1', user_id: 'u1', char_count: 42, created_at: '2026-10-05T12:00:00.000Z' }];
    render(<SettingsScreen />);

    expect(screen.getByText(/42 chars/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Delete scan'));
    expect(mockDeleteScan).toHaveBeenCalledWith('scan-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest SettingsScans`
Expected: FAIL — `Unable to find an element with text: Scanned Receipts`.

- [ ] **Step 3: Write minimal implementation**

In `app/(tabs)/settings.tsx`:

Change the react-native import and add imports:
```tsx
import { ScrollView, View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { FileText, Trash } from 'lucide-react-native';
import { useOcrScans, useDeleteOcrScan, getOcrDownloadUrl, type OcrScanRow } from '../../src/hooks/useOcr';
import { useToastStore } from '../../src/stores/useToastStore';
```
Inside `SettingsScreen`, after `useRecurringRules()`:
```tsx
  const { data: scans } = useOcrScans();
  const { mutate: deleteScan } = useDeleteOcrScan();

  async function openScan(scan: OcrScanRow) {
    try {
      await Linking.openURL(await getOcrDownloadUrl(scan));
    } catch {
      useToastStore.getState().showToast("Couldn't open that scan.");
    }
  }
```
Insert this card after the Recurring Rules card's closing `</View>` and before the Sign Out card:
```tsx
        <View style={pageLayout.card}>
          <Text style={styles.heading}>Scanned Receipts</Text>
          {(scans ?? []).length === 0 && <Text style={styles.emptyText}>No scans yet.</Text>}
          {(scans ?? []).map((scan) => (
            <View key={scan.id} style={styles.row}>
              <Pressable style={styles.scanInfo} onPress={() => openScan(scan)}>
                <FileText color="#2196F3" size={18} />
                <Text style={styles.rowText}>
                  {format(new Date(scan.created_at), 'MMM d, h:mm a')}
                  {scan.char_count === null ? '' : ` · ${scan.char_count} chars`}
                </Text>
              </Pressable>
              <Pressable onPress={() => deleteScan(scan.id)} accessibilityLabel="Delete scan" hitSlop={8}>
                <Trash color="#D32F2F" size={18} />
              </Pressable>
            </View>
          ))}
        </View>
```
(`char_count` is null only for rows completed by reconciliation, where the function never got to record it.)

Add to `styles`:
```typescript
  emptyText: { color: '#888' },
  scanInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest SettingsScans && npx tsc --noEmit && npx jest`
Expected: PASS, 2 tests; tsc no output; full suite green.

- [ ] **Step 5: Commit**
```bash
git add "app/(tabs)/settings.tsx" __tests__/components/SettingsScans.test.tsx
git commit -m "feat: list, download, and delete scanned receipts in Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Docs + end-to-end verification

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Replace the stale **"The Overview FAB"** paragraph (it still says the FAB shows only on `/` and navigates straight to the form) with:
```markdown
**The Add Transaction FAB** (`src/components/AddTransactionFab.tsx`) is rendered from `(tabs)/_layout.tsx` as a sibling *after* `<Tabs>`, shown on the 4 tab pages (`TAB_PAGES`), straddling the tab bar (`TAB_BAR_HEIGHT` in `src/constants/layout.ts`). Tapping it opens `AddTransactionSheet` (Take Photo / Upload Image / Manual Entry). Nested inside a screen it would be clipped by, or lose the stacking fight with, the tab bar — follow this pattern for any cross-tab floating element.

**Receipt OCR:** picked images are normalized (`src/lib/prepareScanImage.ts`), tagged with a `requestId`, and handed to `app/(tabs)/transaction/new.tsx` through `src/stores/useScanStore.ts` — never a URL param (params are deep-link reachable). The only param is an opaque `visit` id; the screen uses the stored image only when its `requestId` matches that visit. That screen calls the `ocr` Edge Function (`supabase/functions/ocr/`). Google Vision is on the **free tier (1,000 images/month)**, so every design choice minimizes Vision calls: `budget_tracker.try_consume_ocr_quota` runs under one global advisory lock and returns `replay` (same `requestId` seen before, or the same image — SHA-256 — already scanned by this user: the function re-serves the saved `.txt` and never calls Vision), `blocked` (900/month global on the Pacific-Time calendar month, 40/day global, 20/day + 5/h per user), or `new`. The Vision request uses one feature and a text-only field mask. Don't add features (each one is another billed unit per image) or raise the 900 cap without checking the Vision billing tier. **If Vision fails for any reason, including billing being disabled, the same image goes to Gemini** (`generateContent`, default `gemini-3.5-flash-lite`, overridable with the `GEMINI_MODEL` secret). The providers' request/response logic and the fallback order are in the pure `supabase/functions/ocr/ocrProviders.ts`, which is unit-tested; `index.ts` only does the fetches. Gemini's free tier uses submitted content to improve Google's products, and the + sheet's privacy note says so. Keep that note accurate if providers change. `budget_tracker.ocr_scans` is the quota ledger, scan history, and idempotency record; users can only SELECT it, deletes go through the function and keep the row. Object paths are always derived (`{user_id}/{scan_id}.txt`), never stored; rows stuck in `pending` are reconciled from `storage.objects` after 10 minutes. Deleting an `auth.users` row fires `on_auth_user_deleted_ocr_cleanup`, which calls the function's purge route through `pg_net` with a Vault-held shared secret. `supabase/functions/ocr/shared.ts` is imported by both the function and the app — keep it one file with no imports. 0001's default privileges grant every new `budget_tracker` function to `anon`/`authenticated`: revoke explicitly on anything privileged.
```
Add to **Commands**:
```bash
npx supabase functions deploy ocr --use-api --no-verify-jwt --project-ref axcuqumgplgbuwlnzfpt   # no Docker needed
npx supabase secrets set GOOGLE_VISION_API_KEY=<key> --project-ref axcuqumgplgbuwlnzfpt   # primary OCR (needs GCP billing)
npx supabase secrets set GEMINI_API_KEY=<key> --project-ref axcuqumgplgbuwlnzfpt          # fallback OCR (AI Studio key, no billing)
# The Supabase CLI needs SUPABASE_ACCESS_TOKEN in the shell; it's in .env as EXPO_SUPABASE_ACCESS_TOKEN.
```
Add to **Gotchas**:
```markdown
- **`ocr` runs with `verify_jwt = false`** (`supabase/config.toml`): the account-deletion trigger can't send a user JWT, so every path authenticates inside the function. Never add a route that skips that.
- **`supabase/functions` is excluded from the root `tsconfig.json`** — it's Deno code. Deno isn't installed locally; test shared logic through `ocr/shared.ts` in Jest. Any `exclude` in `tsconfig.json` *replaces* `expo/tsconfig.base`'s list instead of merging, so it has to repeat `node_modules`, `android`, `ios`, etc. — drop them and `tsc` starts checking `node_modules`.
- **Screens under `(tabs)` stay mounted after their first visit** — expo-router 57's bottom tabs have no `unmountOnBlur` (`popToTopOnBlur` only resets nested stacks), so `useState` initializers and mount effects run once, ever, and form state carries over to the next visit. `transaction/new` handles this by keying its content on a `visit` param that every navigation sets fresh. Any detail screen that must start clean per visit needs the same treatment.
- **iOS can't present a native picker while a `Modal` is closing** — it fails silently. `AddTransactionFab` defers the camera/library launch to the sheet's `onDismiss` on iOS (RN only fires `onDismiss` on iOS and web). Do the same for any picker or system sheet opened from a modal.
- **lucide in Jest:** its `react-native` entry is `.mjs`, which jest-expo never transforms — `jest.config.js` maps `lucide-react-native` to its CJS build via `moduleNameMapper`. Same class of problem as the gifted-charts `transformIgnorePatterns` fix.
- **Orphaned OCR files** (if a cleanup `pg_net` call ever fails — check `net._http_response`): `select distinct split_part(name, '/', 1) from storage.objects o where bucket_id = 'budget-tracker-ocr' and not exists (select 1 from auth.users u where u.id::text = split_part(o.name, '/', 1));` — remove them via the Storage API, not SQL.
- **Desktop web "Take Photo"** opens a file dialog (no webcam through a file input) — expected.
```

- [ ] **Step 2: Update README.md**

Append to the `## Setup` list, after step 4 ("Start the dev server") and before `## Scripts`:
```markdown
5. **Receipt scanning (optional):** set up at least one OCR provider.
   - **Cloud Vision (primary):** enable the API in Google Cloud. It needs a billing account even on the free tier. Create an API key restricted to the Vision API with no application restrictions, and add a $1 budget alert. The app caps scans at 900/month to stay inside Vision's 1,000 free images.
   - **Gemini (fallback, no billing needed):** create a key at https://aistudio.google.com/apikey. On the free tier, Google may use the submitted images to improve its products.

   With both set, Vision is tried first and Gemini takes over whenever Vision fails. Then deploy the function and wire up account-deletion cleanup:

   ```bash
   npx supabase secrets set GOOGLE_VISION_API_KEY=<key> --project-ref <ref>
   npx supabase secrets set GEMINI_API_KEY=<key> --project-ref <ref>
   npx supabase secrets set OCR_WEBHOOK_SECRET=<random-64-hex> --project-ref <ref>
   npx supabase functions deploy ocr --use-api --no-verify-jwt --project-ref <ref>
   ```

   Then in the SQL editor, store the same secret and the function URL in Vault so the `auth.users` delete trigger can reach the function:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/ocr', 'budget_tracker_ocr_function_url');
   select vault.create_secret('<same-random-64-hex>', 'budget_tracker_ocr_webhook_secret');
   ```
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc no output; all suites pass. That's 92 tests: the 80 now committed (26 pre-existing, the plan's 42, and the 12 FAB tests the user approved in Task 9), plus 12 from Task 13. Task 14 changes one assertion and adds no tests.

Web smoke — restart the dev server, then:
```bash
for r in / /transactions /reports /settings /transaction/new "/transaction/new?photoUri=https%3A%2F%2Fevil.example%2Fx.png"; do
  echo "$r -> $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8081$r")"
done
curl -s "http://127.0.0.1:8081/transaction/new?photoUri=https%3A%2F%2Fevil.example%2Fx.png" | grep -c "evil.example"
```
Expected: every route `200`; the grep prints `0`.

- [ ] **Step 4: Ask the user to test what I can't drive**

Ask them to try, in the browser and on a phone (Expo Go, ideally an iPhone for the sheet → picker timing): Upload Image with a real receipt → note prefilled → save; then scan a **second** receipt right away (must be read, with an empty amount — the mounted-tab case); Take Photo; Skip during a scan; Settings → Scanned Receipts → open (downloads `.txt`) and delete.

- [ ] **Step 5: Commit**
```bash
git add CLAUDE.md README.md
git commit -m "docs: document receipt OCR architecture, idempotency, cleanup, and setup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Then append a summary to `.superpowers/sdd/progress.md` (gitignored local log).

---

### Task 13: OCR provider module — Vision first, Gemini fallback (amendment)

**Files:**
- Create: `supabase/functions/ocr/ocrProviders.ts`
- Test: `__tests__/functions/ocrProviders.test.ts`

**Interfaces:**
- Produces:
  - Types: `type OcrProviderName = 'vision' | 'gemini'`; `type ProviderResult = { ok: true; text: string } | { ok: false; status: number; reason: string }`; `interface ProviderAttempt { name: OcrProviderName; run(): Promise<ProviderResult> }`; `interface ReadOutcome { provider: OcrProviderName | null; text: string | null; failures: { name; status; reason }[] }`.
  - Vision: `VISION_URL`, `buildVisionBody(imageBase64)`, `parseVisionResponse(status, body): ProviderResult`.
  - Gemini: `DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'`, `geminiUrl(model)`, `buildGeminiBody(imageBase64, mimeType)`, `parseGeminiResponse(status, body): ProviderResult`.
  - Fallback: `readWithFallback(attempts: ProviderAttempt[]): Promise<ReadOutcome>`.
  - Task 3's `index.ts` consumes all of these.
- Like `shared.ts`, this file must have **no imports**: Deno needs `.ts` specifiers, and the root tsconfig rejects them. It is type-checked through the test that imports it.

- [ ] **Step 1: Write the failing test**

Create `__tests__/functions/ocrProviders.test.ts`:
```typescript
import {
  VISION_URL,
  buildVisionBody,
  parseVisionResponse,
  DEFAULT_GEMINI_MODEL,
  geminiUrl,
  buildGeminiBody,
  parseGeminiResponse,
  readWithFallback,
  type OcrProviderName,
  type ProviderResult,
} from '../../supabase/functions/ocr/ocrProviders';

describe('Vision request and response', () => {
  it('asks for exactly one feature and only the text', () => {
    expect(buildVisionBody('QUJD')).toEqual({
      requests: [{ image: { content: 'QUJD' }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }],
    });
    expect(VISION_URL).toContain('fields=responses(fullTextAnnotation/text,error)');
  });

  it('returns the text, or empty text when the image has none', () => {
    expect(parseVisionResponse(200, { responses: [{ fullTextAnnotation: { text: 'TOTAL 12.50\n' } }] })).toEqual({
      ok: true,
      text: 'TOTAL 12.50\n',
    });
    expect(parseVisionResponse(200, { responses: [{}] })).toEqual({ ok: true, text: '' });
  });

  it('fails with the most specific reason code Google gives', () => {
    expect(
      parseVisionResponse(403, {
        error: { code: 403, status: 'PERMISSION_DENIED', details: [{ reason: 'BILLING_DISABLED' }] },
      })
    ).toEqual({ ok: false, status: 403, reason: 'BILLING_DISABLED' });
    expect(parseVisionResponse(200, { responses: [{ error: { code: 3, message: 'Bad image data.' } }] })).toEqual({
      ok: false,
      status: 200,
      reason: 'code_3',
    });
    expect(parseVisionResponse(500, null)).toEqual({ ok: false, status: 500, reason: 'http_error' });
    expect(parseVisionResponse(200, { responses: [] })).toEqual({ ok: false, status: 200, reason: 'no_response' });
  });
});

describe('Gemini request and response', () => {
  it('targets generateContent on the given model', () => {
    expect(geminiUrl(DEFAULT_GEMINI_MODEL)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
    );
  });

  it('sends the image inline with a transcription prompt and deterministic settings', () => {
    const body = buildGeminiBody('QUJD', 'image/jpeg');
    expect(body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
    expect(body.contents[0].parts[1].text).toMatch(/transcribe/i);
    expect(body.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 8192 });
  });

  it('joins the answer parts, skipping thought parts and a wrapping code fence', () => {
    expect(
      parseGeminiResponse(200, {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: 'reasoning', thought: true }, { text: 'COFFEE SHOP\n' }, { text: 'TOTAL 12.50' }] },
          },
        ],
      })
    ).toEqual({ ok: true, text: 'COFFEE SHOP\nTOTAL 12.50' });
    expect(
      parseGeminiResponse(200, {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '```text\nTOTAL 12.50\n```' }] } }],
      })
    ).toEqual({ ok: true, text: 'TOTAL 12.50' });
  });

  it('accepts an empty answer and output cut at the token limit', () => {
    expect(parseGeminiResponse(200, { candidates: [{ finishReason: 'STOP', content: {} }] })).toEqual({
      ok: true,
      text: '',
    });
    expect(
      parseGeminiResponse(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'LONG' }] } }] })
    ).toEqual({ ok: true, text: 'LONG' });
  });

  it('fails on HTTP errors, blocked prompts, other finish reasons, and missing candidates', () => {
    expect(parseGeminiResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } })).toEqual({
      ok: false,
      status: 429,
      reason: 'RESOURCE_EXHAUSTED',
    });
    expect(parseGeminiResponse(200, { promptFeedback: { blockReason: 'SAFETY' } })).toEqual({
      ok: false,
      status: 200,
      reason: 'blocked_SAFETY',
    });
    expect(
      parseGeminiResponse(200, { candidates: [{ finishReason: 'RECITATION', content: { parts: [{ text: 'x' }] } }] })
    ).toEqual({ ok: false, status: 200, reason: 'RECITATION' });
    expect(parseGeminiResponse(200, { candidates: [] })).toEqual({ ok: false, status: 200, reason: 'no_candidate' });
  });
});

function attempt(name: OcrProviderName, result: ProviderResult | Error) {
  return {
    name,
    run: jest.fn(async (): Promise<ProviderResult> => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('readWithFallback', () => {
  it('uses the first provider that succeeds and never calls the rest', async () => {
    const vision = attempt('vision', { ok: true, text: 'A' });
    const gemini = attempt('gemini', { ok: true, text: 'B' });

    await expect(readWithFallback([vision, gemini])).resolves.toEqual({ provider: 'vision', text: 'A', failures: [] });
    expect(gemini.run).not.toHaveBeenCalled();
  });

  it('falls back to the next provider and records why the first one failed', async () => {
    const vision = attempt('vision', { ok: false, status: 403, reason: 'BILLING_DISABLED' });
    const gemini = attempt('gemini', { ok: true, text: 'B' });

    await expect(readWithFallback([vision, gemini])).resolves.toEqual({
      provider: 'gemini',
      text: 'B',
      failures: [{ name: 'vision', status: 403, reason: 'BILLING_DISABLED' }],
    });
  });

  it('treats a thrown error (network, timeout) as a failure and moves on', async () => {
    const outcome = await readWithFallback([
      attempt('vision', new Error('fetch failed')),
      attempt('gemini', { ok: true, text: 'B' }),
    ]);

    expect(outcome.provider).toBe('gemini');
    expect(outcome.failures).toEqual([{ name: 'vision', status: 0, reason: 'network_error' }]);
  });

  it('reports no text when every provider fails', async () => {
    await expect(
      readWithFallback([
        attempt('vision', { ok: false, status: 500, reason: 'http_error' }),
        attempt('gemini', { ok: false, status: 429, reason: 'RESOURCE_EXHAUSTED' }),
      ])
    ).resolves.toEqual({
      provider: null,
      text: null,
      failures: [
        { name: 'vision', status: 500, reason: 'http_error' },
        { name: 'gemini', status: 429, reason: 'RESOURCE_EXHAUSTED' },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest ocrProviders`
Expected: FAIL — `Cannot find module '../../supabase/functions/ocr/ocrProviders'`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/ocr/ocrProviders.ts`:
```typescript
// Request builders and response parsers for the OCR providers, plus the fallback
// order. Pure, so Jest can test it (Deno isn't installed locally) — index.ts does
// the actual fetches. Like shared.ts, keep it free of imports: Deno needs `.ts`
// specifiers and the root tsconfig rejects them.

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
    } catch {
      result = { ok: false, status: 0, reason: 'network_error' };
    }
    if (result.ok) return { provider: attempt.name, text: result.text, failures };
    failures.push({ name: attempt.name, status: result.status, reason: result.reason });
  }
  return { provider: null, text: null, failures };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest ocrProviders && npx tsc --noEmit && npx jest`
Expected: PASS, 12 tests; tsc no output; full suite 92/92.

- [ ] **Step 5: Commit**
```bash
git add supabase/functions/ocr/ocrProviders.ts __tests__/functions/ocrProviders.test.ts
git commit -m "feat: add OCR provider module with Vision-to-Gemini fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Privacy note discloses the Gemini fallback (amendment)

**Files:**
- Modify: `src/components/AddTransactionSheet.tsx` (privacy `Text` only)
- Test: `__tests__/components/AddTransactionSheet.test.tsx` (the privacy assertion)

**Interfaces:** none new. Wording chosen by the user: "Disclose it".

- [ ] **Step 1: Update the test first**

In `__tests__/components/AddTransactionSheet.test.tsx`, change the privacy assertion's expected string to:
```
Photos are sent to Google to read the text (Cloud Vision, or Gemini as a backup — Gemini's free tier may use them to improve Google's products). This app doesn't keep them.
```
Also `grep -rn "Google Cloud Vision to read the text" __tests__ src app`. If any other test asserts the old sentence, update it the same way.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest AddTransactionSheet`
Expected: FAIL — `Unable to find an element with text: Photos are sent to Google to read the text (Cloud Vision, …`.

- [ ] **Step 3: Update the component**

In `src/components/AddTransactionSheet.tsx`, replace the privacy `Text`'s content with exactly the sentence above. Keep the `styles.privacy` style.

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest AddTransactionSheet AddTransactionFab && npx tsc --noEmit && npx jest`
Expected: PASS; tsc no output; full suite green (same count as before this task).

- [ ] **Step 5: Commit**
```bash
git add src/components/AddTransactionSheet.tsx __tests__/components/AddTransactionSheet.test.tsx
git commit -m "feat: disclose the Gemini fallback in the scan privacy note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Out of scope / known limitations

Auto-filling amount/category/date from the text; linking a `.txt` to a specific transaction; PDFs or multi-page documents; showing remaining quota in the UI. If Vision succeeds but the `.txt` upload fails, that `requestId` ends `failed` and its text is lost (quota still counted) — retrying needs a new scan. A `pg_net` cleanup call that fails isn't retried automatically; CLAUDE.md documents the orphan query. Image dedupe matches exact bytes only: two camera shots of the same receipt are different images and each costs a Vision unit. The 900/month cap is app-side; Google can't enforce a monthly cap for us, so the $1 budget alert is the only external backstop.

**Gemini fallback limitations:**
- Gemini's free-tier rate limits aren't published; they're visible only in AI Studio. A Gemini `429` after a Vision failure ends the scan as `502 ocr_failed`, and that scan still counts toward quota.
- While Vision billing stays off, every scan makes a fast, uncharged, failing Vision call before Gemini. Unset `GOOGLE_VISION_API_KEY` to go Gemini-only and skip it.
- Gemini transcription can differ slightly from Vision's (spacing, reading order). The note is user-editable, so that's acceptable.
- The response doesn't say which provider answered. The function logs it as `ocr: text read { scanId, provider }`.

## Self-review (writing-plans checklist)

- **Spec coverage:** camera (T9) · file upload (T9) · OCR via Vision (T3) · per-user + global limits (T2, verified T3) · **Vision free tier** — 900/month PT cap + 40/day global + 20/day & 5/h per user (T2; verified T3 #10, #11, #11b), identical-image dedupe (T2, T3; verified T3 #3b), one feature + text-only field mask + header key (T3), smaller images (T1 1.5 MiB cap, T6 1600px/0.6) · `.txt` in Storage (T3), download (T7, T11) · note prefill (T8, T10) · delete keeping quota (T3, T11) · 3-button sheet (T9) · deep-link image sink removed (T10) · **text limit** 20,000 chars (T1 clamp, T3 response, T10 notice) · **idempotency** (T2 unique key + replay, T3 replay paths, T5/T9 requestId, T7 single safe retry; verified T3 #3, #6, #7) · **storage failures** — upload ok/status failed (T3 retry + replay + T2 reconciliation; verified T3 #6, #8), missing object on delete (T3; verified T3 #9) · **account cleanup** (T4 trigger + purge; verified T4).
- **Placeholder scan:** every code step has complete code; the only conditional is the manipulator API fallback in T6, which is spelled out.
- **Amendment coverage (Gemini fallback):**
  - "Integrate a Google AI endpoint if Vision isn't available": T13 adds the pure provider module and the Vision → Gemini fallback, unit-tested for success, fallback, a throw becoming a network failure, and all providers failing. T3's `index.ts` wires the fetches, and either key alone is valid.
  - Live proof: while Vision billing is off, a `200` in T3 section #2 can only come from Gemini.
  - Privacy disclosure (user-chosen): T14.
  - Docs and setup: T12 and Prerequisite step 4.
  - Facts verified against Google's docs on 2026-10-05: `generateContent` is still supported, model `gemini-3.5-flash-lite`, free tier needs no billing, free-tier content is used for product improvement, and Flash-Lite defaults to minimal thinking.
  - Type consistency: `ProviderAttempt`, `ProviderResult` and `ReadOutcome` (T13) match their use in `index.ts`, where `runNewScan` now takes `mimeType` and `scanImage` no longer takes a key.
- **Checked against the repo (second review):** `TransactionForm` already falls back per field (`initialValues?.x ?? default`), so the partial prefill only needs the type change; the existing form test file has 5 tests (→ 6); `app/_layout.tsx`'s `MutationCache.onError` toasts `error.message`, so `OcrRequestError` messages reach the user; `transactions.note` is unconstrained `text`; `supabase/config.toml` exists with no `[functions]` section; `.env` has `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_SUPABASE_ACCESS_TOKEN`; the project still has a legacy `service_role` key (the function's `SUPABASE_SERVICE_ROLE_KEY` and the scripts' Bearer auth rely on it); supabase-js exports `FunctionsFetchError`/`FunctionsRelayError`/`FunctionsHttpError`, and an `invoke` timeout surfaces as `FunctionsFetchError`. Fixed in this pass: tsconfig `exclude` now repeats the Expo base entries (T3), the list row's text column can shrink (T8), the iOS picker waits for the sheet to finish closing (T9), the README step position (T12).
- **Third review (navigator, web, trigger runtime):** expo-router 57's bottom tabs keep `transaction/new` mounted between visits (no `unmountOnBlur`), so T9/T10 now key each visit on a `visit` param (second scan is read; stale amount/note can't carry over; foreign `visit` ids get a plain form — 2 new tests); the iOS picker deferral has an 800 ms fallback in case `onDismiss` never fires; the function reuses `corsHeaders` from `@supabase/supabase-js/cors` (pinned to the app's 2.110.7) instead of a hand-written list, and the live test checks the web preflight; the cleanup trigger's `pg_net` timeout is 30 s (default 5 s, never retried); the purge route refuses accounts that still exist (409, live-tested); the prerequisite spells out "Application restrictions → None". Verified read-only: `postgres` (the migration and `db query` role) can read `vault.decrypted_secrets`, call `vault.create_secret`, and add triggers on `auth.users`; the existing `on_auth_user_created` trigger is this app's `public.seed_default_categories`.
- **Type consistency:** `OcrScanResult` (`truncated` included) and `OcrLimitReason` are defined once in `shared.ts` (T1) and used by T3, T5, T7, T10; `PreparedScanImage`/`PendingScanImage`/`useScanStore` (T6) used in T9–T10; `OcrScanRow` (`user_id`, nullable `char_count`) and `useOcrScan` variables `{ base64, mimeType, requestId }` (T7) match T10–T11; SQL `outcome`/`scan_status`/`reason` (T2) match the function's branches (T3), and `'global_monthly'` is in `OcrLimitReason` (T1) and handled by `formatOcrLimitMessage` (T5); `try_consume_ocr_quota(uuid, uuid, text)` signature matches the revoke/grant, the function's `rpc` call (`p_image_sha256`), and the live-test RPC calls; `validateImagePayload`'s `bytes` (T1) feeds `sha256Hex` (T3); every live-test insert supplies the `not null` `image_sha256`.

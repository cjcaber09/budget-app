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

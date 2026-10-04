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

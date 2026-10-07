// Deno imports are erased/handled by Jest's TypeScript transformer.
// @ts-ignore Deno uses explicit extensions.
import { OCR_BUCKET, validateCachedReceipt, type ReconciledReceipt } from './shared.ts';

export interface ReceiptStorage {
  upload(path: string, body: Blob, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown }>;
  download(path: string): Promise<{ data: Blob | null; error: unknown }>;
  remove(paths: string[]): Promise<{ error: unknown }>;
}
export function receiptPath(userId: string, scanId: string): string { return `${userId}/${scanId}.json`; }
export function objectMissing(error: unknown): boolean {
  const value = error as { status?: unknown; statusCode?: unknown } | null;
  return value?.status === 404 || value?.statusCode === '404';
}
export async function publishReceipt(storage: ReceiptStorage, path: string, text: string, receipt: ReconciledReceipt | null) {
  const jsonPath = path.replace(/\.txt$/, '.json');
  let jsonSaved = false;
  if (receipt) {
    try {
      const result = await storage.upload(jsonPath, new Blob([JSON.stringify(receipt)], { type: 'application/json' }), { contentType: 'application/json', upsert: false });
      jsonSaved = !result.error;
    } catch { /* Settled failed attempt; never publish receipt JSON in the background. */ }
  }
  let textSaved = false;
  try {
    const result = await storage.upload(path, new Blob([text], { type: 'text/plain;charset=utf-8' }), { contentType: 'text/plain;charset=utf-8', upsert: false });
    textSaved = !result.error;
  } catch { /* Failed publication is handled by the caller's ledger transition. */ }
  let cleanupFailed = false;
  if (!textSaved && receipt) {
    try { cleanupFailed = !!(await storage.remove([jsonPath])).error; } catch { cleanupFailed = true; }
  }
  return { textSaved, jsonSaved, cleanupFailed };
}
export async function readReceipt(storage: ReceiptStorage, userId: string, scanId: string): Promise<ReconciledReceipt | null> {
  const { data, error } = await storage.download(receiptPath(userId, scanId));
  if (error && !objectMissing(error)) throw new Error('storage_failed');
  if (!data || data.size > 256 * 1024) return null;
  try { return validateCachedReceipt(JSON.parse(await data.text())); } catch { return null; }
}
// Supabase bucket is deliberately named centrally; useful when wiring/test-driving adapters.
export { OCR_BUCKET };

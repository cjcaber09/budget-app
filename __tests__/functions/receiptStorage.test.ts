import { publishReceipt, readReceipt, type ReceiptStorage } from '../../supabase/functions/ocr/receiptStorage';
import { reconcileReceipt } from '../../supabase/functions/ocr/shared';
const receipt = reconcileReceipt({ merchant: 'Shop', text: 'Receipt', items: [{ name: 'Bread', amount: 10 }], deductions: [], fees: [], taxes: [], total: 10 });
const path = 'user/scan.txt';
const originalBlob = globalThis.Blob;
beforeAll(() => { globalThis.Blob = require('node:buffer').Blob; });
afterAll(() => { globalThis.Blob = originalBlob; });
function storage() {
  const files = new Map<string, Blob>();
  const adapter: ReceiptStorage = {
    upload: jest.fn(async (name, body) => { files.set(name, body); return { error: null }; }),
    download: jest.fn(async name => ({ data: files.get(name) ?? null, error: files.has(name) ? null : { statusCode: '404' } })),
    remove: jest.fn(async names => { names.forEach(name => files.delete(name)); return { error: null }; }),
  };
  return { files, adapter };
}
it('does not publish text until the JSON attempt has settled', async () => {
  const { adapter } = storage();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  (adapter.upload as jest.Mock).mockImplementation(async name => { if (name.endsWith('.json')) await pending; return { error: null }; });
  const publication = publishReceipt(adapter, path, 'Receipt', receipt);
  await Promise.resolve();
  expect(adapter.upload).toHaveBeenCalledTimes(1);
  release();
  await publication;
  expect((adapter.upload as jest.Mock).mock.calls.map(call => call[0])).toEqual(['user/scan.json', 'user/scan.txt']);
});
it('tolerates failed JSON publication before committing text, with no later JSON writer', async () => {
  const { adapter } = storage();
  (adapter.upload as jest.Mock).mockImplementation(async name => ({ error: name.endsWith('.json') ? { code: 'failure' } : null }));
  await expect(publishReceipt(adapter, path, 'Receipt', receipt)).resolves.toEqual({ jsonSaved: false, textSaved: true, cleanupFailed: false });
  expect(adapter.upload).toHaveBeenCalledTimes(2);
});
it('cleans JSON after failed text publication and records failed cleanup', async () => {
  const { adapter } = storage();
  (adapter.upload as jest.Mock).mockImplementation(async name => ({ error: name.endsWith('.txt') ? {} : null }));
  (adapter.remove as jest.Mock).mockResolvedValue({ error: {} });
  await expect(publishReceipt(adapter, path, 'Receipt', receipt)).resolves.toMatchObject({ textSaved: false, cleanupFailed: true });
  expect(adapter.remove).toHaveBeenCalledWith(['user/scan.json']);
});
it('supports legacy text-only scans, but treats operational errors as retryable failures', async () => {
  const { adapter } = storage();
  await expect(readReceipt(adapter, 'user', 'scan')).resolves.toBeNull();
  (adapter.download as jest.Mock).mockResolvedValue({ data: null, error: { status: 503 } });
  await expect(readReceipt(adapter, 'user', 'scan')).rejects.toThrow('storage_failed');
});
it('roundtrips validated rows, recomputes derived totals, and rejects malformed envelopes', async () => {
  const { adapter, files } = storage();
  await publishReceipt(adapter, path, 'Receipt', receipt);
  await expect(readReceipt(adapter, 'user', 'scan')).resolves.toMatchObject({ computedTotalCents: 1000 });
  files.set('user/scan.json', new Blob([JSON.stringify({ ...receipt, computedTotalCents: 123 })]));
  await expect(readReceipt(adapter, 'user', 'scan')).resolves.toMatchObject({ computedTotalCents: 1000 });
  files.set('user/scan.json', new Blob(['invalid']));
  await expect(readReceipt(adapter, 'user', 'scan')).resolves.toBeNull();
});
it('Vision writes only the text artifact', async () => {
  const { adapter } = storage();
  await publishReceipt(adapter, path, 'Vision text', null);
  expect(adapter.upload).toHaveBeenCalledTimes(1);
  expect((adapter.upload as jest.Mock).mock.calls[0][0]).toBe(path);
});

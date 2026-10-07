// One real OCR call; all writes belong to throwaway users removed in finally.
// Requires deployed migration 0013/OCR and the supplied, git-ignored receipt fixture.
import { loadEnvFile } from 'node:process';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { centsToDecimal, sumItemCents } from '../supabase/functions/ocr/shared.ts';
loadEnvFile();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const access = process.env.EXPO_SUPABASE_ACCESS_TOKEN;
const ref = new URL(url).hostname.split('.')[0];
if (readFileSync('supabase/.temp/project-ref','utf8').trim() !== ref) throw new Error('Project mismatch');
const fixture = process.env.OCR_TEST_IMAGE ?? 'assets/images/sample-receipts/receipt1.jpg';
const image = readFileSync(fixture);
const mime = /\.png$/i.test(fixture) ? 'image/png' : /\.webp$/i.test(fixture) ? 'image/webp' : 'image/jpeg';
const expected = Number(process.env.OCR_TEST_TOTAL_CENTS ?? '286690');
const keyResponse = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10000) });
if (!keyResponse.ok) throw new Error(`Could not read test credentials (HTTP ${keyResponse.status})`);
const keys = await keyResponse.json();
const service = keys.find(key => key.name === 'service_role')?.api_key;
if (!service) throw new Error('No service role test key');
let passed = 0;
const users = [];
async function api(path, method = 'GET', body, token = service, profile = false) {
  const response = await fetch(`${url}${path}`, {
    method, headers: { apikey: token === service ? service : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      ...(profile ? { 'Accept-Profile': 'budget_tracker', 'Content-Profile': 'budget_tracker' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(40000),
  });
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
}
function check(condition, label) {
  if (!condition) throw new Error(`FAIL ${label}`);
  passed++; console.log(`PASS ${label}`);
}
function saved(response) { return Array.isArray(response.body) ? response.body[0] : response.body; }
async function createUser() {
  const email = `receipt-items-${randomUUID()}@${process.env.OCR_TEST_EMAIL_DOMAIN ?? 'example.com'}`;
  const password = randomBytes(24).toString('hex');
  const created = await api('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  if (!created.ok || !created.body?.id) throw new Error(`Test user creation failed (HTTP ${created.status})`);
  const user = { id: created.body.id, token: null };
  users.push(user); // Register cleanup before any further operation can fail.
  const login = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, anon);
  if (!login.ok || !login.body?.access_token) throw new Error(`Test sign-in failed (HTTP ${login.status})`);
  user.token = login.body.access_token;
  return user;
}
try {
  const a = await createUser(); const b = await createUser();
  const requestId = randomUUID();
  const scanBody = { requestId, imageBase64: image.toString('base64'), mimeType: mime, receiptSchemaVersion: 2 };
  const started = Date.now();
  const scan = await api('/functions/v1/ocr', 'POST', scanBody, a.token);
  check(scan.ok && scan.body?.receipt?.rows?.length > 0, 'structured receipt scan');
  check(Date.now() - started < 30000, 'scan fits client timeout');
  const receipt = scan.body.receipt;
  console.log('Classification fields:', JSON.stringify({schemaVersion:receipt.schemaVersion,transactionType:receipt.transactionType,documentKind:receipt.documentKind,paymentStatus:receipt.paymentStatus}));
  check(receipt.schemaVersion === 2 && ['expense','unknown'].includes(receipt.transactionType) && receipt.documentKind === 'purchase', 'versioned purchase classification');
  check(receipt.totalDebitedCents === expected, 'printed payable total matches supplied fixture');
  const reviewedExpenseCents = sumItemCents(receipt.rows,'expense');
  check(receipt.transactionType === 'unknown' ? receipt.computedTotalCents === null : reviewedExpenseCents === receipt.computedTotalCents, 'shared cents and unresolved total contract');
  const replay = await api('/functions/v1/ocr', 'POST', scanBody, a.token);
  check(replay.ok && replay.body.scanId === scan.body.scanId && JSON.stringify(replay.body.receipt) === JSON.stringify(receipt), 'receipt JSON replay');
  const dedupe = await api('/functions/v1/ocr', 'POST', { ...scanBody, requestId: randomUUID() }, a.token);
  check(dedupe.ok && dedupe.body.scanId === scan.body.scanId, 'same-image dedupe without another provider call');
  const categories = await api('/rest/v1/categories?select=id&limit=1', 'GET', undefined, a.token, true);
  check(categories.ok && categories.body.length === 1, 'owner category available');
  const scanDate = new Date(started);
  const scanDay = `${scanDate.getFullYear()}-${String(scanDate.getMonth()+1).padStart(2,'0')}-${String(scanDate.getDate()).padStart(2,'0')}`;
  // Saving below is an explicit synthetic RPC exercise, not an assertion that
  // the UI permits uncertain/noncompleted OCR proof to be saved automatically.
  const tx = { operation: 'create', payload_version: 2, id: randomUUID(), type: 'expense', category_id: categories.body[0].id, amount: centsToDecimal(reviewedExpenseCents), note: receipt.merchant, occurred_at: new Date().toISOString(), transaction_date: receipt.receiptDate ?? scanDay, payment_details: receipt.paymentDetails };
  const rows = receipt.rows.map(row => ({ kind: row.kind, label: row.label, amount: centsToDecimal(row.amountCents), quantity: row.quantity,
    unit_price: row.unitPriceCents === null ? null : centsToDecimal(row.unitPriceCents), tax_included: row.taxIncluded, affects_total: row.affectsTotal !== false, is_payment_summary: row.isPaymentSummary === true, fee_party: row.feeParty ?? null }));
  const rpc = (transaction, items, token = a.token) => api('/rest/v1/rpc/save_transaction', 'POST', { p_transaction: transaction, p_items: items }, token, true);
  const created = await rpc(tx, rows);
  if (!created.ok) console.error('RPC diagnostic:', JSON.stringify({status:created.status,code:created.body?.code,message:created.body?.message,count:rows.length,reviewedExpenseCents}));
  check(created.ok && Number(saved(created).amount) === reviewedExpenseCents / 100, 'atomic itemized save');
  const retry = await rpc(tx, rows);
  check(retry.ok && saved(retry).id === tx.id, 'stable create retry');
  const conflict = await rpc({ ...tx, note: 'Conflicting retry' }, rows);
  check(!conflict.ok && conflict.body?.code === '23505', 'conflicting create rejected');
  const stored = await api(`/rest/v1/transaction_items?transaction_id=eq.${tx.id}&order=position`, 'GET', undefined, a.token, true);
  check(stored.ok && stored.body.length === rows.length, 'ordered rows persisted');
  const foreignRead = await api(`/rest/v1/transaction_items?transaction_id=eq.${tx.id}`, 'GET', undefined, b.token, true);
  check(foreignRead.ok && foreignRead.body.length === 0, 'foreign rows hidden by RLS');
  const foreignSave = await rpc({ ...tx, operation: 'update' }, rows, b.token);
  check(!foreignSave.ok && foreignSave.body?.code === '42501', 'foreign update rejected');
  const edited = [{ kind: 'item', label: 'Replacement fixture row', amount: '10.00', quantity: null, unit_price: null, tax_included: false }];
  const update = await rpc({ ...tx, operation: 'update' }, edited);
  const replaced = await api(`/rest/v1/transaction_items?transaction_id=eq.${tx.id}`, 'GET', undefined, a.token, true);
  check(update.ok && Number(saved(update).amount) === 10 && replaced.body.length === 1 && replaced.body[0].label === edited[0].label, 'editing replaces rows and computes amount');
  const income = await rpc({ ...tx, operation: 'update', type: 'income', category_id: null, amount: '123.45' }, []);
  const cleared = await api(`/rest/v1/transaction_items?transaction_id=eq.${tx.id}`, 'GET', undefined, a.token, true);
  check(income.ok && Number(saved(income).amount) === 123.45 && cleared.body.length === 0, 'income conversion clears rows');
  const payment = { ...tx, id: randomUUID(), type: 'income', category_id: null, transaction_date: '2026-09-01', payment_details: { documentKind: 'transfer', fromName: 'Synthetic sender', fromNumber: '0912 *** 0042', fromNumberType: 'phone', reference: '00001234' } };
  const paymentRows = [
    { ...edited[0], label: 'Payment received', amount: '1000.00', affects_total: true, is_payment_summary: true, fee_party: null },
    { ...edited[0], kind: 'fee', label: 'Recipient fee', amount: '10.00', affects_total: true, is_payment_summary: false, fee_party: 'recipient' },
  ];
  const paymentSaved = await rpc(payment, paymentRows);
  check(paymentSaved.ok && Number(saved(paymentSaved).amount) === 990 && saved(paymentSaved).transaction_date === payment.transaction_date && saved(paymentSaved).payment_details.fromNumber === payment.payment_details.fromNumber, 'income net, sender and date persisted');
  check((await rpc(payment, paymentRows)).ok, 'payment exact retry');
  const changedDate = await rpc({ ...payment, transaction_date: '2026-09-02' }, paymentRows);
  check(!changedDate.ok && changedDate.body?.code === '23505', 'payment date retry conflict');
  const legacy = { ...payment, operation: 'update', payload_version: 1 };
  delete legacy.payment_details;
  check(!(await rpc(legacy, [])).ok, 'legacy edit cannot erase payment details');
  const infoRows = paymentRows.map(row => row.kind === 'fee' ? { ...row, affects_total: false } : row);
  const preserved = { ...payment, operation: 'update' };
  delete preserved.payment_details; delete preserved.transaction_date;
  const infoSaved = await rpc(preserved, infoRows);
  check(infoSaved.ok && Number(saved(infoSaved).amount) === 1000 && saved(infoSaved).transaction_date === payment.transaction_date && saved(infoSaved).payment_details.reference === '00001234', 'informational fee and omitted metadata preservation');
  const month = await api(`/rest/v1/transactions?id=eq.${payment.id}&transaction_date=gte.2026-09-01&transaction_date=lt.2026-10-01`, 'GET', undefined, a.token, true);
  check(month.ok && month.body.length === 1, 'receipt calendar date month filtering');
  const deleted = await api('/functions/v1/ocr', 'DELETE', { scanId: scan.body.scanId }, a.token);
  check(deleted.status === 204, 'scan delete succeeds');
  for (const ext of ['txt','json']) {
    const artifact = await api(`/storage/v1/object/authenticated/budget-tracker-ocr/${a.id}/${scan.body.scanId}.${ext}`);
    check(!artifact.ok && (artifact.status === 404 || artifact.body?.statusCode === '404'), `${ext} artifact removed`);
  }
  const afterDelete = await api('/functions/v1/ocr', 'POST', scanBody, a.token);
  check(afterDelete.status === 410, 'deleted scan stays deleted');
  console.log(`Live receipt checks: ${passed} passed`);
} finally {
  let cleanupFailed = false;
  for (const user of users) {
    try {
      const listed = await api('/storage/v1/object/list/budget-tracker-ocr', 'POST', { prefix: user.id, limit: 1000 });
      if (!listed.ok || !Array.isArray(listed.body)) throw new Error('list');
      if (listed.body.length) {
        const removed = await api('/storage/v1/object/budget-tracker-ocr', 'DELETE', { prefixes: listed.body.map(file => `${user.id}/${file.name}`) });
        if (!removed.ok) throw new Error('remove');
      }
      const removedUser = await api(`/auth/v1/admin/users/${user.id}`, 'DELETE');
      if (!removedUser.ok) throw new Error('user');
    } catch { cleanupFailed = true; console.error(`Cleanup needs retry for test user ${user.id}`); }
  }
  if (cleanupFailed) throw new Error('Live test cleanup incomplete; retry before finishing.');
  console.log('Cleanup: throwaway users and receipt files removed');
}

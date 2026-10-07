// Synthetic payment RPC checks only; no image or OCR provider call.
// Requires deployed migration 0013; throwaway users removed in finally.
import { loadEnvFile } from 'node:process';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
loadEnvFile();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const access = process.env.EXPO_SUPABASE_ACCESS_TOKEN;
const ref = new URL(url).hostname.split('.')[0];
if (readFileSync('supabase/.temp/project-ref','utf8').trim() !== ref) throw new Error('Project mismatch');
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
  const a = await createUser();
  const tx = { operation:'create',payload_version:2,id:randomUUID(),type:'income',category_id:null,amount:'1000.00',note:'Synthetic payment verification',occurred_at:new Date().toISOString() };
  const edited = [{kind:'item',label:'Payment',amount:'1000.00',quantity:null,unit_price:null,tax_included:false}];
  const rpc = (transaction,items) => api('/rest/v1/rpc/save_transaction','POST',{p_transaction:transaction,p_items:items},a.token,true);
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
  console.log(`Live synthetic payment checks: ${passed} passed`);
} finally {
  let cleanupFailed = false;
  for (const user of users) {
    try {
      const removedUser = await api(`/auth/v1/admin/users/${user.id}`, 'DELETE');
      if (!removedUser.ok) throw new Error('user');
    } catch { cleanupFailed = true; console.error(`Cleanup needs retry for test user ${user.id}`); }
  }
  if (cleanupFailed) throw new Error('Live test cleanup incomplete; retry before finishing.');
  console.log('Cleanup: throwaway users removed; no receipt files created');
}

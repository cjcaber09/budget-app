// Synthetic profile/analytics checks; no user images or OCR calls.
// Requires migrations 0015-0017 and updated deleted-account purge.
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
  const user = { id: created.body.id, token: null, email, password };
  users.push(user); // Register cleanup before any further operation can fail.
  const login = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, anon);
  if (!login.ok || !login.body?.access_token) throw new Error(`Test sign-in failed (HTTP ${login.status})`);
  user.token = login.body.access_token;
  return user;
}
const avatarFiles=[];
try {
  const a=await createUser();const b=await createUser();
  const zone='Asia/Manila';const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const today=`${values.year}-${values.month}-${values.day}`;const month=today.slice(0,7)+'-01';
  const previous=new Date(`${month}T00:00:00Z`);previous.setUTCMonth(previous.getUTCMonth()-1);
  check((await api('/rest/v1/profiles','POST',{user_id:a.id,display_name:'Synthetic profile',currency:'PHP',timezone:zone},a.token,true)).ok,'profile create');
  check((await api(`/rest/v1/profiles?user_id=eq.${a.id}`,'PATCH',{appearance:'light'},a.token,true)).ok,'partial appearance update');
  const profile=await api(`/rest/v1/profiles?user_id=eq.${a.id}`,'GET',undefined,a.token,true);
  check(profile.body?.[0]?.currency==='PHP'&&profile.body[0].timezone===zone&&profile.body[0].appearance==='light','partial update preserves other preferences');
  const foreign=await api(`/rest/v1/profiles?user_id=eq.${a.id}`,'GET',undefined,b.token,true);
  check(foreign.ok&&foreign.body.length===0,'profile owner isolation');
  check(!(await api(`/rest/v1/profiles?user_id=eq.${a.id}`,'PATCH',{timezone:'Invalid/Zone'},a.token,true)).ok,'invalid timezone rejected');
  check((await api('/rest/v1/rpc/set_monthly_allowance','POST',{p_month:previous.toISOString().slice(0,10),p_amount:'5000.00'},a.token,true)).ok,'prior monthly limit');
  const rpc=(name,body,token=a.token)=>api('/rest/v1/rpc/'+name,'POST',body,token,true);
  check((await rpc('prepare_dashboard',{p_month:month})).ok,'prepare and inherit limit');
  let snapshot=await rpc('dashboard_snapshot',{p_month:month});
  check(snapshot.ok&&snapshot.body.limitCents===500000&&snapshot.body.complete&&snapshot.body.timezone===zone,'consistent dashboard snapshot');
  const category=(await api('/rest/v1/categories?select=id&limit=1','GET',undefined,a.token,true)).body[0].id;
  const due=new Date(`${today}T12:00:00Z`);due.setUTCDate(due.getUTCDate()+1);const dueDay=due.toISOString().slice(0,10);const dueMonth=dueDay.slice(0,7)+'-01';
  const rule=await rpc('save_recurring_rule',{p_rule:{categoryId:category,amount:'100.00',note:'Synthetic utility bill',frequency:'monthly',nextDueDate:dueDay,monthEnd:false}});
  check(rule.ok,'anchored recurring rule');
  check(!(await api(`/rest/v1/recurring_rules?id=eq.${saved(rule).id}`,'PATCH',{amount:999},a.token,true)).ok,'legacy schedule write rejected');
  check((await rpc('prepare_dashboard',{p_month:dueMonth})).ok,'future bill generation');
  snapshot=await rpc('dashboard_snapshot',{p_month:dueMonth});const bill=snapshot.body.bills.find(x=>x.label==='Synthetic utility bill'&&x.scheduled_date===dueDay);
  check(!!bill&&snapshot.body.reservedCents===10000,'outstanding bill reserved once');
  const tx={payload_version:2,operation:'create',id:randomUUID(),type:'expense',category_id:category,amount:'90.00',note:'Synthetic paid bill',occurred_at:new Date().toISOString(),transaction_date:today,payment_details:null};
  const body={p_occurrence:bill.id,p_command:'record',p_transaction:tx,p_items:[]};
  check(!(await rpc('bill_command',body)).ok,'different amount requires settlement confirmation');
  const recorded=await rpc('bill_command',{...body,p_confirm_difference:true});
  check(recorded.ok&&recorded.body.transaction.occurrence_id===bill.id&&Number(recorded.body.transaction.amount)===90,'confirmed full settlement');
  check((await rpc('bill_command',{...body,p_confirm_difference:true})).ok,'bill recording exact retry');
  check(!(await rpc('bill_command',{p_occurrence:bill.id,p_command:'skip'},b.token)).ok,'foreign bill command rejected');
  check(!(await api(`/rest/v1/transactions?id=eq.${tx.id}`,'DELETE',undefined,a.token,true)).ok,'direct linked-expense deletion rejected');
  check((await rpc('bill_command',{p_occurrence:bill.id,p_command:'replace'})).ok,'replacement command');
  check((await rpc('prepare_dashboard',{p_month:dueMonth})).ok,'catch-up after replacement');
  snapshot=await rpc('dashboard_snapshot',{p_month:dueMonth});
  check(snapshot.body.bills.find(x=>x.id===bill.id)?.state==='replacement'&&snapshot.body.reservedCents===10000,'replacement stays reserved without regeneration');
  check((await rpc('bill_command',{p_occurrence:bill.id,p_command:'skip'})).ok,'skip command');
  snapshot=await rpc('dashboard_snapshot',{p_month:dueMonth});
  check(snapshot.body.reservedCents===0,'skipped bill no longer reserved');
  const future=(new Date(`${month}T00:00:00Z`));future.setUTCMonth(future.getUTCMonth()+2);const futureMonth=future.toISOString().slice(0,10);
  check((await rpc('prepare_dashboard',{p_month:futureMonth})).ok,'future preview prepare');
  const futureLimit=await api(`/rest/v1/monthly_limits?user_id=eq.${a.id}&month=eq.${futureMonth}`,'GET',undefined,a.token,true);
  check(futureLimit.ok&&futureLimit.body.length===0,'future preview does not freeze inherited limit');
  const avatar=`${a.id}/${randomUUID()}.jpg`;avatarFiles.push(avatar);
  const upload=await fetch(`${url}/storage/v1/object/budget-tracker-avatars/${avatar}`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${a.token}`,'Content-Type':'image/jpeg'},body:new Uint8Array([255,216,255,217]),signal:AbortSignal.timeout(10000)});
  check(upload.ok,'private avatar storage upload with synthetic marker fixture');
  const signed=await api(`/storage/v1/object/sign/budget-tracker-avatars/${avatar}`,'POST',{expiresIn:60},a.token);
  check(signed.ok,'owner avatar signed URL');
  const denied=await api(`/storage/v1/object/sign/budget-tracker-avatars/${avatar}`,'POST',{expiresIn:60},b.token);
  check(!denied.ok,'foreign avatar denied');
  check((await api(`/rest/v1/profiles?user_id=eq.${a.id}&avatar_path=is.null`,'PATCH',{avatar_path:avatar},a.token,true)).ok,'avatar path compare-and-set');
  const newPassword=randomBytes(24).toString('hex');
  const password=await api('/auth/v1/user','PUT',{password:newPassword,current_password:a.password},a.token);
  check(password.ok,'synthetic account password update');
  const login=await api('/auth/v1/token?grant_type=password','POST',{email:a.email,password:newPassword},anon);
  check(login.ok&&login.body?.user?.id===a.id,'new password sign-in');
  console.log(`Live profile/analytics checks: ${passed} passed`);
} finally {
  let cleanupFailed=false;
  for(const user of users){
    try{const removed=await api(`/auth/v1/admin/users/${user.id}`,'DELETE');if(!removed.ok)throw new Error('user cleanup');}
    catch{cleanupFailed=true;console.error(`Cleanup needs retry for synthetic user ${user.id}`);}
  }
  for(const path of avatarFiles){
    let gone=false;
    for(let attempt=0;attempt<12;attempt++){
      const response=await api('/storage/v1/object/list/budget-tracker-avatars','POST',{prefix:path.split('/')[0],limit:100});
      if(response.ok&&Array.isArray(response.body)&&!response.body.some(file=>file.name===path.split('/')[1])){gone=true;break;}await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!gone){const removed=await api('/storage/v1/object/budget-tracker-avatars','DELETE',{prefixes:[path]});if(!removed.ok)cleanupFailed=true;console.error('Deleted-account avatar purge did not complete automatically; explicit cleanup attempted.');}
    else console.log('PASS deleted-account avatar purge');
  }
  if(cleanupFailed)throw new Error('Synthetic test cleanup incomplete; resolve before finishing.');
  console.log('Cleanup: synthetic users and avatar fixture removed');
}

// Synthetic users/files only. No emails, real receipts or OCR provider calls.
import {randomUUID,randomBytes} from 'node:crypto';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject(),url=process.env.EXPO_PUBLIC_SUPABASE_URL,anon=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const keys=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/api-keys?reveal=true`,{headers:{Authorization:`Bearer ${project.accessToken}`}}).then(r=>r.json());
const service=keys.find(k=>k.name==='service_role')?.api_key;if(!service)throw new Error('Synthetic-test admin credentials unavailable.');
const owners=[],requests=[];let checks=0;
async function api(path,body,token=service,method='POST',schema=false){
 const r=await fetch(url+path,{method,headers:{apikey:token===service?service:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(schema?{'Accept-Profile':'budget_tracker','Content-Profile':'budget_tracker'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
 return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)};
}
function check(ok,label){if(!ok)throw new Error('FAIL '+label);checks++;console.log('PASS '+label);}
async function create(){
 const email=`mvp-${randomUUID()}@example.com`,password=randomBytes(24).toString('hex');
 const created=await api('/auth/v1/admin/users',{email,password,email_confirm:true});check(created.ok&&created.data.id,'synthetic owner created');owners.push(created.data.id);
 const login=await api('/auth/v1/token?grant_type=password',{email,password},anon);check(login.ok&&login.data.access_token,'synthetic password login');
 await queryDatabase(project,`insert into budget_tracker.profiles(user_id,timezone,currency)values('${created.data.id}','UTC','PHP')on conflict(user_id)do nothing;`);
 return {id:created.data.id,email,password,token:login.data.access_token};
}
try{
 const a=await create(),b=await create(),month=new Date().toISOString().slice(0,7)+'-01';
 const category=await api('/rest/v1/categories?select=id&limit=1',undefined,a.token,'GET',true);
 const saved=await api('/rest/v1/rpc/save_transaction',{p_transaction:{payload_version:4,operation:'create',id:randomUUID(),type:'expense',category_id:category.data[0].id,amount:'12.34',note:'Synthetic export',occurred_at:new Date().toISOString(),transaction_date:month},p_items:[]},a.token,'POST',true);
 check(saved.ok,'synthetic expense saved');
 const analysis=await api('/rest/v1/rpc/report_export_snapshot',{p_start_month:month,p_end_month:month},a.token,'POST',true);
 check(analysis.ok&&analysis.data.rows.find(r=>r.row_type==='monthly').spending==='1234','deployed exact spending export');
 const transactions=await api('/rest/v1/rpc/transaction_export_snapshot',{p_month:month},a.token,'POST',true);
 check(transactions.ok&&transactions.data.rows.length===1&&transactions.data.rows[0].payment_account==='Cash','deployed joined transaction export');
 const wrong=await api('/functions/v1/delete-account',{action:'delete',requestId:randomUUID(),password:'incorrect-synthetic'},a.token);
 check(wrong.status===403&&wrong.data.error==='password_not_accepted','wrong password cannot initiate deletion');
 const lease=randomUUID(),leased=await api('/rest/v1/rpc/begin_account_scan',{p_owner:a.id,p_lease:lease},service,'POST',true);check(leased.ok&&leased.data===true,'scan lease admitted before deletion');
 const marker=await fetch(`${url}/storage/v1/object/budget-tracker-avatars/${a.id}/synthetic.jpg`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${a.token}`,'Content-Type':'image/jpeg'},body:'synthetic marker, not an image'});check(marker.ok,'owned synthetic storage marker');
 const requestId=randomUUID();requests.push(requestId);
 const started=await api('/functions/v1/delete-account',{action:'delete',requestId,password:a.password,ownerId:b.id},a.token);
 check(started.status===202&&started.data.state==='pending','deletion starts with durable status and derives its owner');
 await queryDatabase(project,`update budget_tracker.account_deletions set settle_after=now()-interval '1 minute' where request_id='${requestId}' and owner_id='${a.id}';`);
 const held=await api('/functions/v1/delete-account',{action:'status',requestId},a.token);check(held.data.state==='pending','in-flight scan prevents final deletion');
 const blocked=await api('/rest/v1/profiles?user_id=eq.'+a.id,{display_name:'Blocked'},a.token,'PATCH',true);check(!blocked.ok,'financial writes blocked during deletion');
 const upload=await fetch(`${url}/storage/v1/object/budget-tracker-avatars/${a.id}/blocked.jpg`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${a.token}`,'Content-Type':'image/jpeg'},body:'synthetic marker'});check(!upload.ok,'avatar publication blocked during deletion');
 const isolated=await api('/functions/v1/delete-account',{action:'status',requestId},b.token);check(!isolated.ok,'foreign owner cannot inspect deletion');
 await queryDatabase(project,`delete from budget_tracker.account_scan_leases where id='${lease}' and owner_id='${a.id}';`);
 const finished=await api('/functions/v1/delete-account',{action:'status',requestId},a.token);check(finished.ok&&finished.data.state==='completed','account and files permanently deleted');
 const retry=await api('/functions/v1/delete-account',{action:'status',requestId},a.token);check(retry.ok&&retry.data.state==='completed','lost-response retry works after Auth deletion');
 const stale=await api('/rest/v1/rpc/account_deletion_status',{},a.token,'POST',true);check(stale.ok&&stale.data.state==='completed','owner-only JWT-verified status survives Auth deletion');
 const vault=await queryDatabase(project,"select decrypted_secret from vault.decrypted_secrets where name='budget_tracker_ocr_webhook_secret';");
 const worker=await fetch(url+'/functions/v1/delete-account',{method:'POST',headers:{'Content-Type':'application/json','x-ocr-webhook-secret':vault[0].decrypted_secret},body:JSON.stringify({action:'worker'})});
 check(worker.ok,'private scheduled-worker path authenticates and sweeps');
 const other=await api('/auth/v1/admin/users/'+b.id,undefined,service,'GET');check(other.ok&&other.data.id===b.id,'second owner preserved');
 const files=await api('/storage/v1/object/list/budget-tracker-avatars',{prefix:a.id,limit:100});check(files.ok&&files.data.length===0,'authoritative storage metadata empty');
 // Verify code-based recovery without sending mail to a synthetic address.
 const generated=await api('/auth/v1/admin/generate_link',{type:'recovery',email:b.email});check(generated.ok&&generated.data.email_otp,'synthetic recovery code generated without email');
 const verified=await api('/auth/v1/verify',{type:'recovery',email:b.email,token:generated.data.email_otp},anon);check(verified.ok&&verified.data.access_token,'eight-digit recovery verification');
 const next=randomBytes(24).toString('hex'),changed=await api('/auth/v1/user',{password:next},verified.data.access_token,'PUT');check(changed.ok,'recovery password saved');
 const newLogin=await api('/auth/v1/token?grant_type=password',{email:b.email,password:next},anon);check(newLogin.ok,'new synthetic password signs in');
 const oldLogin=await api('/auth/v1/token?grant_type=password',{email:b.email,password:b.password},anon);check(!oldLogin.ok,'old synthetic password rejected');
 console.log(`PASS ${checks} hosted synthetic checks.`);
}finally{
 for(const owner of owners){
  for(const bucket of ['budget-tracker-avatars','budget-tracker-ocr']){
   const listed=await api('/storage/v1/object/list/'+bucket,{prefix:owner,limit:100});
   if(listed.ok&&listed.data.length)await api('/storage/v1/object/'+bucket,{prefixes:listed.data.filter(f=>f.id).map(f=>owner+'/'+f.name)},service,'DELETE');
  }
  const r=await api('/auth/v1/admin/users/'+owner,undefined,service,'DELETE');if(!r.ok&&r.status!==404)throw new Error('Synthetic owner cleanup failed.');
  await queryDatabase(project,`delete from budget_tracker.account_scan_leases where owner_id='${owner}';delete from budget_tracker.account_deletions where owner_id='${owner}';`);
 }
 console.log('Synthetic owners, files and private operations cleaned.');
}

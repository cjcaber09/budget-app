// Throwaway Auth owners and tiny synthetic files only. No email or OCR calls.
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
import {cleanupFixtures} from './lib/cleanup.mjs';
const project=loadLinkedProject(),url=process.env.EXPO_PUBLIC_SUPABASE_URL,anon=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const keys=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/api-keys?reveal=true`,{headers:{Authorization:`Bearer ${project.accessToken}`},signal:AbortSignal.timeout(30000)}).then(r=>r.json());
const service=keys.find(k=>k.name==='service_role')?.api_key;if(!service)throw new Error('Synthetic test credentials unavailable.');
const options={db:{schema:'budget_tracker'},auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,service,options);
const owners=[],files=[];let checks=0;
function check(ok,label){if(!ok)throw new Error('FAIL '+label);console.log('PASS '+label);checks++;}
async function create(){
 const password=randomBytes(24).toString('hex'),r=await admin.auth.admin.createUser({email:`finance-reset-${randomUUID()}@example.test`,password,email_confirm:true});
 if(r.error||!r.data.user)throw new Error('Synthetic user creation failed.');const id=r.data.user.id;owners.push(id);
 await queryDatabase(project,`insert into budget_tracker.profiles(user_id,display_name,timezone,currency,appearance)values('${id}','Synthetic retained profile','UTC','PHP','dark')on conflict(user_id)do nothing;`);
 const client=createClient(url,anon,options),login=await client.auth.signInWithPassword({email:r.data.user.email,password});if(login.error)throw new Error('Synthetic login failed.');
 return {id,password,client,token:login.data.session.access_token};
}
async function reset(a,action,requestId,password,extra={}){
 const r=await fetch(url+'/functions/v1/delete-account',{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify({action,requestId,...(password?{password}:{}),...extra}),signal:AbortSignal.timeout(55000)});
 return {status:r.status,data:await r.json()};
}
async function transaction(a,note='Synthetic finance reset'){
 const id=randomUUID(),r=await a.client.rpc('save_transaction',{p_transaction:{id,operation:'create',payload_version:4,type:'income',category_id:null,amount:'100.00',note,occurred_at:new Date().toISOString(),transaction_date:new Date().toISOString().slice(0,10)},p_items:[]});
 check(!r.error&&r.data?.id===id,'synthetic income saved');return id;
}
async function proof(a,tx,upload=true,mime='image/webp'){
 const id=randomUUID(),bytes=mime==='application/pdf'?new TextEncoder().encode('%PDF-1.4\n% Synthetic proof\n%%EOF'):new Uint8Array([82,73,70,70,4,0,0,0,87,69,66,80]);
 const r=await a.client.rpc('reserve_transaction_attachment',{p_transaction:tx,p_file:{id,name:mime==='application/pdf'?'Synthetic.pdf':'Synthetic.webp',mime,size:bytes.length}});
 check(!r.error,'synthetic proof reserved');const path=r.data.object_path;files.push({owner:a.id,bucket:'budget-tracker-proofs',path});
 if(upload){check(!(await a.client.storage.from('budget-tracker-proofs').upload(path,bytes,{contentType:mime})).error,'synthetic proof uploaded');check(!(await a.client.rpc('finish_transaction_attachment',{p_id:id})).error,'synthetic proof finalized');}
 return {id,path,bytes};
}
try{
 const a=await create(),b=await create(),tx=await transaction(a),otherTx=await transaction(b);
 const image=await proof(a,tx),pdf=await proof(a,tx,true,'application/pdf'),otherProof=await proof(b,otherTx);
 const avatarPath=a.id+'/avatar.jpg',avatar=readFileSync(new URL('../test-utils/avatar-fixture.jpg',import.meta.url));
 files.push({owner:a.id,bucket:'budget-tracker-avatars',path:avatarPath});check(!(await admin.storage.from('budget-tracker-avatars').upload(avatarPath,avatar,{contentType:'image/jpeg'})).error,'synthetic avatar stored');
 check(!(await a.client.from('profiles').update({avatar_path:avatarPath}).eq('user_id',a.id)).error,'avatar associated with owned profile');
 const scan=randomUUID(),ocrPath=a.id+'/'+scan+'.txt';files.push({owner:a.id,bucket:'budget-tracker-ocr',path:ocrPath});
 check(!(await admin.storage.from('budget-tracker-ocr').upload(ocrPath,'Synthetic scan',{contentType:'text/plain'})).error,'synthetic OCR artifact stored');
 await queryDatabase(project,`insert into budget_tracker.ocr_scans(id,user_id,request_id,image_sha256,status,char_count)values('${scan}','${a.id}','${randomUUID()}','${randomBytes(32).toString('hex')}','completed',14);`);
 const categories=await a.client.from('categories').select('id'),category=categories.data?.[0]?.id;check(!!category,'default categories available');
 const bank=await a.client.rpc('save_payment_method',{p_method:{id:randomUUID(),operation:'create',method:'bank_account',paymentType:'Bank account',name:'Synthetic reset bank',openingBalance:'1000.00'}});check(!bank.error,'funded payment method created');
 const today=new Date().toISOString().slice(0,10),prior=new Date(Date.now()-86400000).toISOString().slice(0,10),createId=randomUUID();
 const rulePayload={createId,categoryId:category,amount:'20.00',note:'Synthetic explicit payment',frequency:'monthly',nextDueDate:prior,paymentMethodId:bank.data.id};
 const rule=await a.client.rpc('save_recurring_rule',{p_rule:rulePayload}),again=await a.client.rpc('save_recurring_rule',{p_rule:rulePayload});check(!rule.error&&!again.error&&rule.data.id===again.data.id,'hosted bill creation exact retry returns one bill');
 check(!(await a.client.rpc('prepare_dashboard',{p_month:today.slice(0,7)+'-01'})).error,'hosted schedule preparation succeeds');
 const occurrence=await a.client.from('recurring_occurrences').select('*').eq('rule_id',rule.data.id).eq('scheduled_date',prior).single();check(!occurrence.error&&occurrence.data.state==='outstanding','funded due bill stays pending');
 const paymentId=randomUUID(),paymentArgs={p_occurrence:occurrence.data.id,p_payment_method:bank.data.id,p_transaction_id:paymentId,p_expected_amount:'20.00',p_expected_date:prior,p_payment_date:today};
 const payment=await a.client.rpc('pay_bill',paymentArgs);check(!payment.error&&payment.data.transaction.transaction_date===today,'hosted payment uses actual date');
 check(!(await a.client.rpc('pay_bill',paymentArgs)).error,'hosted payment retry remains exact');
 const request=randomUUID(),bad=await reset(a,'reset',request,'synthetic-wrong-password');check(bad.status===403&&bad.data.error==='password_not_accepted','wrong password starts no reset');
 const absent=await reset(a,'reset-status',request,a.password);check(absent.status===404,'status cannot initiate reset');
 const pendingFile=await proof(a,tx,false);
 const started=await reset(a,'reset',request,a.password,{ownerId:b.id});check(started.status===202&&started.data.state==='pending','correct password starts owned pending reset');
 const owned=await a.client.rpc('financial_reset_status',{p_request:request});check(!owned.error&&owned.data.owner===a.id,'reset ownership comes from authenticated token');
 const foreign=await b.client.rpc('financial_reset_status',{p_request:request});check(!foreign.error&&foreign.data===null,'foreign status is hidden');
 const foreignEdge=await reset(b,'reset-status',request);check(foreignEdge.status===404,'foreign Edge status is hidden');
 check(!!(await a.client.from('profiles').update({display_name:'Must not change'}).eq('user_id',a.id)).error,'writes paused during reset');
 check(!!(await a.client.storage.from('budget-tracker-proofs').upload(pendingFile.path,pendingFile.bytes,{contentType:'image/webp'})).error,'proof uploads paused during reset');
 await queryDatabase(project,`update budget_tracker.financial_resets set settle_after=now()-interval '1 minute' where owner_id='${a.id}' and request_id='${request}';`);
 const leased=await reset(a,'reset-status',request);check(leased.status===202&&leased.data.state==='pending','admitted upload lease prevents completion');
 await queryDatabase(project,`update budget_tracker.account_scan_leases set expires_at=now()-interval '1 minute' where owner_id='${a.id}';`);
 const done=await reset(a,'reset-status',request);check(done.status===200&&done.data.state==='completed','owned worker completes reset after leases settle');
 check(!(await a.client.auth.getUser()).error,'original Auth session survives password verification and reset');
 const profile=await a.client.from('profiles').select('*').eq('user_id',a.id).single();check(!profile.error&&profile.data.display_name==='Synthetic retained profile'&&profile.data.avatar_path===avatarPath&&profile.data.currency==='PHP'&&profile.data.appearance==='dark','profile and preferences stay unchanged');
 const avatarRead=await admin.storage.from('budget-tracker-avatars').download(avatarPath);check(!avatarRead.error&&Buffer.from(await avatarRead.data.arrayBuffer()).equals(avatar),'private avatar bytes retained');
 const remaining=await a.client.from('transactions').select('id');check(!remaining.error&&remaining.data.length===0,'financial transactions cleared');
 const defaults=await a.client.from('categories').select('*'),methods=await a.client.rpc('payment_method_snapshot');check(defaults.data?.length===7&&defaults.data.every(c=>c.is_default)&&methods.data?.methods.length===1&&methods.data.methods[0].method==='cash'&&methods.data.methods[0].balance===null,'default categories and unset Cash restored');
 for(const bucket of ['budget-tracker-proofs','budget-tracker-ocr']){const list=await admin.storage.from(bucket).list(a.id);check(!list.error&&list.data.length===0,'reset receipt folder empty: '+bucket);}
 const ledger=await queryDatabase(project,`select status from budget_tracker.ocr_scans where id='${scan}' and user_id='${a.id}';`);check(ledger.length===1&&ledger[0].status==='deleted','scan quota row retained while history is deleted');
 const other=await b.client.from('transactions').select('id');check(other.data?.some(t=>t.id===otherTx),'other owner financial records preserved');check(!(await b.client.storage.from('budget-tracker-proofs').download(otherProof.path)).error,'other owner proof preserved');
 const fresh=await transaction(a,'Synthetic after fresh start'),freshProof=await proof(a,fresh);
 const retry=await reset(a,'reset-status',request);check(retry.status===200&&retry.data.state==='completed','completed reset status retries are stable');
 check(!(await a.client.storage.from('budget-tracker-proofs').download(freshProof.path)).error,'completed reset retry does not erase new proof');
 const freshRow=await a.client.from('transactions').select('id').eq('id',fresh).single();check(!freshRow.error,'completed reset retry does not erase new record');
 console.log(`PASS ${checks} hosted reset/bill checks.`);
}catch(error){console.error(error.message?.startsWith('FAIL ')?error.message:'FAIL hosted reset/bill checks; remote details were not logged.');process.exitCode=1;}
finally{
 const clean=await cleanupFixtures(owners.map(owner=>async()=>{
  for(const bucket of ['budget-tracker-proofs','budget-tracker-ocr','budget-tracker-avatars']){
   const paths=files.filter(f=>f.owner===owner&&f.bucket===bucket).map(f=>f.path);if(!paths.every(p=>p.startsWith(owner+'/')))throw new Error('Unsafe synthetic cleanup');
   if(paths.length&&(await admin.storage.from(bucket).remove(paths)).error)throw new Error('Synthetic file cleanup failed');
  }
  await queryDatabase(project,`delete from budget_tracker.financial_resets where owner_id='${owner}';delete from budget_tracker.account_scan_leases where owner_id='${owner}';`);
  const r=await admin.auth.admin.deleteUser(owner);if(r.error&&r.error.code!=='user_not_found')throw new Error('Synthetic Auth cleanup failed');
  await queryDatabase(project,`delete from budget_tracker.account_deletions where owner_id='${owner}';delete from budget_tracker.attachment_cleanup_jobs where owner_id='${owner}';`);
 }));if(clean)console.log('Synthetic owners, files and private jobs cleaned.');
}

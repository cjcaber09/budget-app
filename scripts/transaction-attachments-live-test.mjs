// Synthetic accounts and tiny proof files only. No email or OCR provider calls.
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
import {cleanupFixtures} from './lib/cleanup.mjs';
const project=loadLinkedProject(),url=process.env.EXPO_PUBLIC_SUPABASE_URL,anon=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const keys=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/api-keys?reveal=true`,{headers:{Authorization:`Bearer ${project.accessToken}`}}).then(r=>r.json());
const service=keys.find(k=>k.name==='service_role')?.api_key;if(!service)throw new Error('Synthetic-test admin credentials unavailable.');
const options={db:{schema:'budget_tracker'},auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,service,options),publicClient=createClient(url,anon,options),owners=[],paths=[];
let checks=0;
function check(ok,label){if(!ok)throw new Error('FAIL '+label);console.log('PASS '+label);checks++;}
async function create(){const password=randomBytes(24).toString('hex'),email=`proof-${randomUUID()}@example.com`;const r=await admin.auth.admin.createUser({email,password,email_confirm:true});if(r.error||!r.data.user)throw new Error('Synthetic account creation failed.');const id=r.data.user.id;owners.push(id);await queryDatabase(project,`insert into budget_tracker.profiles(user_id,timezone,currency)values('${id}','UTC','USD')on conflict(user_id)do nothing;`);const client=createClient(url,anon,options);const login=await client.auth.signInWithPassword({email,password});if(login.error)throw new Error('Synthetic login failed.');return {id,client,password,token:login.data.session.access_token};}
async function worker(){const [secret]=await queryDatabase(project,"select decrypted_secret from vault.decrypted_secrets where name='budget_tracker_ocr_webhook_secret'");const r=await fetch(url+'/functions/v1/delete-account',{method:'POST',headers:{'Content-Type':'application/json','x-ocr-webhook-secret':secret.decrypted_secret},body:JSON.stringify({action:'worker'})});check(r.ok,'private file-cleanup worker ran');}
async function reserve(a,transaction,name='Proof.webp',mime='image/webp',bytes=new Uint8Array([82,73,70,70,4,0,0,0,87,69,66,80])){
 const id=randomUUID(),r=await a.client.rpc('reserve_transaction_attachment',{p_transaction:transaction,p_file:{id,name,mime,size:bytes.length}});check(!r.error&&r.data?.id===id,'owned attachment reserved');const path=r.data.object_path;paths.push({owner:a.id,path});return {id,path,bytes,mime};
}
async function upload(a,file){const r=await a.client.storage.from('budget-tracker-proofs').upload(file.path,file.bytes,{contentType:file.mime});check(!r.error,'prepared proof uploaded');const finish=await a.client.rpc('finish_transaction_attachment',{p_id:file.id});check(!finish.error,'proof completion confirmed');}
try{
 const a=await create(),b=await create(),tx=randomUUID();
 const saved=await a.client.rpc('save_transaction',{p_transaction:{operation:'create',payload_version:4,id:tx,type:'income',category_id:null,amount:'10.00',note:'Synthetic proof',occurred_at:new Date().toISOString(),transaction_date:new Date().toISOString().slice(0,10)},p_items:[]});check(!saved.error,'income parent saved');
 const file=await reserve(a,tx);await upload(a,file);
 const pdf=await reserve(a,tx,'Proof.pdf','application/pdf',new TextEncoder().encode('%PDF-1.4\n% Synthetic proof\n%%EOF'));await upload(a,pdf);
 const visible=await a.client.from('transaction_attachments').select('id').eq('transaction_id',tx);check(visible.data?.length===2,'both WebP and PDF retained');
 const categories=await a.client.from('categories').select('id').limit(1),expense=randomUUID();
 const expenseSaved=await a.client.rpc('save_transaction',{p_transaction:{operation:'create',payload_version:4,id:expense,type:'expense',category_id:categories.data[0].id,amount:'3.00',note:'Synthetic expense proof',occurred_at:new Date().toISOString(),transaction_date:new Date().toISOString().slice(0,10)},p_items:[]});check(!expenseSaved.error,'expense parent saved');
 await upload(a,await reserve(a,expense));
 const signed=await a.client.storage.from('budget-tracker-proofs').createSignedUrl(file.path,60);check(!signed.error,'owner receives short-lived file link');
 const downloaded=await fetch(signed.data.signedUrl);check(downloaded.ok&&Buffer.from(await downloaded.arrayBuffer()).equals(Buffer.from(file.bytes)),'saved image bytes match compressed upload');
 const foreign=await b.client.storage.from('budget-tracker-proofs').download(file.path);check(!!foreign.error,'another owner cannot read proof');
 const publicRead=await publicClient.storage.from('budget-tracker-proofs').download(file.path);check(!!publicRead.error,'anonymous proof access rejected');
 const overwrite=await a.client.storage.from('budget-tracker-proofs').upload(file.path,file.bytes,{contentType:file.mime,upsert:true});check(!!overwrite.error,'completed proof cannot be overwritten');
 const retry=await a.client.rpc('finish_transaction_attachment',{p_id:file.id});check(!retry.error,'completion exact retry succeeds');
 const removed=await a.client.rpc('delete_transaction_attachment',{p_id:file.id});check(!removed.error,'owned proof removed from transaction');
 await queryDatabase(project,`update budget_tracker.attachment_cleanup_jobs set not_before=now()-interval '1 minute' where owner_id='${a.id}';`);await worker();
 const missing=await admin.storage.from('budget-tracker-proofs').download(file.path);check(!!missing.error,'removed proof cleaned through Storage API');
 // Pending proof uses the same lease boundary as an in-flight OCR request.
 const pending=await reserve(a,tx),request=randomUUID();
 const deletion=await a.client.functions.invoke('delete-account',{body:{action:'delete',requestId:request,password:a.password}});check(!deletion.error&&deletion.data.state==='pending','pending proof defers account deletion');
 await queryDatabase(project,`update budget_tracker.account_deletions set settle_after=now()-interval '1 minute' where owner_id='${a.id}';`);
 const blocked=await a.client.storage.from('budget-tracker-proofs').upload(pending.path,pending.bytes,{contentType:pending.mime});check(!!blocked.error,'proof uploads blocked during account deletion');
 await queryDatabase(project,`update budget_tracker.account_scan_leases set expires_at=now()-interval '1 minute' where owner_id='${a.id}';`);
 const finished=await a.client.functions.invoke('delete-account',{body:{action:'status',requestId:request}});check(!finished.error&&finished.data.state==='completed','account deletion purges nested proof folders');
 const remaining=await admin.storage.from('budget-tracker-proofs').list(a.id);check(!remaining.error&&remaining.data.length===0,'deleted account proof folder empty');
 console.log(`PASS ${checks} attachment checks.`);
}finally{
 const done=await cleanupFixtures(owners.map(owner=>async()=>{
  const owned=paths.filter(p=>p.owner===owner).map(p=>p.path);if(!owned.every(p=>p.startsWith(owner+'/')))throw new Error('Unsafe synthetic cleanup path.');
  if(owned.length){const r=await admin.storage.from('budget-tracker-proofs').remove(owned);if(r.error)throw new Error('Synthetic proof cleanup failed.');}
  const r=await admin.auth.admin.deleteUser(owner);if(r.error&&r.error.code!=='user_not_found')throw new Error('Synthetic account cleanup failed.');
  await queryDatabase(project,`delete from budget_tracker.account_scan_leases where owner_id='${owner}';delete from budget_tracker.account_deletions where owner_id='${owner}';delete from budget_tracker.attachment_cleanup_jobs where owner_id='${owner}';`);
 }));if(done)console.log('Synthetic proof accounts, files and private jobs cleaned.');
}

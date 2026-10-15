// Deployed 0035 only. Disposable owners and tiny proof files; no OCR provider calls.
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
import {cleanupFixtures} from './lib/cleanup.mjs';

const project=loadLinkedProject(),url=process.env.EXPO_PUBLIC_SUPABASE_URL,anon=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const capability=await queryDatabase(project,"select exists(select from information_schema.columns where table_schema='budget_tracker' and table_name='transaction_attachments' and column_name='transfer_id') ready");
if(!capability.some(r=>r.ready===true))throw new Error('Deploy 0035 before running transfer proof checks. No fixture was created.');
const keys=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/api-keys?reveal=true`,{headers:{Authorization:`Bearer ${project.accessToken}`}}).then(r=>r.json());
const service=keys.find(k=>k.name==='service_role')?.api_key;if(!service)throw new Error('Synthetic-test admin credentials unavailable.');
const options={db:{schema:'budget_tracker'},auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,service,options),publicClient=createClient(url,anon,options),owners=[],paths=[];
let checks=0;
function check(ok,label){if(!ok)throw new Error('FAIL '+label);console.log('PASS '+label);checks++;}
async function create(){
 const password=randomBytes(24).toString('hex'),email=`transfer-proof-${randomUUID()}@example.com`;
 const r=await admin.auth.admin.createUser({email,password,email_confirm:true});if(r.error||!r.data.user)throw new Error('Synthetic account creation failed.');
 const id=r.data.user.id;owners.push(id);
 await queryDatabase(project,`insert into budget_tracker.profiles(user_id,timezone,currency)values('${id}','UTC','USD')on conflict(user_id)do nothing;`);
 const client=createClient(url,anon,options),login=await client.auth.signInWithPassword({email,password});if(login.error)throw new Error('Synthetic login failed.');
 return {id,client,password};
}
async function reserve(a,parent,name='Withdrawal.webp',mime='image/webp',bytes=new Uint8Array([82,73,70,70,4,0,0,0,87,69,66,80])){
 const id=randomUUID(),r=await a.client.rpc('reserve_transfer_attachment',{p_transfer:parent,p_file:{id,name,mime,size:bytes.length}});
 check(!r.error&&r.data?.id===id&&r.data.transfer_id===parent&&r.data.transaction_id===null,'owned transfer proof reserved with one parent');
 const path=r.data.object_path;check(path===`${a.id}/transfers/${parent}/${id}.${mime==='application/pdf'?'pdf':'webp'}`,'transfer proof path is owner and parent scoped');
 paths.push({owner:a.id,path});return {id,path,bytes,mime};
}
async function upload(a,file){
 const r=await a.client.storage.from('budget-tracker-proofs').upload(file.path,file.bytes,{contentType:file.mime});check(!r.error,'transfer proof uploaded through Storage policy');
 const finished=await a.client.rpc('finish_transaction_attachment',{p_id:file.id});check(!finished.error,'transfer proof completion confirmed');
}
async function worker(){
 const [secret]=await queryDatabase(project,"select decrypted_secret from vault.decrypted_secrets where name='budget_tracker_ocr_webhook_secret'");
 const r=await fetch(url+'/functions/v1/delete-account',{method:'POST',headers:{'Content-Type':'application/json','x-ocr-webhook-secret':secret.decrypted_secret},body:JSON.stringify({action:'worker'})});check(r.ok,'private file-cleanup worker ran');
}
try{
 const a=await create(),b=await create(),bank=randomUUID(),id=randomUUID();
 const method=await a.client.rpc('save_payment_method',{p_method:{id:bank,operation:'create',method:'bank_account',paymentType:'Savings account',name:'Synthetic withdrawal',openingBalance:'1000.00'}});
 check(!method.error,'synthetic source account initialized');
 const snapshot=await a.client.rpc('payment_method_snapshot');check(!snapshot.error&&snapshot.data?.transferEntryVersion===1,'deployed transfer capability available');
 const cash=snapshot.data.methods.find(m=>m.method==='cash')?.id;check(!!cash,'owned Cash destination available');
 const command={payload_version:3,id,requestId:id,operation:'create',sourceId:bank,destinationId:cash,amount:'100.00',feeAmount:'5.00',feeMode:'added',date:new Date().toISOString().slice(0,10),note:'Synthetic withdrawal proof'};
 const saved=await a.client.rpc('save_transfer_entry',{p_transfer:command});check(!saved.error&&saved.data?.state==='saved','transfer and linked fee saved');
 const retry=await a.client.rpc('save_transfer_entry',{p_transfer:command});check(!retry.error&&retry.data?.committedVersion===1,'transfer exact retry confirmed');
 const file=await reserve(a,id);await upload(a,file);
 const pdf=await reserve(a,id,'Withdrawal.pdf','application/pdf',new TextEncoder().encode('%PDF-1.4\n% Synthetic transfer proof\n%%EOF'));await upload(a,pdf);
 const visible=await a.client.from('transaction_attachments').select('id,transaction_id,transfer_id').eq('transfer_id',id);
 check(!visible.error&&visible.data?.length===2&&visible.data.every(r=>r.transaction_id===null&&r.transfer_id===id),'both private transfer proofs retain the correct parent');
 const crossParent=await a.client.rpc('reserve_transaction_attachment',{p_transaction:id,p_file:{id:file.id,name:'Withdrawal.webp',mime:file.mime,size:file.bytes.length}});
 check(!!crossParent.error,'transaction reserve cannot reuse transfer metadata');
 const foreignReserve=await b.client.rpc('reserve_transfer_attachment',{p_transfer:id,p_file:{id:randomUUID(),name:'Foreign.webp',mime:file.mime,size:file.bytes.length}});
 check(!!foreignReserve.error,'another owner cannot reserve transfer proofs');
 const signed=await a.client.storage.from('budget-tracker-proofs').createSignedUrl(file.path,60);check(!signed.error,'owner receives short-lived transfer proof link');
 const downloaded=await fetch(signed.data.signedUrl);check(downloaded.ok&&Buffer.from(await downloaded.arrayBuffer()).equals(Buffer.from(file.bytes)),'transfer proof bytes match upload');
 const foreign=await b.client.storage.from('budget-tracker-proofs').download(file.path);check(!!foreign.error,'another owner cannot read transfer proof');
 const publicRead=await publicClient.storage.from('budget-tracker-proofs').download(file.path);check(!!publicRead.error,'anonymous transfer proof access rejected');
 const overwrite=await a.client.storage.from('budget-tracker-proofs').upload(file.path,file.bytes,{contentType:file.mime,upsert:true});check(!!overwrite.error,'completed transfer proof cannot be overwritten');
 const removed=await a.client.rpc('save_transfer_entry',{p_transfer:{payload_version:3,id,requestId:randomUUID(),operation:'delete',expectedVersion:1}});check(!removed.error&&removed.data?.state==='removed','transfer deletion removes its fee and proof metadata');
 await queryDatabase(project,`update budget_tracker.attachment_cleanup_jobs set not_before=now()-interval '1 minute' where owner_id='${a.id}';`);await worker();
 const missing=await admin.storage.from('budget-tracker-proofs').download(file.path),missingPdf=await admin.storage.from('budget-tracker-proofs').download(pdf.path);
 check(!!missing.error&&!!missingPdf.error,'deleted transfer proofs cleaned through Storage API');
 const second=randomUUID(),next=await a.client.rpc('save_transfer_entry',{p_transfer:{...command,id:second,requestId:second}});check(!next.error,'second synthetic transfer saved');
 const pending=await reserve(a,second),request=randomUUID();
 const deletion=await a.client.functions.invoke('delete-account',{body:{action:'delete',requestId:request,password:a.password}});check(!deletion.error&&deletion.data.state==='pending','pending transfer proof lease defers account deletion');
 await queryDatabase(project,`update budget_tracker.account_deletions set settle_after=now()-interval '1 minute' where owner_id='${a.id}';`);
 const blocked=await a.client.storage.from('budget-tracker-proofs').upload(pending.path,pending.bytes,{contentType:pending.mime});check(!!blocked.error,'transfer proof uploads blocked during account deletion');
 await queryDatabase(project,`update budget_tracker.account_scan_leases set expires_at=now()-interval '1 minute' where owner_id='${a.id}';`);
 const finished=await a.client.functions.invoke('delete-account',{body:{action:'status',requestId:request}});check(!finished.error&&finished.data.state==='completed','account deletion purges nested transfer proof folders');
 const remaining=await admin.storage.from('budget-tracker-proofs').list(a.id);check(!remaining.error&&remaining.data.length===0,'deleted account transfer proof folder empty');
 console.log(`PASS ${checks} deployed transfer proof checks.`);
}finally{
 const done=await cleanupFixtures(owners.map(owner=>async()=>{
  const owned=paths.filter(p=>p.owner===owner).map(p=>p.path);if(!owned.every(p=>p.startsWith(owner+'/transfers/')))throw new Error('Unsafe synthetic cleanup path.');
  if(owned.length){const r=await admin.storage.from('budget-tracker-proofs').remove(owned);if(r.error)throw new Error('Synthetic transfer proof cleanup failed.');}
  const r=await admin.auth.admin.deleteUser(owner);if(r.error&&r.error.code!=='user_not_found')throw new Error('Synthetic account cleanup failed.');
  await queryDatabase(project,`delete from budget_tracker.account_scan_leases where owner_id='${owner}';delete from budget_tracker.account_deletions where owner_id='${owner}';delete from budget_tracker.attachment_cleanup_jobs where owner_id='${owner}';`);
 }));if(done)console.log('Synthetic transfer proof accounts, files and private jobs cleaned.');
}

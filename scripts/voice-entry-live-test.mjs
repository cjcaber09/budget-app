// One real provider call with a fictional recording. Auth deletion anonymizes its quota receipt.
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject(),url=process.env.EXPO_PUBLIC_SUPABASE_URL,anon=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const mode=process.env.VOICE_TEST_MODE??'legacy';if(!['legacy','purchases','missing-price'].includes(mode))throw Error('Unknown voice test mode.');
const path=process.env.VOICE_TEST_AUDIO;if(!path)throw Error('Set VOICE_TEST_AUDIO to a short fictional M4A recording.');
const keys=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/api-keys?reveal=true`,{headers:{Authorization:`Bearer ${project.accessToken}`},signal:AbortSignal.timeout(30000)}).then(r=>r.json());
const service=keys.find(k=>k.name==='service_role')?.api_key;if(!service)throw Error('Synthetic test credentials unavailable.');
const options={db:{schema:'budget_tracker'},auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,service,options);
let owner;const requestId=randomUUID(),category=randomUUID();
try{
 const email=`voice-test-${randomUUID()}@example.test`,password=randomBytes(24).toString('hex');
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});owner=created.data.user?.id;if(created.error||!owner)throw Error('Could not create synthetic owner.');
 await queryDatabase(project,`insert into budget_tracker.profiles(user_id,display_name,timezone,currency)values('${owner}','Synthetic voice test','UTC','PHP')on conflict(user_id)do update set timezone='UTC',currency='PHP';insert into budget_tracker.categories(id,user_id,name,color,icon)values('${category}','${owner}','Food','#55816A','tag');`);
 const client=createClient(url,anon,options),login=await client.auth.signInWithPassword({email,password});const token=login.data.session?.access_token;if(login.error||!token)throw Error('Synthetic login failed.');
 const headers={apikey:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const unauth=await fetch(url+'/functions/v1/voice-entry',{headers:{apikey:anon}});if(unauth.status!==401)throw Error('Unauthenticated endpoint was not rejected.');
 const available=await fetch(url+'/functions/v1/voice-entry',{headers});if(!available.ok)throw Error('Voice availability failed: '+available.status);
 const body={requestId,audioBase64:readFileSync(path).toString('base64'),day:new Date().toISOString().slice(0,10),timezone:'UTC',currency:'PHP',...(mode==='legacy'?{}:{proposalVersion:2})};
 if(mode!=='legacy'){const invalid=await fetch(url+'/functions/v1/voice-entry',{method:'POST',headers,body:JSON.stringify({...body,proposalVersion:3})});if(invalid.status!==400)throw Error('Unknown protocol version accepted.');}
 const response=await fetch(url+'/functions/v1/voice-entry',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
 const data=await response.json();if(!response.ok)throw Error('Voice processing failed: '+response.status+' '+String(data.error));
 const proposal=data.proposal;
 if(proposal?.intent!=='entry'||proposal.type!=='expense')throw Error('Fictional entry did not produce an expense.');
 if(mode==='legacy'&&(Number(proposal.amount)!==20||proposal.categoryId!==category))throw Error('Legacy amount/category mismatch.');
 if(mode==='purchases'&&(data.proposalVersion!==2||proposal.amount!=='240.00'||proposal.purchases?.length!==3||proposal.purchases.map(p=>p.amount).join(',')!=='100.00,60.00,80.00'))throw Error('Purchase amounts did not reconcile.');
 if(mode==='missing-price'&&(data.proposalVersion!==2||proposal.amount!==''||proposal.purchases?.length!==2||proposal.purchases[0].amount!=='100.00'||proposal.purchases[1].amount!==''))throw Error('Missing purchase price was guessed or omitted.');
 const duplicate=await fetch(url+'/functions/v1/voice-entry',{method:'POST',headers,body:JSON.stringify(body)});if(duplicate.status!==409)throw Error('Duplicate recording was not rejected.');
 const count=await queryDatabase(project,`select count(*)::integer count from budget_tracker.transactions where user_id='${owner}';`);if(count[0]?.count!==0)throw Error('Voice processing wrote a financial record.');
 if(mode!=='legacy'){const conflict=await fetch(url+'/functions/v1/voice-entry',{method:'POST',headers,body:JSON.stringify({...body,proposalVersion:undefined})});const issue=await conflict.json();if(conflict.status!==409||issue.error!=='conflict')throw Error('Protocol fingerprint conflict missing.');}
 console.log('PASS fictional audio: '+mode+'; expected ordered prices/total, auth/version/deduplication checks; zero financial writes');
}finally{
 if(owner){const result=await admin.auth.admin.deleteUser(owner);if(result.error)throw Error('Synthetic owner cleanup failed.');}
 console.log('Synthetic voice owner removed; content-free global usage receipt retained');
}

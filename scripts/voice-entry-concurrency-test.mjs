// Private synthetic admission receipts only. No provider calls or financial writes.
import {randomUUID} from 'node:crypto';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject(),owners=Array.from({length:3},()=>randomUUID()),requests=Array.from({length:3},()=>randomUUID());
const sql=query=>queryDatabase(project,query),ids=values=>values.map(v=>`'${v}'`).join(',');
const clear=()=>sql(`delete from budget_tracker.voice_requests where id in(${ids(requests)});`);
async function admit(owner,id){const rows=await sql(`begin;set local request.jwt.claim.role='service_role';select budget_tracker.admit_voice_request('${owner}','${id}',repeat('a',64),true) admission;commit;`);return rows.find(r=>r.admission)?.admission?.outcome;}
try{
 await sql(`insert into auth.users(id)values${owners.map(id=>`('${id}')`).join(',')};`);
 const same=await Promise.all([admit(owners[0],requests[0]),admit(owners[0],requests[0])]);
 if(same.filter(x=>x==='available').length!==1||!same.includes('duplicate'))throw Error('Concurrent exact retry executed twice');
 await clear();
 const perOwner=await Promise.all([admit(owners[0],requests[0]),admit(owners[0],requests[1])]);
 if(perOwner.filter(x=>x==='available').length!==1||!perOwner.includes('blocked'))throw Error('Owner concurrency bypassed');
 await clear();
 const global=await Promise.all(owners.map((owner,i)=>admit(owner,requests[i])));
 if(global.filter(x=>x==='available').length!==2||global.filter(x=>x==='blocked').length!==1)throw Error('Global admission cap bypassed');
 console.log('PASS concurrent exact retry, owner and global admission limits; zero provider calls');
}finally{await clear();await sql(`delete from auth.users where id in(${ids(owners)});`);console.log('Synthetic voice test receipts and owners removed');}

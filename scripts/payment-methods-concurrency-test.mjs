// Synthetic owner only, deleted in finally. No bank, OCR or real-user data.
import {loadEnvFile} from 'node:process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
loadEnvFile();
const ref=new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if(readFileSync('supabase/.temp/project-ref','utf8').trim()!==ref)throw Error('Project mismatch');
const owner=randomUUID(),category=randomUUID(),method=randomUUID(),transaction=randomUUID();
async function sql(query){const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.EXPO_SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});const body=await response.json();if(!response.ok)throw Error(body.message??'SQL check failed');return body;}
const claims=`set local request.jwt.claim.sub='${owner}';set local role authenticated;`;
try{
 await sql(`begin;insert into auth.users(id)values('${owner}');insert into budget_tracker.profiles(user_id,timezone)values('${owner}','Asia/Manila');insert into budget_tracker.categories(id,user_id,name,color,icon,is_default)values('${category}','${owner}','Synthetic concurrency','#55816A','cart',false);${claims}select budget_tracker.save_payment_method(jsonb_build_object('id','${method}','operation','create','method','bank_account','paymentType','Bank account','name','Synthetic concurrency','openingBalance','1000.00'));commit;`);
 const save=`select (budget_tracker.save_transaction(jsonb_build_object('payload_version',3,'operation','create','id','${transaction}','type','expense','category_id','${category}','amount','100.00','note',null,'occurred_at','2026-10-08T04:00:00Z','transaction_date','2026-10-08','payment_method_id','${method}'),'[]')).id;`;
 await Promise.all([sql(`begin;${claims}select budget_tracker.financial_lock();select pg_sleep(1);${save}commit;`),sql(`begin;${claims}${save}commit;`)]);
 const rows=await sql(`begin;${claims}select (select count(*) from budget_tracker.transactions where id='${transaction}') count,b->>'balance' balance from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')b where b->>'id'='${method}';rollback;`);
 if(!rows.some(r=>Number(r.count)===1)||!rows.some(r=>r.balance==='900.00'))throw Error('Concurrent retries changed balance more than once');
 console.log('PASS two concurrent exact transaction retries produce one record and one balance contribution');
}finally{await sql(`delete from auth.users where id='${owner}';`);console.log('Synthetic concurrency owner deleted');}

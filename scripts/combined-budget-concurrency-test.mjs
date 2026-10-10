import {randomUUID} from 'node:crypto';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const owner=randomUUID(),first=randomUUID(),second=randomUUID();
const sql=query=>queryDatabase(project,query);
const claims=`set local request.jwt.claim.sub='${owner}';set local role authenticated;`;
const month="date_trunc('month',now() at time zone 'Asia/Manila')::date";
try{
 await sql(`begin;insert into auth.users(id)values('${owner}');insert into budget_tracker.profiles(user_id,timezone)values('${owner}','Asia/Manila');insert into budget_tracker.categories(id,user_id,name,color,icon,is_default)values('${first}','${owner}','Synthetic first','#55816A','cart',false),('${second}','${owner}','Synthetic second','#55816A','cart',false);${claims}select budget_tracker.set_monthly_allowance(${month},'100.00');commit;`);
 const results=await Promise.allSettled([
  sql(`begin;${claims}select budget_tracker.financial_lock();select pg_sleep(1);select budget_tracker.set_category_budget('${first}',${month},'60.00');commit;`),
  sql(`begin;${claims}select budget_tracker.set_category_budget('${second}',${month},'60.00');commit;`),
 ]);
 if(results.filter(r=>r.status==='fulfilled').length!==1)throw new Error('Concurrent category writes did not enforce the allowance.');
 const rows=await sql(`begin;${claims}select sum(amount)::text amount from budget_tracker.budgets where user_id=auth.uid();rollback;`);
 if(rows[0]?.amount!=='60.00')throw new Error('Concurrent allocations exceeded the allowance.');
 console.log('PASS concurrent category writes cannot exceed their combined allowance.');
}finally{
 await sql(`delete from auth.users where id='${owner}';`);
 console.log('Synthetic budget owner deleted.');
}

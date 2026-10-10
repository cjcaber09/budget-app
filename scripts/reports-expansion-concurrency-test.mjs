// Only synthetic owner data; removed in finally. No real-user or provider calls.
import {randomUUID} from 'node:crypto';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject(),owner=randomUUID(),source=randomUUID(),transaction=randomUUID();
const sql=query=>queryDatabase(project,query);
const claims="set local request.jwt.claim.sub='"+owner+"';set local role authenticated;";
const create="select budget_tracker.save_income_source(jsonb_build_object('operation','create','id','"+source+"','name','Synthetic source'));";
const save="select budget_tracker.save_transaction(jsonb_build_object('payload_version',4,'operation','create','id','"+transaction+"','type','income','category_id',null,'amount','100.00','note',null,'occurred_at','2026-10-09T04:00:00Z','transaction_date','2026-10-09','income_source_id','"+source+"'),'[]');";
try {
 await sql("begin;insert into auth.users(id)values('"+owner+"');insert into budget_tracker.profiles(user_id,timezone)values('"+owner+"','UTC');commit;");
 await Promise.all([sql('begin;'+claims+'select budget_tracker.financial_lock();select pg_sleep(1);'+create+'commit;'),sql('begin;'+claims+create+'commit;')]);
 await Promise.all([sql('begin;'+claims+'select budget_tracker.financial_lock();select pg_sleep(1);'+save+'commit;'),sql('begin;'+claims+save+'commit;')]);
 const counts=await sql('begin;'+claims+'select (select count(*) from budget_tracker.income_sources) sources,(select count(*) from budget_tracker.transactions) transactions;rollback;');
 if(!counts.some(r=>Number(r.sources)===1&&Number(r.transactions)===1))throw new Error('Concurrent retries duplicated a record.');
 const rejected=await Promise.allSettled([
  sql('begin;'+claims+"select budget_tracker.financial_lock();select budget_tracker.save_income_source(jsonb_build_object('id','"+source+"','operation','archive'));select pg_sleep(1);commit;"),
  // Wait before acquiring the financial lock, giving archive the first turn.
  sql('begin;'+claims+'select pg_sleep(0.3);'+save.replaceAll(transaction,randomUUID())+'commit;')
 ]);
 if(rejected[0].status!=='fulfilled'||rejected[1].status!=='rejected')throw new Error('Archive did not serialize a new assignment.');
 await sql('begin;'+claims+save+'commit;'); // Existing archived assignment remains retryable.
 console.log('PASS concurrent source/transaction exact retries and archive-versus-assignment serialization.');
} finally {
 await sql("delete from auth.users where id='"+owner+"';");
 const rows=await sql("select exists(select from budget_tracker.income_sources where user_id='"+owner+"') or exists(select from budget_tracker.transactions where user_id='"+owner+"') remaining;");
 if(rows.some(r=>r.remaining))throw new Error('Synthetic cleanup incomplete.');
 console.log('Synthetic reports owner deleted.');
}

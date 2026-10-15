// Run after 0035 deployment. Only throwaway owners are committed and cleaned up.
import {randomUUID} from 'node:crypto';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject(),sql=q=>queryDatabase(project,q);
const capability=await sql("select exists(select from information_schema.columns where table_schema='budget_tracker' and table_name='payment_transfers' and column_name='version') ready");
if(!capability.some(r=>r.ready===true))throw new Error('Deploy 0035 before running the concurrent RPC checks. No fixture was created.');
const owner=randomUUID(),bank=randomUUID(),id=randomUUID(),today=new Date().toISOString().slice(0,10);
const claims=`set local request.jwt.claim.sub='${owner}';set local request.jwt.claim.role='authenticated';set local role authenticated;`;
const json=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const command=p=>`select budget_tracker.save_transfer_entry(${json({...p,payload_version:3})});`;
const transaction=(tid,type='income',amount='1.00',category=null)=>`select budget_tracker.save_transaction(${json({id:tid,operation:'create',payload_version:4,type,amount,category_id:category,payment_method_id:bank,transaction_date:today,occurred_at:new Date().toISOString(),note:null})},'[]');`;
const attempt=q=>sql(`begin;${claims}${q}commit;`);
try{
 const setup=await sql(`begin;insert into auth.users(id)values('${owner}');insert into budget_tracker.profiles(user_id,timezone,currency)values('${owner}','UTC','USD');${claims}select budget_tracker.save_payment_method(${json({id:bank,operation:'create',method:'bank_account',paymentType:'Savings account',name:'Synthetic transfer concurrency',openingBalance:'10000.00'})});select id cash from budget_tracker.payment_methods where user_id=auth.uid() and method='cash';commit;`);
 const cash=setup.find(r=>r.cash)?.cash;if(!cash)throw new Error('Synthetic Cash unavailable');
 const create={id,requestId:id,operation:'create',sourceId:bank,destinationId:cash,amount:'100.00',feeAmount:'5.00',feeMode:'added',date:today,note:null};
 await Promise.all([attempt('select budget_tracker.financial_lock();select pg_sleep(0.5);'+command(create)),attempt(command(create))]);
 let rows=await sql(`select count(*) n from budget_tracker.payment_transfers where user_id='${owner}' and id='${id}'`);
 if(Number(rows[0]?.n)!==1)throw new Error('Exact retries duplicated a transfer');
 const edits=await Promise.allSettled([200,300].map(amount=>attempt(command({...create,operation:'update',requestId:randomUUID(),expectedVersion:1,amount:amount+'.00'}))));
 if(edits.filter(r=>r.status==='fulfilled').length!==1)throw new Error('Stale edit concurrency failed');
 const collision=randomUUID();const differentKinds=await Promise.allSettled([attempt(command({...create,id:collision,requestId:collision,feeAmount:'0.00'})),attempt(transaction(collision))]);
 if(differentKinds.filter(r=>r.status==='fulfilled').length!==1)throw new Error('Cross-kind creates both succeeded or both failed');
 rows=await sql(`select (select count(*) from budget_tracker.payment_transfers where user_id='${owner}' and id='${collision}')+(select count(*) from budget_tracker.transactions where user_id='${owner}' and id='${collision}') n`);
 if(Number(rows[0]?.n)!==1)throw new Error('Cross-kind duplicate exists');
 const category=randomUUID(),expense=randomUUID(),refundId=randomUUID();
 await attempt(`insert into budget_tracker.categories(id,user_id,name,color,icon)values('${category}',auth.uid(),'Synthetic concurrency','#55816A','tag');${transaction(expense,'expense','50.00',category)}`);
 const identity=await sql(`select created_at from budget_tracker.transactions where user_id='${owner}' and id='${expense}'`);
 const refund={id:refundId,expenseId:expense,expenseCreatedAt:identity[0].created_at,operation:'create',amount:'10.00',methodId:bank,date:today,note:null};
 const refundRace=await Promise.allSettled([attempt(`select budget_tracker.save_refund(${json(refund)});`),attempt(command({...create,id:refundId,requestId:refundId,feeAmount:'0.00'}))]);
 if(refundRace.filter(r=>r.status==='fulfilled').length!==1)throw new Error('Refund/transfer ID race failed');
 await attempt(command({id,requestId:randomUUID(),operation:'delete',expectedVersion:2}));
 const replay=await attempt(`select budget_tracker.save_transfer_entry(${json({...create,payload_version:3})})->>'state' state;`);
 if(!replay.some(r=>r.state==='removed'))throw new Error('Deleted create retry resurrected');
 console.log('PASS concurrent exact creates, stale edits, transaction/refund ID races and deleted retries');
}finally{
 await sql(`set request.jwt.claim.sub='';set request.jwt.claim.role='service_role';delete from auth.users where id='${owner}';`);
 console.log('Synthetic transfer-concurrency owner deleted');
}

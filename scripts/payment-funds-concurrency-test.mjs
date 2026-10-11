import {randomUUID} from 'node:crypto';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject(),owner=randomUUID();let created=false;
try{
 const rows=await queryDatabase(project,`begin;
 insert into auth.users(id)values('${owner}');
 insert into budget_tracker.profiles(user_id,timezone,currency)values('${owner}','UTC','USD');
 set local request.jwt.claim.sub='${owner}';set local role authenticated;
 do $$declare method budget_tracker.payment_methods;c uuid;begin
 select id into c from budget_tracker.categories where user_id=auth.uid() limit 1;
 method:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','wallet','paymentType','E-wallet','name','Synthetic concurrent wallet','openingBalance','100.00'));
 perform budget_tracker.save_recurring_rule(jsonb_build_object('command','save','categoryId',c,'amount','60.00','note','Synthetic concurrent bill one','frequency','monthly','nextDueDate',current_date,'paymentMethodId',method.id));
 perform budget_tracker.save_recurring_rule(jsonb_build_object('command','save','categoryId',c,'amount','60.00','note','Synthetic concurrent bill two','frequency','monthly','nextDueDate',current_date,'paymentMethodId',method.id));
 end $$;reset role;commit;
 select id,payment_method_id,scheduled_date from budget_tracker.recurring_occurrences where user_id='${owner}' and scheduled_date=current_date order by id limit 2;`);
 created=true;
 if(rows.length!==2)throw new Error('Synthetic bills unavailable');
 const results=await Promise.all(rows.map(o=>queryDatabase(project,`begin;
 set local request.jwt.claim.sub='${owner}';set local role authenticated;
 do $$begin
 perform budget_tracker.pay_bill('${o.id}','${o.payment_method_id}','${randomUUID()}','60.00','${o.scheduled_date}');
 exception when sqlstate 'BT001' then null;end $$;
 reset role;commit;select true as finished;`)));
 if(results.length!==2)throw new Error('Concurrent calls incomplete');
 const [state]=await queryDatabase(project,`select count(*)filter(where state='recorded') as paid,count(*)filter(where state='outstanding') as unpaid from budget_tracker.recurring_occurrences where user_id='${owner}' and scheduled_date=current_date;`);
 if(Number(state.paid)!==1||Number(state.unpaid)!==1)throw new Error('Concurrent bill guard failed');
 console.log('PASS concurrent bill payments: one paid, one rejected.');
}catch{console.error('FAIL concurrent bill funds check.');process.exitCode=1;}
finally{
 // The random synthetic owner cannot match an existing account.
 if(created)try{await queryDatabase(project,`delete from auth.users where id='${owner}';`);}catch{console.error('Synthetic owner cleanup failed.');process.exitCode=1;}
}

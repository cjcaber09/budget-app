import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0020_combined_budget_cap.sql','utf8');
const owner='00000000-0000-4000-8000-000000009601';
const other='00000000-0000-4000-8000-000000009602';
const legacy='00000000-0000-4000-8000-000000009605';
const category='00000000-0000-4000-8000-000000009603';
const second='00000000-0000-4000-8000-000000009604';
const legacyCategory='00000000-0000-4000-8000-000000009606';
const query=`begin;
insert into auth.users(id)values('${owner}'),('${other}'),('${legacy}');
insert into budget_tracker.profiles(user_id,timezone)values('${owner}','Asia/Manila'),('${other}','Asia/Manila'),('${legacy}','Asia/Manila');
insert into budget_tracker.categories(id,user_id,name,color,icon,is_default)values('${category}','${owner}','Synthetic first','#55816A','cart',false),('${second}','${owner}','Synthetic second','#55816A','cart',false),('${legacyCategory}','${legacy}','Synthetic legacy','#55816A','cart',false);
insert into budget_tracker.monthly_limits(user_id,month,amount)values('${legacy}',(date_trunc('month',now() at time zone 'Asia/Manila')-interval '1 month')::date,50);
insert into budget_tracker.budgets(user_id,category_id,month,amount)values('${legacy}','${legacyCategory}',date_trunc('month',now() at time zone 'Asia/Manila')::date,100);
${migration}
set local request.jwt.claim.sub='${owner}';set local role authenticated;
do $$
#variable_conflict use_variable
declare month date:=date_trunc('month',now() at time zone 'Asia/Manila')::date;future date:=(month+interval '1 month')::date;
begin
 begin perform budget_tracker.set_category_budget('${category}',month,'1.00');raise exception 'Missing allowance accepted';exception when invalid_parameter_value then null;end;
 perform budget_tracker.set_monthly_allowance(month,'100.00');
 perform budget_tracker.set_category_budget('${category}',month,'60.00');
 perform budget_tracker.set_category_budget('${second}',month,'40.00');
 begin perform budget_tracker.set_category_budget('${second}',month,'40.01');raise exception 'Combined overflow accepted';exception when invalid_parameter_value then null;end;
 begin perform budget_tracker.set_monthly_allowance(month,'99.99');raise exception 'Allowance below combined budgets accepted';exception when invalid_parameter_value then null;end;
 if (select sum(amount) from budget_tracker.budgets b where b.month=month and user_id=auth.uid())<>100 then raise exception 'Rejected save changed budgets';end if;
 perform budget_tracker.set_category_budget('${category}',future,'80.00');
 if not exists(select from budget_tracker.monthly_limits l where l.month=future and amount=100) then raise exception 'Inherited future allowance not frozen';end if;
 perform budget_tracker.set_category_budget('${category}',month,'30.00');perform budget_tracker.set_monthly_allowance(month,'80.00');
 if not exists(select from budget_tracker.monthly_limits l where l.month=future and amount=100) then raise exception 'Earlier limit changed allocated future cap';end if;
 perform budget_tracker.set_monthly_allowance((month-interval '2 month')::date,'0.00');
 begin perform budget_tracker.set_category_budget('${category}',(month-interval '2 month')::date,'0.01');raise exception 'Zero allowance accepted spending allocation';exception when invalid_parameter_value then null;end;
 begin insert into budget_tracker.budgets(user_id,category_id,month,amount)values(auth.uid(),'${category}',month,1000);raise exception 'Direct budget write allowed';exception when insufficient_privilege then null;end;
 begin update budget_tracker.monthly_limits set amount=1 where user_id=auth.uid();raise exception 'Direct allowance write allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','${other}',true);
 begin perform budget_tracker.set_category_budget('${category}',month,'0.00');raise exception 'Foreign category accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','${legacy}',true);
 perform budget_tracker.prepare_dashboard(month);
 perform budget_tracker.set_category_budget('${legacyCategory}',month,'75.00');
 begin perform budget_tracker.set_category_budget('${legacyCategory}',month,'76.00');raise exception 'Legacy excess increased';exception when invalid_parameter_value then null;end;
 perform budget_tracker.set_category_budget('${legacyCategory}',month,'40.00');
 if not exists(select from budget_tracker.monthly_limits l where l.month=month and amount=50) then raise exception 'Legacy repair failed to adopt allowance';end if;
end $$;
reset role;set constraints all immediate;rollback;select 'PASS combined cap' as result;`;
await runSqlCheck(project,query,'PASS combined cap');

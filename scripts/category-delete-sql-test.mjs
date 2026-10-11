import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0028_category_delete_guard.sql','utf8');
await runSqlCheck(loadLinkedProject(),`begin;
${migration}
insert into auth.users(id) values('00000000-0000-4000-8000-000000009921');
insert into budget_tracker.profiles(user_id,timezone,currency) values('00000000-0000-4000-8000-000000009921','UTC','USD');
insert into budget_tracker.categories(id,user_id,name,color,icon) values
 ('00000000-0000-4000-8000-000000009922','00000000-0000-4000-8000-000000009921','Empty','#55816A','tag'),
 ('00000000-0000-4000-8000-000000009923','00000000-0000-4000-8000-000000009921','Used','#55816A','tag');
insert into budget_tracker.transactions(user_id,type,category_id,amount,occurred_at,transaction_date) values
 ('00000000-0000-4000-8000-000000009921','expense','00000000-0000-4000-8000-000000009923',1,now(),current_date);
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009921';
set local role authenticated;
do $$ begin
 delete from budget_tracker.categories where id='00000000-0000-4000-8000-000000009922';
 if exists(select from budget_tracker.categories where id='00000000-0000-4000-8000-000000009922') then raise exception 'Empty delete failed';end if;
 begin
  delete from budget_tracker.categories where id='00000000-0000-4000-8000-000000009923';
  raise exception 'Used category deleted';
 exception when sqlstate 'BC001' then null; end;
 if not exists(select from budget_tracker.transactions where category_id='00000000-0000-4000-8000-000000009923') then raise exception 'History lost';end if;
end $$;
reset role;
-- Administrative account cleanup continues to work.
set local request.jwt.claim.sub='';
delete from auth.users where id='00000000-0000-4000-8000-000000009921';
rollback;select 'PASS category deletion' as result;`,'PASS category deletion');

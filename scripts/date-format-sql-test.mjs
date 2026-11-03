import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0039_profile_date_format.sql','utf8');
await runSqlCheck(project,`begin;set local lock_timeout='5s';set local statement_timeout='30s';${migration}
insert into auth.users(id)values('00000000-0000-4000-8000-000000003901'),('00000000-0000-4000-8000-000000003902');
insert into budget_tracker.profiles(user_id,timezone)values('00000000-0000-4000-8000-000000003901','UTC'),('00000000-0000-4000-8000-000000003902','UTC');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003901',true);
set local role authenticated;
do $$declare v text;n integer;begin
 select date_format into v from budget_tracker.profiles where user_id=auth.uid();if v<>'long' then raise exception 'Default mismatch';end if;
 foreach v in array array['long','mdy','dmy','iso'] loop
  update budget_tracker.profiles set date_format=v where user_id=auth.uid();
  if (select date_format from budget_tracker.profiles where user_id=auth.uid())<>v then raise exception 'Save mismatch';end if;
 end loop;
 begin update budget_tracker.profiles set date_format='invalid' where user_id=auth.uid();raise exception 'Invalid format accepted';exception when check_violation then null;end;
 update budget_tracker.profiles set date_format='dmy' where user_id='00000000-0000-4000-8000-000000003902';get diagnostics n=row_count;if n<>0 then raise exception 'Foreign profile changed';end if;
 if (select count(*) from budget_tracker.profiles)<>1 then raise exception 'Owner isolation failed';end if;
end $$;
reset role;
select 'PASS date-format defaults, validation and owner isolation' as result;rollback;`,'PASS date-format defaults, validation and owner isolation');

import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0038_voice_entry_limits.sql','utf8');
const pass='PASS voice limits, deduplication, reset isolation and grants';
await runSqlCheck(project,`begin;set local lock_timeout='5s';set local statement_timeout='30s';${migration}
insert into auth.users(id)values('00000000-0000-4000-8000-000000003801'),('00000000-0000-4000-8000-000000003802');
select set_config('request.jwt.claim.role','service_role',true);
do $$declare v_owner uuid:='00000000-0000-4000-8000-000000003801';v_other uuid:='00000000-0000-4000-8000-000000003802';request_id uuid:=gen_random_uuid();v jsonb;epoch text;
begin
 if has_function_privilege('anon','budget_tracker.admit_voice_request(uuid,uuid,text,boolean)','execute') or has_function_privilege('authenticated','budget_tracker.finish_voice_request(uuid,uuid,boolean,integer)','execute') then raise exception 'Private function exposed';end if;
 if has_table_privilege('authenticated','budget_tracker.voice_requests','SELECT') then raise exception 'Private ledger exposed';end if;
 v:=budget_tracker.admit_voice_request(v_owner);if v->>'outcome'<>'available' then raise exception 'Availability failed';end if;
 v:=budget_tracker.admit_voice_request(v_owner,request_id,repeat('a',64),true);if v->>'outcome'<>'available' then raise exception 'Admission failed';end if;
 if (budget_tracker.admit_voice_request(v_owner,request_id,repeat('a',64),true))->>'outcome'<>'duplicate' then raise exception 'Duplicate admitted';end if;
 if (budget_tracker.admit_voice_request(v_owner,request_id,repeat('b',64),true))->>'outcome'<>'conflict' then raise exception 'Conflicting payload accepted';end if;
 if (budget_tracker.admit_voice_request(v_other,request_id,repeat('a',64),true))->>'outcome'<>'conflict' then raise exception 'Foreign UUID accepted';end if;
 if (budget_tracker.admit_voice_request(v_owner))->>'outcome'<>'blocked' then raise exception 'Concurrency bypass';end if;
 if not budget_tracker.finish_voice_request(v_owner,request_id,true) then raise exception 'Completion failed';end if;
 if (budget_tracker.admit_voice_request(v_owner))->>'reason'<>'account_cooldown' then raise exception 'Cooldown missing';end if;
 update budget_tracker.voice_requests set created_at=clock_timestamp()-interval '20 seconds' where id=request_id;
 insert into budget_tracker.voice_requests(id,owner_id,fingerprint,state,lease_until,reset_epoch)values(gen_random_uuid(),v_other,repeat('a',64),'failed',clock_timestamp(),'none');
 if (budget_tracker.admit_voice_request(v_owner))->>'reason'<>'global_minute' then raise exception 'Minute cap missing';end if;
 delete from budget_tracker.voice_requests where owner_id in(v_owner,v_other);
 -- Hour and day limits use admitted attempts, including failures.
 insert into budget_tracker.voice_requests(id,owner_id,fingerprint,state,lease_until,reset_epoch)
 select gen_random_uuid(),v_owner,repeat('a',64),'failed',clock_timestamp(),'none' from generate_series(1,5);
 update budget_tracker.voice_requests set created_at=clock_timestamp()-interval '2 minutes' where owner_id=v_owner;
 if (budget_tracker.admit_voice_request(v_owner))->>'reason'<>'account_hour' then raise exception 'Hourly cap missing';end if;
 update budget_tracker.voice_requests set created_at=clock_timestamp()-interval '2 hours' where owner_id=v_owner;
 insert into budget_tracker.voice_requests(id,owner_id,fingerprint,state,lease_until,reset_epoch,created_at)
 select gen_random_uuid(),v_owner,repeat('a',64),'failed',clock_timestamp(),'none',clock_timestamp()-interval '2 hours' from generate_series(1,15);
 if (budget_tracker.admit_voice_request(v_owner))->>'reason'<>'account_day' then raise exception 'Daily cap missing';end if;
 delete from budget_tracker.voice_requests where owner_id in(v_owner,v_other);
 request_id:=gen_random_uuid();perform budget_tracker.admit_voice_request(v_owner,request_id,repeat('a',64),true);
 update budget_tracker.voice_requests set lease_until=clock_timestamp()-interval '1 second' where id=request_id;
 if budget_tracker.finish_voice_request(v_owner,request_id,true) then raise exception 'Expired lease completed';end if;
 if (budget_tracker.admit_voice_request(v_owner,request_id,repeat('a',64),true))->>'outcome'<>'duplicate' then raise exception 'Expired request executed again';end if;
 delete from budget_tracker.voice_requests where owner_id in(v_owner,v_other);
 request_id:=gen_random_uuid();perform budget_tracker.admit_voice_request(v_owner,request_id,repeat('a',64),true);
 insert into budget_tracker.financial_resets(request_id,owner_id,state,completed_at)values(gen_random_uuid(),v_owner,'completed',clock_timestamp());
 if budget_tracker.finish_voice_request(v_owner,request_id,true) then raise exception 'Reset result accepted';end if;
 delete from budget_tracker.voice_requests where owner_id in(v_owner,v_other);
 insert into budget_tracker.voice_requests(id,owner_id,fingerprint,state,lease_until,reset_epoch,created_at)
 select gen_random_uuid(),null,repeat('a',64),'failed',clock_timestamp(),'none',date_trunc('month',clock_timestamp() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles' from generate_series(1,900);
 if (budget_tracker.admit_voice_request(v_owner))->>'reason'<>'global_month' then raise exception 'Monthly cap missing';end if;
end $$;
rollback;select '${pass}' result;`,pass);

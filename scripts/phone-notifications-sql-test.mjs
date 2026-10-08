import {loadEnvFile} from 'node:process';import {readFileSync} from 'node:fs';loadEnvFile();const ref=new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];if(readFileSync('supabase/.temp/project-ref','utf8').trim()!==ref)throw Error('Project mismatch');const sql=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0018_phone_notifications.sql','utf8');const user='00000000-0000-4000-8000-000000009801';const category='00000000-0000-4000-8000-000000009803';const query=`begin; ${sql}
insert into auth.users(id) values ('${user}');
set local request.jwt.claim.sub='${user}';
set local role authenticated;
insert into budget_tracker.profiles(user_id,timezone,bill_notifications) values ('${user}','Asia/Manila',true);
insert into budget_tracker.categories(id,user_id,name,color,icon,is_default) values ('${category}','${user}','Synthetic bill','#55816A','cart',false);
do $$ declare r budget_tracker.recurring_rules; s jsonb; begin
r:=budget_tracker.save_recurring_rule(jsonb_build_object('categoryId','${category}','amount','10.00','frequency','weekly','nextDueDate',(current_date+5)::text,'reminderEnabled',true,'reminderDaysBefore',1,'reminderTime','09:00'));
if not r.reminder_enabled or r.reminder_days_before<>1 or r.reminder_time<>'09:00' then raise exception 'Reminder config failed'; end if;
s:=budget_tracker.phone_notification_snapshot();if s->>'owner'<>'${user}' or jsonb_array_length(s->'bills')=0 then raise exception 'Snapshot failed'; end if;

if extract(hour from ((s->'bills'->0->>'reminder_at')::timestamptz at time zone 'UTC'))<>1 then raise exception 'Financial timezone reminder failed'; end if;
begin perform budget_tracker.save_recurring_rule(jsonb_build_object('id',r.id,'categoryId','${category}','amount','10.00','frequency','weekly','nextDueDate',(current_date+5)::text,'reminderEnabled',true,'reminderDaysBefore',2));raise exception 'Invalid days accepted'; exception when check_violation then null; end;
perform budget_tracker.bill_command((s->'bills'->0->>'id')::uuid,'skip');
s:=budget_tracker.phone_notification_snapshot();if exists(select from jsonb_array_elements(s->'bills') b where b->>'scheduled_date'=(current_date+5)::text) then raise exception 'Skipped reminder remains'; end if;
perform budget_tracker.save_recurring_rule(jsonb_build_object('id',r.id,'command','pause'));
s:=budget_tracker.phone_notification_snapshot();if jsonb_array_length(s->'bills')<>0 then raise exception 'Pause cleanup failed'; end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009802';
do $$ begin begin perform budget_tracker.phone_notification_snapshot();raise exception 'Other owner snapshot accepted';exception when insufficient_privilege then null;end;end $$;
reset role; set constraints all immediate; rollback; select 'PASS rollback-only migration, config validation, timezone, skipped/paused cancellation, owner isolation and integrity' as result;`;
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.EXPO_SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});const body=await response.json();if(!response.ok){console.log(JSON.stringify(body));process.exit(1);}console.log(JSON.stringify(body));

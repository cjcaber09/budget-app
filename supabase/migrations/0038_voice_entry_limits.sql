-- Content-free request receipts. Auth deletion anonymizes usage, not the global budget.
create table budget_tracker.voice_requests (
 id uuid primary key, owner_id uuid references auth.users(id) on delete set null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 state text not null default 'processing' check(state in ('processing','completed','failed')),
 lease_until timestamptz not null default clock_timestamp()+interval '60 seconds',
 reset_epoch text not null
);
create index voice_requests_created on budget_tracker.voice_requests(created_at);
create index voice_requests_owner_created on budget_tracker.voice_requests(owner_id,created_at);
alter table budget_tracker.voice_requests enable row level security;
revoke all on budget_tracker.voice_requests from public,anon,authenticated;
grant all on budget_tracker.voice_requests to service_role;
create table budget_tracker.voice_control(id boolean primary key default true check(id),cooldown_until timestamptz not null default '-infinity');
insert into budget_tracker.voice_control(id)values(true);
alter table budget_tracker.voice_control enable row level security;
revoke all on budget_tracker.voice_control from public,anon,authenticated;
grant all on budget_tracker.voice_control to service_role;

create function budget_tracker.admit_voice_request(p_owner uuid,p_request uuid default null,p_fingerprint text default null,p_reserve boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t timestamptz:=clock_timestamp();previous budget_tracker.voice_requests;rule record;
 n integer;wait_for integer:=0;candidate integer;reason text;epoch text;until_at timestamptz;
 month_start timestamptz:=date_trunc('month',clock_timestamp() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('budget_tracker:voice_quota'));
 if not budget_tracker.account_is_active(p_owner) then return jsonb_build_object('outcome','account_unavailable');end if;
 if p_reserve and (p_request is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$') then raise exception 'Invalid request' using errcode='22023';end if;
 if p_reserve then
  select * into previous from budget_tracker.voice_requests where id=p_request;
  if found then
   if previous.owner_id is distinct from p_owner or previous.fingerprint<>p_fingerprint then return jsonb_build_object('outcome','conflict');end if;
   return jsonb_build_object('outcome','duplicate','state',previous.state);
  end if;
 end if;
 select cooldown_until into until_at from budget_tracker.voice_control where id;
 if until_at>t then wait_for:=ceil(extract(epoch from until_at-t));reason:='provider_cooldown';end if;
 for rule in select * from (values
  ('account_cooldown',true,interval '10 seconds',1),('account_hour',true,interval '1 hour',5),
  ('account_day',true,interval '24 hours',20),('global_minute',false,interval '1 minute',2),
  ('global_day',false,interval '24 hours',40))as limits(label,owned,window_size,cap)
 loop
  select count(*) into n from budget_tracker.voice_requests r where r.created_at>t-rule.window_size and (not rule.owned or r.owner_id=p_owner);
  if n>=rule.cap then
   select ceil(extract(epoch from (r.created_at+rule.window_size)-t))::integer into candidate from budget_tracker.voice_requests r
   where r.created_at>t-rule.window_size and (not rule.owned or r.owner_id=p_owner) order by r.created_at desc offset (rule.cap-1) limit 1;
   if candidate>wait_for then wait_for:=candidate;reason:=rule.label;end if;
  end if;
 end loop;
 select count(*) into n from budget_tracker.voice_requests where created_at>=month_start;
 if n>=900 then
  candidate:=ceil(extract(epoch from (((month_start at time zone 'America/Los_Angeles')+interval '1 month')at time zone 'America/Los_Angeles')-t));
  if candidate>wait_for then wait_for:=candidate;reason:='global_month';end if;
 end if;
 select count(*),min(lease_until) into n,until_at from budget_tracker.voice_requests where state='processing' and lease_until>t;
 if n>=2 then candidate:=greatest(1,ceil(extract(epoch from until_at-t)));if candidate>wait_for then wait_for:=candidate;reason:='global_busy';end if;end if;
 select max(lease_until) into until_at from budget_tracker.voice_requests where owner_id=p_owner and state='processing' and lease_until>t;
 if until_at>t then candidate:=greatest(1,ceil(extract(epoch from until_at-t)));if candidate>wait_for then wait_for:=candidate;reason:='account_busy';end if;end if;
 if wait_for>0 then return jsonb_build_object('outcome','blocked','reason',reason,'retryAfterSeconds',wait_for);end if;
 if p_reserve then
  select coalesce(max(completed_at)::text,'none') into epoch from budget_tracker.financial_resets where owner_id=p_owner and state='completed';
  insert into budget_tracker.voice_requests(id,owner_id,fingerprint,reset_epoch)values(p_request,p_owner,p_fingerprint,epoch);
  -- Keep 90 days of deduplication receipts. Never delete a live lease.
  delete from budget_tracker.voice_requests where created_at<t-interval '90 days' and lease_until<t;
 end if;
 return jsonb_build_object('outcome','available');
end $$;

create function budget_tracker.finish_voice_request(p_owner uuid,p_request uuid,p_success boolean,p_cooldown integer default 0)
returns boolean language plpgsql security definer set search_path='' as $$
declare epoch text;receipt budget_tracker.voice_requests;valid boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('budget_tracker:voice_quota'));
 select * into receipt from budget_tracker.voice_requests where id=p_request and owner_id=p_owner for update;
 if not found or receipt.state<>'processing' then return false;end if;
 valid:=budget_tracker.account_is_active(p_owner);
 select coalesce(max(completed_at)::text,'none') into epoch from budget_tracker.financial_resets where owner_id=p_owner and state='completed';
 valid:=valid and receipt.reset_epoch=epoch and receipt.lease_until>clock_timestamp();
 update budget_tracker.voice_requests set state=case when valid and p_success then 'completed' else 'failed' end,lease_until=clock_timestamp() where id=p_request;
 if p_cooldown>0 then update budget_tracker.voice_control set cooldown_until=greatest(cooldown_until,clock_timestamp()+make_interval(secs=>least(p_cooldown,86400))) where id;end if;
 return valid and p_success;
end $$;
revoke all on function budget_tracker.admit_voice_request(uuid,uuid,text,boolean),budget_tracker.finish_voice_request(uuid,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function budget_tracker.admit_voice_request(uuid,uuid,text,boolean),budget_tracker.finish_voice_request(uuid,uuid,boolean,integer) to service_role;

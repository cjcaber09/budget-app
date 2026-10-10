-- Private durable jobs intentionally survive Auth deletion. Never store passwords.
create table budget_tracker.account_deletions (
 request_id uuid primary key,owner_id uuid not null unique,state text not null default 'pending' check(state in ('pending','completed')),
 created_at timestamptz not null default now(),completed_at timestamptz,error_code text,
 lease_until timestamptz,last_attempt_at timestamptz not null default now(),settle_after timestamptz not null default now()+interval '2 minutes'
);
alter table budget_tracker.account_deletions enable row level security;
revoke all on budget_tracker.account_deletions from public,anon,authenticated;
grant all on budget_tracker.account_deletions to service_role;

-- PostgREST validates JWT signatures even after the Auth user has been deleted.
-- Return only the caller's operation, never a caller-supplied owner.
create function budget_tracker.account_deletion_status() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('owner',owner_id,'requestId',request_id,'state',state)
 from budget_tracker.account_deletions where owner_id=auth.uid();
$$;
revoke all on function budget_tracker.account_deletion_status() from public,anon;
grant execute on function budget_tracker.account_deletion_status() to authenticated;

create function budget_tracker.account_is_active(p_owner uuid default auth.uid()) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null or (auth.role() is distinct from 'service_role' and p_owner is distinct from auth.uid()) then return false;end if;
 -- Metadata inserts and deletion initiation serialize against the same owner lock.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,371));
 return exists(select from auth.users where id=p_owner) and not exists(select from budget_tracker.account_deletions where owner_id=p_owner);
end $$;
revoke all on function budget_tracker.account_is_active(uuid) from public,anon;
grant execute on function budget_tracker.account_is_active(uuid) to authenticated,service_role;

create or replace function budget_tracker.financial_lock() returns void language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,371));
 if not budget_tracker.account_is_active() then raise exception 'Account deletion is in progress' using errcode='42501';end if;
end $$;

create function budget_tracker.guard_account_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Administrative cascades have no authenticated owner and must remain possible.
 if auth.uid() is not null then perform budget_tracker.financial_lock();end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function budget_tracker.guard_account_write() from public,anon,authenticated;
do $$declare t record;begin
 for t in select table_name from information_schema.columns where table_schema='budget_tracker' and column_name='user_id' loop
 execute format('create trigger account_write_guard before insert or update or delete on budget_tracker.%I for each row execute function budget_tracker.guard_account_write()',t.table_name);
 end loop;
end $$;
create policy avatar_account_active on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'budget-tracker-avatars' or budget_tracker.account_is_active());
create policy avatar_account_active_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'budget-tracker-avatars' or budget_tracker.account_is_active())
 with check(bucket_id<>'budget-tracker-avatars' or budget_tracker.account_is_active());

create table budget_tracker.account_scan_leases(id uuid primary key,owner_id uuid not null,expires_at timestamptz not null default now()+interval '10 minutes');
alter table budget_tracker.account_scan_leases enable row level security;
revoke all on budget_tracker.account_scan_leases from public,anon,authenticated;
grant all on budget_tracker.account_scan_leases to service_role;
create index account_scan_leases_owner on budget_tracker.account_scan_leases(owner_id,expires_at);
create function budget_tracker.begin_account_scan(p_owner uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not budget_tracker.account_is_active(p_owner) then return false;end if;
 insert into budget_tracker.account_scan_leases(id,owner_id)values(p_lease,p_owner);
 return true;
end $$;
revoke all on function budget_tracker.begin_account_scan(uuid,uuid) from public,anon,authenticated;
grant execute on function budget_tracker.begin_account_scan(uuid,uuid) to service_role;

create function budget_tracker.begin_account_deletion(p_owner uuid,p_request uuid) returns budget_tracker.account_deletions
language plpgsql security definer set search_path='' as $$
declare job budget_tracker.account_deletions;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,371));
 select * into job from budget_tracker.account_deletions where owner_id=p_owner;
 if found then return job;end if;
 if not exists(select from auth.users where id=p_owner) then raise exception 'Account unavailable' using errcode='42501';end if;
 insert into budget_tracker.account_deletions(request_id,owner_id)values(p_request,p_owner)returning * into job;return job;
end $$;
revoke all on function budget_tracker.begin_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function budget_tracker.begin_account_deletion(uuid,uuid) to service_role;

create function budget_tracker.claim_account_deletion(p_request uuid) returns boolean language sql security definer set search_path='' as $$
 with claimed as(update budget_tracker.account_deletions set lease_until=now()+interval '2 minutes'
 where request_id=p_request and (lease_until is null or lease_until<now()) returning request_id)select exists(select from claimed);
$$;
revoke all on function budget_tracker.claim_account_deletion(uuid) from public,anon,authenticated;
grant execute on function budget_tracker.claim_account_deletion(uuid) to service_role;

-- Worker URL/secret reuse the existing server-only OCR webhook configuration.
create function budget_tracker.enqueue_account_deletion_worker() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text;secret text;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='budget_tracker_ocr_function_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='budget_tracker_ocr_webhook_secret';
 if endpoint is null or secret is null then return;end if;
 perform net.http_post(url:=regexp_replace(endpoint,'/ocr$','/delete-account'),headers:=jsonb_build_object('Content-Type','application/json','x-ocr-webhook-secret',secret),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function budget_tracker.enqueue_account_deletion_worker() from public,anon,authenticated;
create extension if not exists pg_cron;
select cron.schedule('budget-account-deletion-cleanup','*/5 * * * *','select budget_tracker.enqueue_account_deletion_worker()');
notify pgrst,'reload schema';

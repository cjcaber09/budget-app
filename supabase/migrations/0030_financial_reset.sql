-- Password verification lives in the authenticated Edge Function. Initiation and
-- completion are service-only; clients can only inspect their own status.
create table budget_tracker.financial_resets (
 request_id uuid primary key,owner_id uuid not null,state text not null default 'pending' check(state in ('pending','completed')),
 created_at timestamptz not null default now(),completed_at timestamptz,error_code text,
 settle_after timestamptz not null default now()+interval '2 minutes',lease_until timestamptz,worker_token uuid,last_attempt_at timestamptz not null default now()
);
create unique index one_pending_financial_reset on budget_tracker.financial_resets(owner_id) where state='pending';
create index financial_resets_owner_recent on budget_tracker.financial_resets(owner_id,created_at desc);
alter table budget_tracker.financial_resets enable row level security;
revoke all on budget_tracker.financial_resets from public,anon,authenticated;
grant all on budget_tracker.financial_resets to service_role;

create or replace function budget_tracker.account_is_active(p_owner uuid default auth.uid()) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null or (auth.role() is distinct from 'service_role' and p_owner is distinct from auth.uid()) then return false;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,371));
 return exists(select from auth.users where id=p_owner)
  and not exists(select from budget_tracker.account_deletions where owner_id=p_owner)
  and not exists(select from budget_tracker.financial_resets where owner_id=p_owner and state='pending');
end $$;

create or replace function budget_tracker.financial_lock() returns void language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,371));
 if not budget_tracker.account_is_active() then raise exception 'Finance activity is paused while an account operation is in progress' using errcode='42501';end if;
end $$;

create function budget_tracker.begin_financial_reset(p_owner uuid,p_request uuid) returns budget_tracker.financial_resets
language plpgsql security definer set search_path='' as $$
declare job budget_tracker.financial_resets;
begin
 if auth.role() is distinct from 'service_role' or p_owner is null or p_request is null then raise exception 'Worker required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,371));
 select * into job from budget_tracker.financial_resets where request_id=p_request;
 if found then if job.owner_id<>p_owner then raise exception 'Operation unavailable' using errcode='42501';end if;return job;end if;
 select * into job from budget_tracker.financial_resets where owner_id=p_owner and state='pending';
 if found then return job;end if;
 if not budget_tracker.account_is_active(p_owner) then raise exception 'Account unavailable' using errcode='42501';end if;
 insert into budget_tracker.financial_resets(request_id,owner_id)values(p_request,p_owner)returning * into job;return job;
end $$;
revoke all on function budget_tracker.begin_financial_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function budget_tracker.begin_financial_reset(uuid,uuid) to service_role;

create function budget_tracker.financial_reset_status(p_request uuid default null) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('owner',owner_id,'requestId',request_id,'state',state) from budget_tracker.financial_resets
 where owner_id=auth.uid() and (p_request is null or request_id=p_request) order by created_at desc,request_id desc limit 1
$$;
revoke all on function budget_tracker.financial_reset_status(uuid) from public,anon;
grant execute on function budget_tracker.financial_reset_status(uuid) to authenticated;

create function budget_tracker.claim_financial_reset(p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 update budget_tracker.financial_resets set lease_until=now()+interval '2 minutes',worker_token=gen_random_uuid()
 where request_id=p_request and state='pending' and (lease_until is null or lease_until<now()) returning worker_token into token;
 return token;
end $$;
revoke all on function budget_tracker.claim_financial_reset(uuid) from public,anon,authenticated;
grant execute on function budget_tracker.claim_financial_reset(uuid) to service_role;

create function budget_tracker.can_cleanup_financial_reset(p_request uuid,p_token uuid,p_owner uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 return exists(select from budget_tracker.financial_resets where request_id=p_request and owner_id=p_owner and state='pending' and worker_token=p_token and lease_until>now());
end $$;
revoke all on function budget_tracker.can_cleanup_financial_reset(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function budget_tracker.can_cleanup_financial_reset(uuid,uuid,uuid) to service_role;

create function budget_tracker.complete_financial_reset(p_request uuid,p_token uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare job budget_tracker.financial_resets;
begin
 if auth.role() is distinct from 'service_role' or auth.uid() is not null then raise exception 'Worker required' using errcode='42501';end if;
 select * into job from budget_tracker.financial_resets where request_id=p_request;
 if not found then raise exception 'Operation unavailable' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(job.owner_id::text,371));
 select * into job from budget_tracker.financial_resets where request_id=p_request for update;
 -- Never clear newly recorded data on a lost-response retry of a completed reset.
 if job.state='completed' then return;end if;
 if p_token is null or job.worker_token is distinct from p_token or job.lease_until is null or job.lease_until<=now() then raise exception 'Cleanup lease expired' using errcode='55000';end if;
 if not exists(select from auth.users where id=job.owner_id) or exists(select from budget_tracker.account_deletions where owner_id=job.owner_id) then raise exception 'Account unavailable' using errcode='42501';end if;
 if now()<job.settle_after or exists(select from budget_tracker.account_scan_leases where owner_id=job.owner_id and expires_at>now()) then raise exception 'Uploads are still settling' using errcode='55000';end if;
 if exists(select from storage.objects where bucket_id in ('budget-tracker-ocr','budget-tracker-proofs') and name like job.owner_id::text||'/%') then raise exception 'Files still need cleanup' using errcode='55000';end if;
 delete from budget_tracker.transactions where user_id=job.owner_id;
 delete from budget_tracker.recurring_occurrences where user_id=job.owner_id;
 delete from budget_tracker.recurring_rules where user_id=job.owner_id;
 delete from budget_tracker.budgets where user_id=job.owner_id;
 delete from budget_tracker.monthly_limits where user_id=job.owner_id;
 delete from budget_tracker.payment_transfers where user_id=job.owner_id;
 delete from budget_tracker.balance_corrections where user_id=job.owner_id;
 delete from budget_tracker.income_sources where user_id=job.owner_id;
 delete from budget_tracker.payment_methods where user_id=job.owner_id;
 delete from budget_tracker.categories where user_id=job.owner_id;
 -- The invisible ledger still enforces provider quotas. Resetting data cannot reset scanning limits.
 update budget_tracker.ocr_scans set status='deleted',char_count=null where user_id=job.owner_id;
 delete from budget_tracker.account_scan_leases where owner_id=job.owner_id;
 insert into budget_tracker.categories(user_id,name,color,icon,is_default)values
 (job.owner_id,'Groceries','#4CAF50','cart',true),(job.owner_id,'Rent','#2196F3','home',true),
 (job.owner_id,'Transport','#FF9800','car',true),(job.owner_id,'Utilities','#9C27B0','bolt',true),
 (job.owner_id,'Entertainment','#E91E63','film',true),(job.owner_id,'Health','#00BCD4','heart',true),
 (job.owner_id,'Other','#607D8B','dots-horizontal',true);
 insert into budget_tracker.payment_methods(id,user_id,method,payment_type,name)values(gen_random_uuid(),job.owner_id,'cash','Cash','Cash');
 update budget_tracker.financial_resets set state='completed',completed_at=now(),error_code=null where request_id=p_request;
end $$;
revoke all on function budget_tracker.complete_financial_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function budget_tracker.complete_financial_reset(uuid,uuid) to service_role;

-- A second phone cannot start account deletion while a record reset owns the financial lock.
create or replace function budget_tracker.begin_account_deletion(p_owner uuid,p_request uuid) returns budget_tracker.account_deletions
language plpgsql security definer set search_path='' as $$
declare job budget_tracker.account_deletions;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,371));
 select * into job from budget_tracker.account_deletions where owner_id=p_owner;
 if found then return job;end if;
 if not exists(select from auth.users where id=p_owner) or exists(select from budget_tracker.financial_resets where owner_id=p_owner and state='pending') then raise exception 'Account unavailable' using errcode='42501';end if;
 insert into budget_tracker.account_deletions(request_id,owner_id)values(p_request,p_owner)returning * into job;return job;
end $$;
notify pgrst,'reload schema';

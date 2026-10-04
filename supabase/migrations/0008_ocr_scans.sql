create table budget_tracker.ocr_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Client-generated idempotency key: a retried request replays instead of
  -- calling Vision (and consuming quota) again.
  request_id uuid not null,
  -- SHA-256 of the image bytes (never the image itself): re-scanning an image
  -- the user already has a result for replays it instead of spending a
  -- free-tier Vision unit.
  image_sha256 text not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'deleted')),
  char_count integer,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index ocr_scans_user_created_idx on budget_tracker.ocr_scans (user_id, created_at desc);
create index ocr_scans_created_idx on budget_tracker.ocr_scans (created_at);
create index ocr_scans_user_image_idx on budget_tracker.ocr_scans (user_id, image_sha256);

alter table budget_tracker.ocr_scans enable row level security;

-- Read-only for users on purpose: rows double as the OCR rate-limit ledger,
-- so only the ocr edge function (service role) writes them. A user able to
-- delete rows could reset their own quota.
create policy "ocr_scans_select_own" on budget_tracker.ocr_scans
  for select using (auth.uid() = user_id);

-- Seconds until a rolling window drops back under p_limit, or null when it's
-- already under. p_user_id null = all users. When over, the p_limit-th newest
-- row is the one whose expiry frees a slot.
create or replace function budget_tracker.ocr_rolling_wait(p_user_id uuid, p_window interval, p_limit integer)
returns integer
language sql
stable
set search_path = budget_tracker, pg_temp
as $$
  select greatest(1, ceil(extract(epoch from (w.created_at + p_window - now()))))::integer
    from (
      select s.created_at
        from ocr_scans s
       where (p_user_id is null or s.user_id = p_user_id)
         and s.created_at > now() - p_window
       order by s.created_at desc
      offset p_limit - 1
       limit 1
    ) w;
$$;

create or replace function budget_tracker.try_consume_ocr_quota(p_user_id uuid, p_request_id uuid, p_image_sha256 text)
returns table (outcome text, scan_id uuid, scan_status text, retry_after_seconds integer, reason text)
language plpgsql
security definer
set search_path = budget_tracker, pg_temp
as $$
declare
  -- Google's free tier (1,000 units) resets on the Pacific Time calendar month.
  v_month_start timestamptz :=
    date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  v_count integer;
  v_wait integer;
  v_scan_id uuid;
  v_status text;
begin
  -- One global lock (not per-user) so the global cap can't be raced past by
  -- concurrent requests from different users. Volume is tiny.
  perform pg_advisory_xact_lock(hashtext('budget_tracker:ocr_quota'));

  -- Reconcile this user's stuck rows (function died mid-request, or the final
  -- status update failed after upload): the stored .txt is the source of truth.
  update ocr_scans s
     set status = case when exists (
           select 1 from storage.objects o
            where o.bucket_id = 'budget-tracker-ocr'
              and o.name = s.user_id::text || '/' || s.id::text || '.txt'
         ) then 'completed' else 'failed' end
   where s.user_id = p_user_id
     and s.status = 'pending'
     and s.created_at < now() - interval '10 minutes';

  select s.id, s.status into v_scan_id, v_status
    from ocr_scans s
   where s.user_id = p_user_id and s.request_id = p_request_id;
  if found then
    return query select 'replay'::text, v_scan_id, v_status, 0, null::text;
    return;
  end if;

  -- Same image already read for this user, and its .txt still exists: serve it.
  select s.id into v_scan_id
    from ocr_scans s
   where s.user_id = p_user_id
     and s.image_sha256 = p_image_sha256
     and s.status = 'completed'
     and exists (
       select 1 from storage.objects o
        where o.bucket_id = 'budget-tracker-ocr'
          and o.name = s.user_id::text || '/' || s.id::text || '.txt'
     )
   order by s.created_at desc
   limit 1;
  if found then
    return query select 'replay'::text, v_scan_id, 'completed'::text, 0, null::text;
    return;
  end if;

  -- Longest window first, so retry_after_seconds is the real wait when
  -- several limits are hit at once.
  select count(*) into v_count from ocr_scans s where s.created_at >= v_month_start;
  if v_count >= 900 then
    return query select 'blocked'::text, null::uuid, null::text,
      greatest(1, ceil(extract(epoch from (
        ((v_month_start at time zone 'America/Los_Angeles') + interval '1 month') at time zone 'America/Los_Angeles'
        - now()
      ))))::integer,
      'global_monthly'::text;
    return;
  end if;

  v_wait := ocr_rolling_wait(p_user_id, interval '24 hours', 20);
  if v_wait is not null then
    return query select 'blocked'::text, null::uuid, null::text, v_wait, 'user_daily'::text;
    return;
  end if;

  v_wait := ocr_rolling_wait(null, interval '24 hours', 40);
  if v_wait is not null then
    return query select 'blocked'::text, null::uuid, null::text, v_wait, 'global_daily'::text;
    return;
  end if;

  v_wait := ocr_rolling_wait(p_user_id, interval '1 hour', 5);
  if v_wait is not null then
    return query select 'blocked'::text, null::uuid, null::text, v_wait, 'user_hourly'::text;
    return;
  end if;

  insert into ocr_scans (user_id, request_id, image_sha256) values (p_user_id, p_request_id, p_image_sha256)
  returning id into v_scan_id;
  return query select 'new'::text, v_scan_id, 'pending'::text, 0, null::text;
end;
$$;

-- 0001's default privileges grant execute on new functions to anon and
-- authenticated; these must only be callable by the edge function.
revoke execute on function budget_tracker.ocr_rolling_wait(uuid, interval, integer) from public, anon, authenticated;
revoke execute on function budget_tracker.try_consume_ocr_quota(uuid, uuid, text) from public, anon, authenticated;
grant execute on function budget_tracker.try_consume_ocr_quota(uuid, uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('budget-tracker-ocr', 'budget-tracker-ocr', false, 1048576)
on conflict (id) do nothing;

-- Read own folder only. No user write/delete policies: the edge function
-- (service role) is the only writer.
create policy "budget_tracker_ocr_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'budget-tracker-ocr' and (storage.foldername(name))[1] = auth.uid()::text);

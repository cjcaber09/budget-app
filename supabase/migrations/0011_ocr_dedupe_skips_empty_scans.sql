-- Same-image dedupe must not replay an empty scan. A completed scan with
-- char_count = 0 (the provider found no text) would otherwise be served forever,
-- so re-picking the same file always said "No text found" even after a retake or
-- a better provider. A null char_count is a reconciled row whose .txt exists but
-- whose length wasn't recorded, so it stays reusable.
--
-- 0008 is already applied, so this replaces try_consume_ocr_quota: identical to
-- 0008 except for the added `char_count` condition in the same-image dedupe query.
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
  -- Empty scans (char_count = 0) are skipped so a re-pick gets a fresh read.
  select s.id into v_scan_id
    from ocr_scans s
   where s.user_id = p_user_id
     and s.image_sha256 = p_image_sha256
     and s.status = 'completed'
     and (s.char_count is null or s.char_count > 0)
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

-- create or replace keeps existing grants, but restate them so this file is
-- self-contained: only the edge function (service role) may call it.
revoke execute on function budget_tracker.try_consume_ocr_quota(uuid, uuid, text) from public, anon, authenticated;
grant execute on function budget_tracker.try_consume_ocr_quota(uuid, uuid, text) to service_role;

create extension if not exists pg_net with schema extensions;

-- Deleting storage.objects rows in SQL would orphan the actual files, so the
-- cleanup goes through the Storage API in the ocr edge function. pg_net queues
-- the call inside this transaction and sends it after commit.
create or replace function budget_tracker.enqueue_ocr_account_cleanup()
returns trigger
language plpgsql
security definer
set search_path = budget_tracker, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'budget_tracker_ocr_function_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'budget_tracker_ocr_webhook_secret';

  -- Never block an account deletion over cleanup config.
  if v_url is null or v_secret is null then
    raise warning 'budget_tracker: OCR cleanup not configured; .txt files for a deleted user were left in storage';
    return old;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ocr-webhook-secret', v_secret),
    body := jsonb_build_object('userId', old.id),
    -- pg_net's default is 5 s; a cold-started function listing and removing
    -- files can take longer, and a timed-out call is never retried.
    timeout_milliseconds := 30000
  );
  return old;
end;
$$;

revoke execute on function budget_tracker.enqueue_ocr_account_cleanup() from public, anon, authenticated;

drop trigger if exists on_auth_user_deleted_ocr_cleanup on auth.users;
create trigger on_auth_user_deleted_ocr_cleanup
  after delete on auth.users
  for each row execute function budget_tracker.enqueue_ocr_account_cleanup();

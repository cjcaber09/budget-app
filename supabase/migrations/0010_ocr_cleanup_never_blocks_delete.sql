-- 0009's trigger only tolerated missing Vault config: any other error (a Vault
-- read failure, pg_net missing or rejecting the call) escaped and aborted the
-- whole auth.users delete, on a project other apps share. Cleanup must never
-- block a deletion, so catch everything and log only the SQLSTATE (never SQLERRM,
-- which can echo request data).
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
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'budget_tracker_ocr_function_url';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'budget_tracker_ocr_webhook_secret';

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
  exception when others then
    raise warning 'budget_tracker: OCR cleanup enqueue failed (sqlstate %); .txt files for a deleted user were left in storage', sqlstate;
  end;
  return old;
end;
$$;

-- create or replace keeps existing grants; restated so this file stands alone.
revoke execute on function budget_tracker.enqueue_ocr_account_cleanup() from public, anon, authenticated;

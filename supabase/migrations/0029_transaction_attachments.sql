insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('budget-tracker-proofs','budget-tracker-proofs',false,10485760,array['image/webp','application/pdf']);

create table budget_tracker.transaction_attachments (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 transaction_id uuid not null, file_name text not null check(length(file_name) between 1 and 160),
 mime_type text not null check(mime_type in ('image/webp','application/pdf')),
 size_bytes integer not null check(size_bytes between 1 and 10485760),object_path text not null unique,
 status text not null default 'pending' check(status in ('pending','ready')),created_at timestamptz not null default now(),
 foreign key(user_id,transaction_id) references budget_tracker.transactions(user_id,id) on delete cascade
);
create index transaction_attachments_owner_parent on budget_tracker.transaction_attachments(user_id,transaction_id,created_at);
alter table budget_tracker.transaction_attachments enable row level security;
revoke all on budget_tracker.transaction_attachments from public,anon,authenticated;
grant select on budget_tracker.transaction_attachments to authenticated;
create policy attachments_owner on budget_tracker.transaction_attachments for select to authenticated using(user_id=auth.uid());

-- This outbox survives transaction/Auth cascades and retries Storage API failures.
create table budget_tracker.attachment_cleanup_jobs (
 object_path text primary key,owner_id uuid not null,attachment_id uuid not null,
 not_before timestamptz not null default now()+interval '2 minutes',completed_at timestamptz
);
alter table budget_tracker.attachment_cleanup_jobs enable row level security;
revoke all on budget_tracker.attachment_cleanup_jobs from public,anon,authenticated;
grant all on budget_tracker.transaction_attachments,budget_tracker.attachment_cleanup_jobs to service_role;

create function budget_tracker.queue_attachment_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into budget_tracker.attachment_cleanup_jobs(object_path,owner_id,attachment_id)
 values(old.object_path,old.user_id,old.id) on conflict(object_path) do nothing;
 -- Keep an admitted upload's lease until it expires. Cleanup waits for it.
 return old;
end $$;
revoke all on function budget_tracker.queue_attachment_cleanup() from public,anon,authenticated;
create trigger attachment_delete_cleanup after delete on budget_tracker.transaction_attachments
 for each row execute function budget_tracker.queue_attachment_cleanup();

create function budget_tracker.proof_upload_allowed(p_path text) returns boolean
language sql security definer set search_path='' as $$
 select budget_tracker.account_is_active() and exists(
  select from budget_tracker.transaction_attachments a join budget_tracker.transactions t on t.id=a.transaction_id and t.user_id=a.user_id
  where a.user_id=auth.uid() and a.object_path=p_path and a.status='pending'
   and exists(select from budget_tracker.account_scan_leases l where l.id=a.id and l.owner_id=a.user_id and l.expires_at>now())
 )
$$;
revoke all on function budget_tracker.proof_upload_allowed(text) from public,anon;
grant execute on function budget_tracker.proof_upload_allowed(text) to authenticated;
create policy proofs_insert on storage.objects for insert to authenticated with check(bucket_id='budget-tracker-proofs' and budget_tracker.proof_upload_allowed(name));
create policy proofs_select on storage.objects for select to authenticated using(bucket_id='budget-tracker-proofs' and exists(select from budget_tracker.transaction_attachments a where a.object_path=name and a.user_id=auth.uid()));

create function budget_tracker.reserve_transaction_attachment(p_transaction uuid,p_file jsonb)
returns budget_tracker.transaction_attachments language plpgsql security definer set search_path='' as $$
declare saved budget_tracker.transaction_attachments; v_id uuid:=(p_file->>'id')::uuid; v_mime text:=p_file->>'mime';v_name text:=p_file->>'name';v_size integer:=(p_file->>'size')::integer;path text;
begin
 perform budget_tracker.financial_lock();
 if not exists(select from budget_tracker.transactions where id=p_transaction and user_id=auth.uid())then raise exception 'Transaction unavailable' using errcode='42501';end if;
 if v_id is null or v_mime is null or v_mime not in ('image/webp','application/pdf') or v_name is null or length(v_name) not between 1 and 160 or v_size is null or v_size not between 1 and 10485760 then raise exception 'Invalid proof file' using errcode='22023';end if;
 path:=auth.uid()::text||'/'||p_transaction::text||'/'||v_id::text||case when v_mime='application/pdf' then '.pdf' else '.webp' end;
 select * into saved from budget_tracker.transaction_attachments where id=v_id;
 if saved.id is not null then
  if saved.user_id<>auth.uid() or saved.transaction_id<>p_transaction or saved.file_name<>v_name or saved.mime_type<>v_mime or saved.size_bytes<>v_size then raise exception 'Attachment retry conflicts' using errcode='23505';end if;
 else
  if exists(select from budget_tracker.account_scan_leases where id=v_id)then raise exception 'Choose the file again' using errcode='22023';end if;
  if exists(select from budget_tracker.attachment_cleanup_jobs where object_path=path)then raise exception 'Attachment draft expired. Select the file again.' using errcode='BA003';end if;
  if(select count(*) from budget_tracker.transaction_attachments where user_id=auth.uid() and transaction_id=p_transaction)>=3 then raise exception 'Up to 3 proof files per transaction' using errcode='22023';end if;
  insert into budget_tracker.transaction_attachments(id,user_id,transaction_id,file_name,mime_type,size_bytes,object_path)
  values(v_id,auth.uid(),p_transaction,v_name,v_mime,v_size,path) returning * into saved;
 end if;
 if saved.status='pending' then
  insert into budget_tracker.account_scan_leases(id,owner_id,expires_at)values(v_id,auth.uid(),now()+interval '10 minutes')
  on conflict(id) do update set expires_at=excluded.expires_at where account_scan_leases.owner_id=auth.uid();
 end if;
 return saved;
end $$;
revoke all on function budget_tracker.reserve_transaction_attachment(uuid,jsonb) from public,anon;
grant execute on function budget_tracker.reserve_transaction_attachment(uuid,jsonb) to authenticated;

create function budget_tracker.finish_transaction_attachment(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a budget_tracker.transaction_attachments; object storage.objects;
begin
 perform budget_tracker.financial_lock();select * into a from budget_tracker.transaction_attachments where id=p_id and user_id=auth.uid() for update;
 if a.id is null then raise exception 'Attachment unavailable' using errcode='42501';end if;
 if a.status='ready' then return;end if;
 select * into object from storage.objects where bucket_id='budget-tracker-proofs' and name=a.object_path;
 if object.id is null or object.metadata->>'mimetype' is distinct from a.mime_type or (object.metadata->>'size')::bigint is distinct from a.size_bytes::bigint then raise exception 'Upload incomplete. Retry.' using errcode='22023';end if;
 update budget_tracker.transaction_attachments set status='ready' where id=a.id;
 delete from budget_tracker.account_scan_leases where id=a.id and owner_id=auth.uid();
end $$;
revoke all on function budget_tracker.finish_transaction_attachment(uuid) from public,anon;
grant execute on function budget_tracker.finish_transaction_attachment(uuid) to authenticated;

create function budget_tracker.delete_transaction_attachment(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform budget_tracker.financial_lock();delete from budget_tracker.transaction_attachments where id=p_id and user_id=auth.uid();
end $$;
revoke all on function budget_tracker.delete_transaction_attachment(uuid) from public,anon;
grant execute on function budget_tracker.delete_transaction_attachment(uuid) to authenticated;

create function budget_tracker.expire_attachment_uploads() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 delete from budget_tracker.transaction_attachments a where status='pending' and created_at<now()-interval '10 minutes'
  and not exists(select from budget_tracker.account_scan_leases l where l.id=a.id and l.expires_at>now());
end $$;
revoke all on function budget_tracker.expire_attachment_uploads() from public,anon,authenticated;
grant execute on function budget_tracker.expire_attachment_uploads() to service_role;

create function budget_tracker.attachment_cleanup_batch() returns setof budget_tracker.attachment_cleanup_jobs
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 perform budget_tracker.expire_attachment_uploads();
 return query select j.* from budget_tracker.attachment_cleanup_jobs j where j.completed_at is null and j.not_before<now()
  and not exists(select from budget_tracker.account_scan_leases l where l.id=j.attachment_id and l.owner_id=j.owner_id and l.expires_at>now())
  order by j.not_before limit 50;
end $$;
revoke all on function budget_tracker.attachment_cleanup_batch() from public,anon,authenticated;
grant execute on function budget_tracker.attachment_cleanup_batch() to service_role;
notify pgrst,'reload schema';


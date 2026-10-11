insert into auth.users(id)values('00000000-0000-4000-8000-000000009951'),('00000000-0000-4000-8000-000000009952');
insert into budget_tracker.profiles(user_id,timezone,currency)values('00000000-0000-4000-8000-000000009951','UTC','USD'),('00000000-0000-4000-8000-000000009952','UTC','USD');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009951';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$
declare t budget_tracker.transactions;a budget_tracker.transaction_attachments;f jsonb:=jsonb_build_object('id','00000000-0000-4000-8000-000000009953','name','Receipt.webp','mime','image/webp','size',12);
begin
 t:=budget_tracker.save_transaction(jsonb_build_object('id','00000000-0000-4000-8000-000000009954','operation','create','payload_version',4,'type','income','category_id',null,'amount','10.00','note','Synthetic proof','occurred_at',now(),'transaction_date',current_date),'[]');
 a:=budget_tracker.reserve_transaction_attachment(t.id,f);
 if a.object_path<>auth.uid()::text||'/'||t.id::text||'/00000000-0000-4000-8000-000000009953.webp' or not budget_tracker.proof_upload_allowed(a.object_path) then raise exception 'Owned upload not admitted';end if;
 perform budget_tracker.reserve_transaction_attachment(t.id,f);
 begin perform budget_tracker.reserve_transaction_attachment(t.id,f||'{"size":13}');raise exception 'Conflicting file retry accepted';exception when unique_violation then null;end;
 begin perform budget_tracker.finish_transaction_attachment(a.id);raise exception 'Missing object completed';exception when invalid_parameter_value then null;end;
 begin perform budget_tracker.reserve_transaction_attachment(t.id,f||jsonb_build_object('id',gen_random_uuid(),'mime','image/png'));raise exception 'Original image accepted';exception when invalid_parameter_value then null;end;
 perform budget_tracker.reserve_transaction_attachment(t.id,f||jsonb_build_object('id',gen_random_uuid(),'name','Second.pdf','mime','application/pdf'));
 perform budget_tracker.reserve_transaction_attachment(t.id,f||jsonb_build_object('id',gen_random_uuid()));
 begin perform budget_tracker.reserve_transaction_attachment(t.id,f||jsonb_build_object('id',gen_random_uuid()));raise exception 'Attachment cap bypassed';exception when invalid_parameter_value then null;end;
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata)values('budget-tracker-proofs','00000000-0000-4000-8000-000000009951/00000000-0000-4000-8000-000000009954/00000000-0000-4000-8000-000000009953.webp','{"mimetype":"image/webp","size":12}');
set local role authenticated;
do $$ declare a budget_tracker.transaction_attachments;begin
 perform budget_tracker.finish_transaction_attachment('00000000-0000-4000-8000-000000009953');
 perform budget_tracker.finish_transaction_attachment('00000000-0000-4000-8000-000000009953');
 select * into a from budget_tracker.transaction_attachments where id='00000000-0000-4000-8000-000000009953';
 if a.status<>'ready' or budget_tracker.proof_upload_allowed(a.object_path)then raise exception 'Ready proof remains writable';end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009952';
do $$ begin
 if exists(select from budget_tracker.transaction_attachments)then raise exception 'Cross-owner metadata exposed';end if;
 begin perform budget_tracker.reserve_transaction_attachment('00000000-0000-4000-8000-000000009954',jsonb_build_object('id',gen_random_uuid(),'name','Foreign.webp','mime','image/webp','size',12));raise exception 'Foreign parent accepted';exception when insufficient_privilege then null;end;
 begin perform budget_tracker.finish_transaction_attachment('00000000-0000-4000-8000-000000009953');raise exception 'Foreign finish accepted';exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','budget_tracker.attachment_cleanup_jobs','SELECT') or has_function_privilege('authenticated','budget_tracker.attachment_cleanup_batch()','EXECUTE')then raise exception 'Private worker exposed';end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009951';
do $$ begin
 perform budget_tracker.delete_transaction_attachment('00000000-0000-4000-8000-000000009953');
 begin perform budget_tracker.reserve_transaction_attachment('00000000-0000-4000-8000-000000009954','{"id":"00000000-0000-4000-8000-000000009953","name":"Receipt.webp","mime":"image/webp","size":12}');raise exception 'Deleted file recreated';exception when sqlstate 'BA003' then null;end;
end $$;
reset role;
delete from budget_tracker.transactions where id='00000000-0000-4000-8000-000000009954';
do $$ begin
 if(select count(*) from budget_tracker.attachment_cleanup_jobs where owner_id='00000000-0000-4000-8000-000000009951')<>3 then raise exception 'Transaction cascade missed files';end if;
 if(select count(*) from budget_tracker.account_scan_leases where owner_id='00000000-0000-4000-8000-000000009951')<>2 then raise exception 'Upload leases released before storage settled';end if;
end $$;
update budget_tracker.attachment_cleanup_jobs set not_before=now()-interval '1 minute' where owner_id='00000000-0000-4000-8000-000000009951';
set local request.jwt.claim.role='service_role';
do $$ begin if(select count(*) from budget_tracker.attachment_cleanup_batch())<>1 then raise exception 'In-flight upload cleaned early';end if;end $$;
update budget_tracker.account_scan_leases set expires_at=now()-interval '1 minute' where owner_id='00000000-0000-4000-8000-000000009951';
set local request.jwt.claim.sub='';
delete from auth.users where id='00000000-0000-4000-8000-000000009951';
do $$ begin if(select count(*) from budget_tracker.attachment_cleanup_batch())<>3 then raise exception 'Cleanup outbox lost after auth deletion';end if;end $$;

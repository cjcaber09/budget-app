-- Add Transaction transfers reuse the existing principal/fee accounting writer.
alter table budget_tracker.payment_transfers
 add column created_at timestamptz not null default clock_timestamp(),
 add column created_at_inferred boolean not null default false,
 add column version integer not null default 1 check(version>0);
update budget_tracker.payment_transfers set created_at=least(source_assigned_at,destination_assigned_at),created_at_inferred=true;
create index transfers_entry_history on budget_tracker.payment_transfers(user_id,transfer_date desc,created_at desc,id desc);

create table budget_tracker.financial_activity_ids(
 user_id uuid not null references auth.users(id) on delete cascade,id uuid not null,kinds text[] not null,
 primary key(user_id,id)
);
insert into budget_tracker.financial_activity_ids
 select user_id,id,array_agg(distinct kind) from (
 select user_id,id,'transaction' kind from budget_tracker.transactions union all
 select user_id,id,'refund' from budget_tracker.refunds union all
 select user_id,id,'transfer' from budget_tracker.payment_transfers) a group by user_id,id;
alter table budget_tracker.financial_activity_ids enable row level security;
revoke all on budget_tracker.financial_activity_ids from public,anon,authenticated;
create or replace function budget_tracker.guard_financial_activity_id() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text:=case tg_table_name when 'transactions' then 'transaction' when 'refunds' then 'refund' else 'transfer' end;claimed text[];
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,371));
 if (auth.uid() is not null and auth.uid()<>new.user_id) or not budget_tracker.account_is_active(new.user_id) then raise exception 'Financial activity unavailable' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text||':'||new.id::text,784));
 select kinds into claimed from budget_tracker.financial_activity_ids where user_id=new.user_id and id=new.id;
 if claimed is not null and claimed<>array[kind] then raise exception 'This activity ID is already used. Check the saved entry.' using errcode='23505';end if;
 insert into budget_tracker.financial_activity_ids values(new.user_id,new.id,array[kind]) on conflict do nothing;
 return new;
end $$;
revoke all on function budget_tracker.guard_financial_activity_id() from public,anon,authenticated;
create trigger financial_activity_id before insert on budget_tracker.payment_transfers for each row execute function budget_tracker.guard_financial_activity_id();

create table budget_tracker.payment_transfer_requests(
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,transfer_id uuid not null,
 operation text not null check(operation in ('create','update','delete')),payload jsonb,
 provenance text not null check(provenance in ('command','legacy_snapshot')),result_version integer,
 created_at timestamptz not null default clock_timestamp(),primary key(user_id,request_id)
);
create index transfer_requests_parent on budget_tracker.payment_transfer_requests(user_id,transfer_id);
insert into budget_tracker.payment_transfer_requests(user_id,request_id,transfer_id,operation,provenance,result_version)
 select user_id,id,id,'create','legacy_snapshot',version from budget_tracker.payment_transfers;
alter table budget_tracker.payment_transfer_requests enable row level security;
revoke all on budget_tracker.payment_transfer_requests from public,anon,authenticated;

create function budget_tracker.transfer_entry_revision() returns trigger language plpgsql set search_path='' as $$
begin
 new.created_at:=old.created_at;new.created_at_inferred:=old.created_at_inferred;new.version:=old.version+1;return new;
end $$;
revoke all on function budget_tracker.transfer_entry_revision() from public,anon,authenticated;
create trigger transfer_entry_revision before update on budget_tracker.payment_transfers for each row execute function budget_tracker.transfer_entry_revision();

alter function budget_tracker.save_payment_transfer(jsonb) rename to transfer_core_v2;
revoke all on function budget_tracker.transfer_core_v2(jsonb) from public,anon,authenticated;
create function budget_tracker.save_transfer_entry(p_transfer jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();rid uuid;tid uuid;op text;payload jsonb;receipt budget_tracker.payment_transfer_requests;f budget_tracker.payment_transfers;committed integer;
begin
 perform budget_tracker.financial_lock();
 if jsonb_typeof(p_transfer->'payload_version') is distinct from 'number' or p_transfer->>'payload_version' is distinct from '3' then raise exception 'Transfer version required' using errcode='22023';end if;
 tid:=(p_transfer->>'id')::uuid;rid:=(p_transfer->>'requestId')::uuid;op:=p_transfer->>'operation';
 if tid is null or rid is null or op is null or op not in ('create','update','delete') or (op='create' and rid<>tid) then raise exception 'Invalid transfer command' using errcode='22023';end if;
 payload:=jsonb_build_object('id',tid,'operation',op,'expectedVersion',p_transfer->'expectedVersion');
 if op<>'delete' then payload:=payload||jsonb_build_object('sourceId',p_transfer->'sourceId','destinationId',p_transfer->'destinationId','amount',p_transfer->'amount','feeAmount',p_transfer->'feeAmount','feeMode',p_transfer->'feeMode','date',p_transfer->'date','note',nullif(btrim(p_transfer->>'note'),''));end if;
 select * into receipt from budget_tracker.payment_transfer_requests where user_id=owner_id and request_id=rid;
 if receipt.request_id is not null then
  if receipt.provenance<>'command' or receipt.transfer_id<>tid or receipt.payload is distinct from payload then raise exception 'Request already used. Check the saved transfer.' using errcode='TE003';end if;
  select * into f from budget_tracker.payment_transfers where user_id=owner_id and id=tid;
  return jsonb_build_object('owner',owner_id,'requestId',rid,'state',case when f.id is null then 'removed' else 'saved' end,'committedVersion',receipt.result_version,'transfer',case when f.id is null then null else to_jsonb(f)||jsonb_build_object('amount',f.amount::text,'fee_amount',f.fee_amount::text) end);
 end if;
 select * into f from budget_tracker.payment_transfers where user_id=owner_id and id=tid for update;
 if op='create' then
  if f.id is not null or exists(select from budget_tracker.payment_transfer_requests where user_id=owner_id and transfer_id=tid) then raise exception 'Transfer already recorded or removed' using errcode='TE003';end if;
 else
  if f.id is null then raise exception 'Transfer unavailable' using errcode='42501';end if;
  if jsonb_typeof(p_transfer->'expectedVersion') is distinct from 'number' or (p_transfer->>'expectedVersion')::integer<>f.version then raise exception 'Transfer changed. Reload and review your draft.' using errcode='TE002';end if;
 end if;
 f:=budget_tracker.transfer_core_v2((payload-'expectedVersion')||jsonb_build_object('payload_version',2));committed:=f.version;
 insert into budget_tracker.payment_transfer_requests(user_id,request_id,transfer_id,operation,payload,provenance,result_version) values(owner_id,rid,tid,op,payload,'command',committed);
 return jsonb_build_object('owner',owner_id,'requestId',rid,'state',case when op='delete' then 'removed' else 'saved' end,'committedVersion',committed,'transfer',case when op='delete' then null else to_jsonb(f)||jsonb_build_object('amount',f.amount::text,'fee_amount',f.fee_amount::text) end);
end $$;
revoke all on function budget_tracker.save_transfer_entry(jsonb) from public,anon;
grant execute on function budget_tracker.save_transfer_entry(jsonb) to authenticated;

create function budget_tracker.save_payment_transfer(p_transfer jsonb) returns budget_tracker.payment_transfers
language plpgsql security definer set search_path='' as $$
declare result jsonb;f budget_tracker.payment_transfers;
begin
 if p_transfer->>'operation' is distinct from 'create' then raise exception 'Update the app to edit or delete transfers.' using errcode='TE001';end if;
 if p_transfer ? 'payload_version' and p_transfer->>'payload_version'<>'2' then raise exception 'Unsupported transfer version' using errcode='22023';end if;
 result:=budget_tracker.save_transfer_entry(p_transfer||jsonb_build_object('payload_version',3,'requestId',p_transfer->>'id','feeAmount',coalesce(p_transfer->>'feeAmount','0.00'),'feeMode',coalesce(p_transfer->>'feeMode','added')));
 if result->>'state'='removed' then raise exception 'Transfer was removed. Check history.' using errcode='TE003';end if;
 select * into f from jsonb_populate_record(null::budget_tracker.payment_transfers,result->'transfer');return f;
end $$;
revoke all on function budget_tracker.save_payment_transfer(jsonb) from public,anon;
grant execute on function budget_tracker.save_payment_transfer(jsonb) to authenticated;
-- Rebind the old fee wrapper to the public create-only compatibility endpoint.
create or replace function budget_tracker.save_payment_transfer_with_fee(p_transfer jsonb) returns budget_tracker.payment_transfers
language plpgsql security invoker set search_path='' as $$
begin
 if p_transfer->>'payload_version' is distinct from '2' then raise exception 'Transfer version required' using errcode='22023';end if;
 return budget_tracker.save_payment_transfer(p_transfer);
end $$;

create function budget_tracker.transfer_entry_status(p_id uuid,p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare f budget_tracker.payment_transfers;
begin
 perform budget_tracker.financial_lock();select * into f from budget_tracker.payment_transfers where user_id=auth.uid() and id=p_id;
 return jsonb_build_object('owner',auth.uid(),'id',p_id,'requestCommitted',exists(select from budget_tracker.payment_transfer_requests where user_id=auth.uid() and request_id=p_request and transfer_id=p_id and provenance='command'),'state',case when f.id is not null then 'saved' when exists(select from budget_tracker.payment_transfer_requests where user_id=auth.uid() and transfer_id=p_id) then 'removed' else 'not_found' end,'transfer',case when f.id is null then null else to_jsonb(f)||jsonb_build_object('amount',f.amount::text,'fee_amount',f.fee_amount::text) end);
end $$;
revoke all on function budget_tracker.transfer_entry_status(uuid,uuid) from public,anon;
grant execute on function budget_tracker.transfer_entry_status(uuid,uuid) to authenticated;

-- Proofs have exactly one owned parent; the outbox/leases remain unchanged.
alter table budget_tracker.transaction_attachments alter column transaction_id drop not null,
 add column transfer_id uuid,
 add constraint proof_one_parent check((transaction_id is null)<>(transfer_id is null)),
 add constraint proof_transfer_parent foreign key(user_id,transfer_id) references budget_tracker.payment_transfers(user_id,id) on delete cascade;
create index transfer_attachments_parent on budget_tracker.transaction_attachments(user_id,transfer_id,created_at) where transfer_id is not null;
create or replace function budget_tracker.proof_upload_allowed(p_path text) returns boolean language sql security definer set search_path='' as $$
 select budget_tracker.account_is_active() and exists(select from budget_tracker.transaction_attachments a
 where a.user_id=auth.uid() and a.object_path=p_path and a.status='pending'
 and ((a.transaction_id is not null and exists(select from budget_tracker.transactions t where t.user_id=a.user_id and t.id=a.transaction_id))
 or (a.transfer_id is not null and exists(select from budget_tracker.payment_transfers f where f.user_id=a.user_id and f.id=a.transfer_id)))
 and exists(select from budget_tracker.account_scan_leases l where l.id=a.id and l.owner_id=a.user_id and l.expires_at>now()))
$$;
create function budget_tracker.reserve_transfer_attachment(p_transfer uuid,p_file jsonb) returns budget_tracker.transaction_attachments language plpgsql security definer set search_path='' as $$
declare saved budget_tracker.transaction_attachments;v_id uuid:=(p_file->>'id')::uuid;v_mime text:=p_file->>'mime';v_name text:=p_file->>'name';v_size integer:=(p_file->>'size')::integer;path text;
begin
 perform budget_tracker.financial_lock();
 if not exists(select from budget_tracker.payment_transfers where user_id=auth.uid() and id=p_transfer) then raise exception 'Transfer unavailable' using errcode='42501';end if;
 if v_id is null or v_mime is null or v_mime not in ('image/webp','application/pdf') or v_name is null or length(v_name) not between 1 and 160 or v_size is null or v_size not between 1 and 10485760 then raise exception 'Invalid proof file' using errcode='22023';end if;
 path:=auth.uid()::text||'/transfers/'||p_transfer::text||'/'||v_id::text||case when v_mime='application/pdf' then '.pdf' else '.webp' end;
 select * into saved from budget_tracker.transaction_attachments where id=v_id;
 if saved.id is not null then
  if saved.user_id<>auth.uid() or saved.transfer_id is distinct from p_transfer or saved.transaction_id is not null or saved.file_name<>v_name or saved.mime_type<>v_mime or saved.size_bytes<>v_size or saved.object_path<>path then raise exception 'Attachment retry conflicts' using errcode='23505';end if;
 else
  if exists(select from budget_tracker.account_scan_leases where id=v_id) then raise exception 'Choose the file again' using errcode='22023';end if;
  if exists(select from budget_tracker.attachment_cleanup_jobs where object_path=path) then raise exception 'Attachment draft expired. Select the file again.' using errcode='BA003';end if;
  if(select count(*) from budget_tracker.transaction_attachments where user_id=auth.uid() and transfer_id=p_transfer)>=3 then raise exception 'Up to 3 proof files per transfer' using errcode='22023';end if;
  insert into budget_tracker.transaction_attachments(id,user_id,transfer_id,file_name,mime_type,size_bytes,object_path) values(v_id,auth.uid(),p_transfer,v_name,v_mime,v_size,path) returning * into saved;
 end if;
 if saved.status='pending' then insert into budget_tracker.account_scan_leases(id,owner_id,expires_at) values(v_id,auth.uid(),now()+interval '10 minutes') on conflict(id) do update set expires_at=excluded.expires_at where account_scan_leases.owner_id=auth.uid();end if;
 return saved;
end $$;
revoke all on function budget_tracker.reserve_transfer_attachment(uuid,jsonb) from public,anon;
grant execute on function budget_tracker.reserve_transfer_attachment(uuid,jsonb) to authenticated;
-- SQL NULL comparison must not admit a transfer attachment through the old endpoint.
do $$declare d text;begin
 select pg_get_functiondef('budget_tracker.reserve_transaction_attachment(uuid,jsonb)'::regprocedure) into d;
 execute replace(d,'saved.transaction_id<>p_transaction','saved.transaction_id is distinct from p_transaction');
 select pg_get_functiondef('budget_tracker.payment_method_snapshot()'::regprocedure) into d;
 d:=replace(d,'fee_amount::text,fee_mode,transfer_date,note from budget_tracker.payment_transfers','fee_amount::text,fee_mode,transfer_date,note,created_at,created_at_inferred,version from budget_tracker.payment_transfers');
 execute replace(d,'''transferFeeVersion'',1','''transferFeeVersion'',1,''transferEntryVersion'',1');
 select pg_get_functiondef('budget_tracker.complete_financial_reset(uuid,uuid)'::regprocedure) into d;
 execute replace(d,'delete from budget_tracker.payment_transfers where user_id=job.owner_id;', 'delete from budget_tracker.payment_transfers where user_id=job.owner_id; delete from budget_tracker.payment_transfer_requests where user_id=job.owner_id; delete from budget_tracker.financial_activity_ids where user_id=job.owner_id;');
end $$;

-- History-only union. Aggregate/report accounting views deliberately stay unchanged.
create function budget_tracker.activity_records(p_month date)
returns table(row_data jsonb,financial_date date,sort_at timestamptz,row_kind text,activity_id uuid,search_text text)
language sql stable security invoker set search_path='' as $$
 select to_jsonb(t)||jsonb_build_object('row_kind',case when t.type::text='refund' then 'refund' else 'transaction' end,'amount',t.amount::text,'financial_date',coalesce(t.transaction_date,(t.occurred_at at time zone p.timezone)::date),'category',coalesce(c.name,''),'payment_account',coalesce(m.name,'Cash'),'payment_type',coalesce(m.payment_type,'Cash'),'last_four',m.last_four,'income_source',coalesce(s.name,'')),
 coalesce(t.transaction_date,(t.occurred_at at time zone p.timezone)::date),t.occurred_at,case when t.type::text='refund' then 'refund' else 'transaction' end,t.id,
 lower(coalesce(c.name,'')||' '||coalesce(t.note,'')||' '||t.type::text||' '||trim_scale(t.amount)::text)
 from budget_tracker.financial_activity t join budget_tracker.profiles p on p.user_id=t.user_id
 left join budget_tracker.categories c on c.user_id=t.user_id and c.id=t.category_id
 left join budget_tracker.payment_methods m on m.user_id=t.user_id and m.id=t.payment_method_id
 left join budget_tracker.income_sources s on s.user_id=t.user_id and s.id=t.income_source_id
 where t.user_id=auth.uid() and ((t.transaction_date>=p_month and t.transaction_date<(p_month+interval '1 month')::date) or (t.transaction_date is null and t.occurred_at>=p_month::timestamp at time zone p.timezone and t.occurred_at<(p_month+interval '1 month')::timestamp at time zone p.timezone))
 union all
 select to_jsonb(f)||jsonb_build_object('row_kind','transfer','type','transfer','amount',f.amount::text,'fee_amount',f.fee_amount::text,'financial_date',f.transfer_date,'occurred_at',f.created_at,'source_name',s.name,'destination_name',d.name,'source_label',s.name||' · '||s.payment_type||coalesce(' · ****'||s.last_four,''),'destination_label',d.name||' · '||d.payment_type||coalesce(' · ****'||d.last_four,'')),f.transfer_date,f.created_at,'transfer',f.id,
 lower('transfer '||s.name||' '||s.payment_type||' '||d.name||' '||d.payment_type||' '||coalesce(f.note,'')||' '||trim_scale(f.amount)::text)
 from budget_tracker.payment_transfers f join budget_tracker.payment_methods s on s.user_id=f.user_id and s.id=f.source_id join budget_tracker.payment_methods d on d.user_id=f.user_id and d.id=f.destination_id
 where f.user_id=auth.uid() and f.transfer_date>=p_month and f.transfer_date<(p_month+interval '1 month')::date
$$;
revoke all on function budget_tracker.activity_records(date) from public,anon;
grant execute on function budget_tracker.activity_records(date) to authenticated;
create function budget_tracker.activity_history_page(p_month date,p_type text default 'all',p_search text default '',p_before_date date default null,p_before_at timestamptz default null,p_before_kind text default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare zone text;rows jsonb;more boolean;last_row jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 if zone is null or p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date or p_month not between date '0001-01-01' and date '9999-12-01' or p_type is null or p_type not in ('all','income','expense','refund','transfer') or length(coalesce(p_search,''))>500
 or num_nonnulls(p_before_date,p_before_at,p_before_kind,p_before_id) not in (0,4) then raise exception 'Invalid history request' using errcode='22023';end if;
 if p_before_date is not null and (not isfinite(p_before_date) or not isfinite(p_before_at) or p_before_date<p_month or p_before_date>=(p_month+interval '1 month')::date or p_before_kind not in ('transaction','refund','transfer')) then raise exception 'Invalid history cursor' using errcode='22023';end if;
 with numbered as(select *,row_number() over(order by financial_date desc,sort_at desc,row_kind desc,activity_id desc) n from
 (select * from budget_tracker.activity_records(p_month) a where (p_type='all' or row_data->>'type'=p_type or (p_type='expense' and row_kind='refund')) and strpos(search_text,lower(btrim(coalesce(p_search,''))))>0
 and (p_before_date is null or (financial_date,sort_at,row_kind,activity_id)<(p_before_date,p_before_at,p_before_kind,p_before_id)) order by financial_date desc,sort_at desc,row_kind desc,activity_id desc limit 11) a)
 select coalesce(jsonb_agg(row_data order by n) filter(where n<=10),'[]'),count(*)>10 into rows,more from numbered;
 last_row:=rows->(jsonb_array_length(rows)-1);
 return jsonb_build_object('owner',auth.uid(),'month',p_month,'timezone',zone,'rows',rows,'has_more',more,'next',case when more then jsonb_build_object('date',last_row->>'financial_date','at',last_row->>'occurred_at','kind',last_row->>'row_kind','id',last_row->>'id') else null end);
end $$;
revoke all on function budget_tracker.activity_history_page(date,text,text,date,timestamptz,text,uuid) from public,anon;
grant execute on function budget_tracker.activity_history_page(date,text,text,date,timestamptz,text,uuid) to authenticated;
create function budget_tracker.activity_export_snapshot(p_month date,p_type text default 'all',p_search text default '') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare zone text;unit text;rows jsonb;
begin
 perform budget_tracker.activity_history_page(p_month,p_type,p_search); -- shared request validation
 select timezone,currency into zone,unit from budget_tracker.profiles where user_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('row_kind',a.row_kind,'transaction_id',a.activity_id,'financial_date',a.financial_date,'type',r->>'type','amount',budget_tracker.report_cents((r->>'amount')::numeric),'currency',unit,
 'category',coalesce(r->>'category',''),'payment_account_id',r->'payment_method_id','payment_account',coalesce(r->>'payment_account',''),'payment_type',coalesce(r->>'payment_type',''),'last_four',r->'last_four','income_source',coalesce(r->>'income_source',''),'note',r->'note','refund_of',r->'refund_of','transfer_id',case when a.row_kind='transfer' then to_jsonb(a.activity_id) else r->'transfer_id' end,
 'source_account_id',r->'source_id','destination_account_id',r->'destination_id','source_account',coalesce(r->>'source_label',''),'destination_account',coalesce(r->>'destination_label',''),'fee_amount',budget_tracker.report_cents(coalesce((r->>'fee_amount')::numeric,0)),
 'income_effect',budget_tracker.report_cents(case when r->>'type'='income' then (r->>'amount')::numeric else 0 end),'spending_effect',budget_tracker.report_cents(case when r->>'type'='expense' then (r->>'amount')::numeric when r->>'type'='refund' then -(r->>'amount')::numeric else 0 end)) order by a.financial_date desc,a.sort_at desc,a.row_kind desc,a.activity_id desc),'[]') into rows
 from budget_tracker.activity_records(p_month) a cross join lateral(select a.row_data r) x where (p_type='all' or r->>'type'=p_type or (p_type='expense' and a.row_kind='refund')) and strpos(a.search_text,lower(btrim(coalesce(p_search,''))))>0;
 return jsonb_build_object('owner',auth.uid(),'start',p_month,'end',p_month,'timezone',zone,'currency',unit,'generated_at',clock_timestamp(),'rows',rows,'activityVersion',1,'filter',p_type,'search',lower(btrim(coalesce(p_search,''))));
end $$;
revoke all on function budget_tracker.activity_export_snapshot(date,text,text) from public,anon;
grant execute on function budget_tracker.activity_export_snapshot(date,text,text) to authenticated;
notify pgrst,'reload schema';

create table budget_tracker.refunds (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 expense_id uuid not null,method_id uuid not null,amount numeric(12,2) not null check(amount>0 and amount<=9999999999.99 and amount<>'NaN'::numeric),
 refund_date date not null check(isfinite(refund_date)),note text check(char_length(note)<=500),
 assigned_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),version integer not null default 1,
 unique(user_id,id),foreign key(user_id,expense_id) references budget_tracker.transactions(user_id,id) on delete cascade,
 foreign key(user_id,method_id) references budget_tracker.payment_methods(user_id,id)
);
create index refunds_parent on budget_tracker.refunds(user_id,expense_id);
create index refunds_history on budget_tracker.refunds(user_id,refund_date desc,created_at desc,id desc);
create index refunds_method on budget_tracker.refunds(user_id,method_id,refund_date);
alter table budget_tracker.refunds enable row level security;
create policy refunds_read on budget_tracker.refunds for select to authenticated using(user_id=auth.uid());
revoke all on budget_tracker.refunds from public,anon,authenticated;
grant select on budget_tracker.refunds to authenticated;
create table budget_tracker.refund_requests (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,expense_id uuid not null,payload jsonb not null,
 foreign key(user_id,expense_id) references budget_tracker.transactions(user_id,id) on delete cascade
);
alter table budget_tracker.refund_requests enable row level security;
revoke all on budget_tracker.refund_requests from public,anon,authenticated;

create function budget_tracker.guard_financial_activity_id() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,371));
 if (auth.uid() is not null and auth.uid()<>new.user_id) or not budget_tracker.account_is_active(new.user_id) then raise exception 'Financial activity unavailable' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text||':'||new.id::text,784));
 if (tg_table_name='refunds' and exists(select from budget_tracker.transactions where user_id=new.user_id and id=new.id))
  or (tg_table_name='transactions' and exists(select from budget_tracker.refunds where user_id=new.user_id and id=new.id)) then
  raise exception 'This financial record ID is already used. Start a fresh entry' using errcode='23505';
 end if;
 return new;
end $$;
revoke all on function budget_tracker.guard_financial_activity_id() from public,anon,authenticated;
create trigger financial_activity_id before insert on budget_tracker.refunds for each row execute function budget_tracker.guard_financial_activity_id();
create trigger financial_activity_id before insert on budget_tracker.transactions for each row execute function budget_tracker.guard_financial_activity_id();

create function budget_tracker.refund_snapshot(p_expense uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e budget_tracker.transactions;result jsonb;
begin
 select * into e from budget_tracker.transactions where id=p_expense and user_id=auth.uid();
 if e.id is null or e.type<>'expense' or e.transfer_id is not null then raise exception 'Expense unavailable for refunds' using errcode='42501';end if;
 select jsonb_build_object('owner',auth.uid(),'expenseId',e.id,'expenseCreatedAt',e.created_at,'amount',e.amount::text,
  'refunded',coalesce(sum(r.amount),0)::text,'rows',coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('amount',r.amount::text) order by r.refund_date desc,r.created_at desc,r.id desc),'[]')) into result
 from budget_tracker.refunds r where r.user_id=auth.uid() and r.expense_id=e.id;
 return result;
end $$;
revoke all on function budget_tracker.refund_snapshot(uuid) from public,anon;
grant execute on function budget_tracker.refund_snapshot(uuid) to authenticated;

create function budget_tracker.save_refund(p_refund jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();rid uuid;eid uuid;mid uuid;operation text;value numeric;day date;zone text;label text;
 e budget_tracker.transactions;existing budget_tracker.refunds;saved budget_tracker.refunds;receipt budget_tracker.refund_requests;
 total numeric;expected integer;payload jsonb;
begin
 if owner_id is null then raise exception 'Sign in again' using errcode='42501';end if;
 perform budget_tracker.financial_lock();rid:=(p_refund->>'id')::uuid;eid:=(p_refund->>'expenseId')::uuid;operation:=p_refund->>'operation';
 if rid is null or eid is null or operation is null or operation not in('create','update','delete') then raise exception 'Invalid refund request' using errcode='22023';end if;
 select * into e from budget_tracker.transactions where id=eid and user_id=owner_id for update;
 if e.id is null or e.type<>'expense' or e.transfer_id is not null then raise exception 'Expense unavailable for refunds' using errcode='42501';end if;
 if (p_refund->>'expenseCreatedAt')::timestamptz is distinct from e.created_at then raise exception 'The original expense changed. Reopen it before refunding' using errcode='40001';end if;
 select * into existing from budget_tracker.refunds where id=rid for update;
 if existing.id is not null and (existing.user_id<>owner_id or existing.expense_id<>eid) then raise exception 'Refund unavailable' using errcode='42501';end if;
 if operation='delete' then
  if existing.id is not null then
   if (p_refund->>'expectedVersion')::integer is distinct from existing.version then raise exception 'Refund changed. Refresh before removing it' using errcode='40001';end if;
   delete from budget_tracker.refunds where id=rid;
  end if;
  return jsonb_build_object('owner',owner_id,'expenseId',eid,'id',rid,'state','deleted');
 end if;
 if jsonb_typeof(p_refund->'amount') is distinct from 'string' or coalesce(p_refund->>'amount','') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' then raise exception 'Enter a positive refund amount' using errcode='22023';end if;
 value:=(p_refund->>'amount')::numeric;mid:=(p_refund->>'methodId')::uuid;day:=(p_refund->>'date')::date;label:=nullif(btrim(p_refund->>'note'),'');
 select timezone into zone from budget_tracker.profiles where user_id=owner_id;
 if value<=0 or value>9999999999.99 or mid is null or day is null or not isfinite(day) or char_length(label)>500 then raise exception 'Use a positive amount, a received date and a note up to 500 characters' using errcode='22023';end if;
 payload:=jsonb_build_object('expenseId',eid,'methodId',mid,'amount',value::text,'date',day,'note',label);
 if operation='create' then
  select * into receipt from budget_tracker.refund_requests where id=rid;
  if receipt.id is not null then
   if receipt.user_id<>owner_id or receipt.expense_id<>eid then raise exception 'Refund unavailable' using errcode='42501';end if;
   if receipt.payload<>payload or existing.id is null then raise exception 'Refund retry conflicts. Refresh before continuing' using errcode='23505';end if;
   return jsonb_build_object('owner',owner_id,'expenseId',eid,'id',rid,'state','saved','refund',to_jsonb(existing)||jsonb_build_object('amount',existing.amount::text));
  end if;
 elsif existing.id is null then raise exception 'Refund unavailable' using errcode='42501';
 else
  expected:=(p_refund->>'expectedVersion')::integer;
  if expected is distinct from existing.version then
   if expected+1=existing.version and existing.amount=value and existing.method_id=mid and existing.refund_date=day and existing.note is not distinct from label then
    return jsonb_build_object('owner',owner_id,'expenseId',eid,'id',rid,'state','saved','refund',to_jsonb(existing)||jsonb_build_object('amount',existing.amount::text));
   end if;
   raise exception 'Refund changed. Refresh before editing' using errcode='40001';
  end if;
 end if;
 if (existing.id is null or day<>existing.refund_date) and (day>(now() at time zone zone)::date or day<coalesce(e.transaction_date,(e.occurred_at at time zone zone)::date)) then raise exception 'Use a received date on or after the purchase, no later than today' using errcode='22023';end if;
 if not exists(select from budget_tracker.payment_methods where id=mid and user_id=owner_id and (not archived or (existing.id is not null and existing.method_id=mid))) then raise exception 'Choose an active payment method' using errcode='22023';end if;
 select coalesce(sum(amount),0) into total from budget_tracker.refunds where user_id=owner_id and expense_id=eid and id<>rid;
 if total+value>e.amount then raise exception 'Refund exceeds the remaining purchase amount' using errcode='22023';end if;
 if operation='create' then
  insert into budget_tracker.refund_requests values(rid,owner_id,eid,payload);
  insert into budget_tracker.refunds(id,user_id,expense_id,method_id,amount,refund_date,note) values(rid,owner_id,eid,mid,value,day,label) returning * into saved;
 else
  update budget_tracker.refunds set amount=value,refund_date=day,note=label,method_id=mid,
   assigned_at=case when method_id=mid then assigned_at else clock_timestamp() end,version=version+1 where id=rid returning * into saved;
 end if;
 return jsonb_build_object('owner',owner_id,'expenseId',eid,'id',rid,'state','saved','refund',to_jsonb(saved)||jsonb_build_object('amount',saved.amount::text));
end $$;
revoke all on function budget_tracker.save_refund(jsonb) from public,anon;
grant execute on function budget_tracker.save_refund(jsonb) to authenticated;

create function budget_tracker.check_refund_total() returns trigger
language plpgsql security definer set search_path='' as $$
declare e budget_tracker.transactions;owner_id uuid:=coalesce(new.user_id,old.user_id);eid uuid:=coalesce(new.expense_id,old.expense_id);total numeric;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,371));
 select * into e from budget_tracker.transactions where user_id=owner_id and id=eid for update;
 if e.id is null then return coalesce(new,old);end if;
 select coalesce(sum(amount),0) into total from budget_tracker.refunds where user_id=owner_id and expense_id=eid;
 if total>e.amount or (total>0 and (e.type<>'expense' or e.transfer_id is not null)) then raise exception 'Linked refunds exceed an eligible expense' using errcode='23514';end if;
 return coalesce(new,old);
end $$;
revoke all on function budget_tracker.check_refund_total() from public,anon,authenticated;
create constraint trigger refund_total_consistency after insert or update or delete on budget_tracker.refunds
deferrable initially deferred for each row execute function budget_tracker.check_refund_total();

create function budget_tracker.guard_refunded_expense() returns trigger
language plpgsql security definer set search_path='' as $$
declare total numeric;
begin
 select coalesce(sum(amount),0) into total from budget_tracker.refunds where user_id=old.user_id and expense_id=old.id;
 if total=0 then return coalesce(new,old);end if;
 if tg_op='DELETE' then
  if exists(select from auth.users where id=old.user_id) and budget_tracker.account_is_active(old.user_id) then raise exception 'Remove the linked refunds before deleting this expense' using errcode='22023';end if;
  return old;
 end if;
 if new.type<>'expense' or new.amount<total or new.transfer_id is not null or new.user_id<>old.user_id then raise exception 'This change conflicts with linked refunds. Keep an expense amount at least equal to the refunded total' using errcode='22023';end if;
 if new.transaction_date is not null and exists(select from budget_tracker.refunds r where r.user_id=old.user_id and r.expense_id=old.id and r.refund_date<new.transaction_date) then raise exception 'The purchase date cannot follow a linked refund date' using errcode='22023';end if;
 return new;
end $$;
revoke all on function budget_tracker.guard_refunded_expense() from public,anon,authenticated;
create trigger guard_refunded_expense before update or delete on budget_tracker.transactions for each row execute function budget_tracker.guard_refunded_expense();

-- Complete activity rows use a distinct Refund label; original receipts/items are untouched.
do $$declare activity text;entries text;begin
 select string_agg(case a.attname
  when 'id' then 'r.id' when 'user_id' then 'r.user_id' when 'amount' then 'r.amount'
  when 'type' then '''refund''::text' when 'category_id' then 'p.category_id'
  when 'payment_method_id' then 'r.method_id' when 'payment_assigned_at' then 'r.assigned_at'
  when 'transaction_date' then 'r.refund_date' when 'occurred_at' then 'r.created_at'
  when 'created_at' then 'r.created_at' when 'note' then 'r.note' when 'spending_source' then 'p.spending_source'
  when 'occurrence_id' then 'p.occurrence_id' when 'recurring_rule_id' then 'p.recurring_rule_id'
  else 'null::'||pg_catalog.format_type(a.atttypid,a.atttypmod) end,',' order by a.attnum),
  string_agg(case a.attname when 'type' then 'case when a.type=''refund'' then ''expense'' else a.type end as type'
   when 'amount' then 'case when a.type=''refund'' then -a.amount else a.amount end as amount'
   else 'a.'||quote_ident(a.attname) end,',' order by a.attnum)
 into activity,entries from pg_catalog.pg_attribute a where a.attrelid='budget_tracker.transactions'::regclass and a.attnum>0 and not a.attisdropped;
 -- Direct column projections allow owner/date/cursor predicates to use the ledger indexes.
 execute 'create view budget_tracker.financial_activity with(security_invoker=true) as select t.*,null::uuid refund_of from budget_tracker.transactions t union all select '||activity||',r.expense_id refund_of from budget_tracker.refunds r join budget_tracker.transactions p on p.id=r.expense_id and p.user_id=r.user_id';
 execute 'create view budget_tracker.financial_entries with(security_invoker=true) as select '||entries||',a.refund_of from budget_tracker.financial_activity a';
end $$;
revoke all on budget_tracker.financial_activity,budget_tracker.financial_entries from public,anon,authenticated;
grant select on budget_tracker.financial_activity,budget_tracker.financial_entries to authenticated;

-- Preserve current owner/timezone/preparation/export logic; swap only its financial read source.
do $$
declare name text;definition text;updated text;
begin
 foreach name in array array['dashboard_snapshot(date)','monthly_expense_totals(date,date)','reporting_snapshot(date)','report_export_snapshot(date,date)','phone_notification_snapshot()'] loop
  definition:=pg_get_functiondef(('budget_tracker.'||name)::regprocedure);
  updated:=replace(definition,'budget_tracker.transactions','budget_tracker.financial_entries');
  if name<>'phone_notification_snapshot()' and updated=definition then raise exception 'Refund aggregate patch missing: %',name;end if;
  if name in ('reporting_snapshot(date)','report_export_snapshot(date,date)') then updated:=replace(updated,'''owner'',owner_id,','''owner'',owner_id,''refundVersion'',1,');end if;
  if name='dashboard_snapshot(date)' then updated:=replace(updated,'spending_source=''recurring'' and occurrence_id is null)','spending_source=''recurring'' and occurrence_id is null and refund_of is null)');end if;
  execute updated;
 end loop;
 foreach name in array array['report_transaction_history(date)','transaction_export_snapshot(date)','transaction_history_page(date,text,text,date,timestamptz,uuid)'] loop
  definition:=pg_get_functiondef(('budget_tracker.'||name)::regprocedure);
  updated:=replace(definition,'budget_tracker.transactions','budget_tracker.financial_activity');
  if updated=definition then raise exception 'Refund activity patch missing: %',name;end if;
  if name='transaction_export_snapshot(date)' then
   updated:=replace(updated,'''type'',t.type,','''refund_of'',t.refund_of,''type'',t.type,');
   updated:=replace(updated,'when t.type=''expense'' then','when t.type in (''expense'',''refund'') then');
  elsif name like 'transaction_history_page%' then
   updated:=replace(updated,'''all'',''income'',''expense''','''all'',''income'',''expense'',''refund''');
   updated:=replace(updated,'p_type=''all'' or t.type::text=p_type','p_type=''all'' or t.type::text=p_type or (p_type=''expense'' and t.type=''refund'')');
  end if;
  execute updated;
 end loop;
 definition:=pg_get_functiondef('budget_tracker.method_balance(uuid)'::regprocedure);
 updated:=replace(definition,'c.created_at>=m.baseline_at),0) end',
  'c.created_at>=m.baseline_at),0) +coalesce((select sum(r.amount) from budget_tracker.refunds r where r.user_id=m.user_id and r.method_id=m.id and r.refund_date<=(now() at time zone p.timezone)::date and (r.assigned_at>=m.baseline_at or r.refund_date>(m.baseline_at at time zone p.timezone)::date)),0) end');
 if updated=definition then raise exception 'Refund balance patch missing';end if;
 execute updated;
 definition:=pg_get_functiondef('budget_tracker.payment_method_snapshot()'::regprocedure);
 updated:=replace(definition,'''owner'',auth.uid(),','''owner'',auth.uid(),''refundVersion'',1,');
 if updated=definition then raise exception 'Refund capability patch missing';end if;
 updated:=replace(updated,') has_activity,', ' or exists(select from budget_tracker.refunds r where r.user_id=m.user_id and r.method_id=m.id)) has_activity,');
 execute updated;
 definition:=pg_get_functiondef('budget_tracker.save_payment_method(jsonb)'::regprocedure);
 updated:=replace(definition,'c.method_id=existing.id)) and coalesce','c.method_id=existing.id) or exists(select from budget_tracker.refunds r where r.user_id=owner_id and r.method_id=existing.id)) and coalesce');
 if updated=definition then raise exception 'Refund opening-balance confirmation patch missing';end if;
 execute updated;
end $$;
notify pgrst,'reload schema';

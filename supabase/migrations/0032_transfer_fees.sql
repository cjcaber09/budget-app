-- Transfer principal remains balanced money received. The fee is one linked expense.
alter table budget_tracker.payment_transfers
 add column fee_amount numeric(12,2) not null default 0 check(fee_amount>=0 and fee_amount::text not in ('NaN','Infinity','-Infinity')),
 add column fee_mode text not null default 'added' check(fee_mode in ('added','deducted')),
 add constraint transfer_total_range check(amount+fee_amount<=9999999999.99),
 add constraint transfers_owner_id unique(user_id,id);
alter table budget_tracker.transactions add column transfer_id uuid,
 add constraint transaction_transfer_owner foreign key(user_id,transfer_id) references budget_tracker.payment_transfers(user_id,id) on delete cascade;
create unique index transfer_fee_one_expense on budget_tracker.transactions(user_id,transfer_id) where transfer_id is not null;

-- An RPC-only capability. It is never exposed, persists only within its writer,
-- and cannot be forged using client-settable GUCs or a SECURITY DEFINER delete RPC.
create table budget_tracker.transfer_fee_writes(
 tx_id bigint not null, transfer_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
 primary key(tx_id,transfer_id)
);
alter table budget_tracker.transfer_fee_writes enable row level security;
revoke all on budget_tracker.transfer_fee_writes from public,anon,authenticated;

create function budget_tracker.guard_transfer_fee_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous_id uuid;next_id uuid;owner_id uuid;assigned timestamptz;
begin
 if tg_op<>'INSERT' then previous_id:=old.transfer_id;owner_id:=old.user_id;end if;
 if tg_op<>'DELETE' then next_id:=new.transfer_id;owner_id:=new.user_id;end if;
 if previous_id is null and next_id is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 -- Explicit service cleanup and Auth cascades retain their existing behavior.
 if tg_op='DELETE' and (auth.role()='service_role' or not exists(select from auth.users where id=owner_id)) then return old;end if;
 if (previous_id is not null and not exists(select from budget_tracker.transfer_fee_writes w where w.tx_id=txid_current() and w.transfer_id=previous_id and w.owner_id=old.user_id))
 or (next_id is not null and not exists(select from budget_tracker.transfer_fee_writes w where w.tx_id=txid_current() and w.transfer_id=next_id and w.owner_id=new.user_id)) then
  raise exception 'Edit or delete this fee through its transfer.' using errcode='TF001';
 end if;
 if tg_op='DELETE' then return old;end if;
 if next_id is not null then
  select source_assigned_at into assigned from budget_tracker.payment_transfers where id=next_id and user_id=new.user_id;
  new.payment_assigned_at:=assigned;
 end if;
 return new;
end $$;
revoke all on function budget_tracker.guard_transfer_fee_write() from public,anon,authenticated;
-- Run after the ordinary assignment trigger, preserving the source's baseline semantics.
create trigger zy_transfer_fee_write_guard before insert or update or delete on budget_tracker.transactions
 for each row execute function budget_tracker.guard_transfer_fee_write();

create function budget_tracker.guard_transfer_fee_items() returns trigger
language plpgsql security definer set search_path='' as $$
declare parent_id uuid;owner_id uuid;transfer_id uuid;
begin
 if tg_op='DELETE' then parent_id:=old.transaction_id;owner_id:=old.user_id;else parent_id:=new.transaction_id;owner_id:=new.user_id;end if;
 select t.transfer_id into transfer_id from budget_tracker.transactions t where t.id=parent_id and t.user_id=owner_id;
 if transfer_id is not null then raise exception 'Edit this fee through its transfer.' using errcode='TF001';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function budget_tracker.guard_transfer_fee_items() from public,anon,authenticated;
create trigger transfer_fee_items_guard before insert or update or delete on budget_tracker.transaction_items
 for each row execute function budget_tracker.guard_transfer_fee_items();

create function budget_tracker.check_transfer_fee(p_id uuid,p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f budget_tracker.payment_transfers;t budget_tracker.transactions;n integer;
begin
 select * into f from budget_tracker.payment_transfers where id=p_id and user_id=p_owner;
 select count(*) into n from budget_tracker.transactions where transfer_id=p_id and user_id=p_owner;
 if f.id is null then if n<>0 then raise exception 'Orphan transfer fee' using errcode='23514';end if;return;end if;
 if f.fee_amount=0 then if n<>0 then raise exception 'Unexpected transfer fee expense' using errcode='23514';end if;return;end if;
 select * into t from budget_tracker.transactions where transfer_id=p_id and user_id=p_owner;
 if n<>1 or t.type<>'expense' or t.amount<>f.fee_amount or t.payment_method_id is distinct from f.source_id
 or t.transaction_date is distinct from f.transfer_date or t.payment_assigned_at is distinct from f.source_assigned_at
 or t.category_id is null or t.occurrence_id is not null or t.recurring_rule_id is not null or t.income_source_id is not null
 or exists(select from budget_tracker.transaction_items where transaction_id=t.id) then
  raise exception 'Transfer and fee expense do not reconcile' using errcode='23514';
 end if;
end $$;
revoke all on function budget_tracker.check_transfer_fee(uuid,uuid) from public,anon,authenticated;
create function budget_tracker.enforce_transfer_fee() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='payment_transfers' then
  if tg_op<>'INSERT' then perform budget_tracker.check_transfer_fee(old.id,old.user_id);end if;
  if tg_op<>'DELETE' then perform budget_tracker.check_transfer_fee(new.id,new.user_id);end if;
 else
  if tg_op<>'INSERT' and old.transfer_id is not null then perform budget_tracker.check_transfer_fee(old.transfer_id,old.user_id);end if;
  if tg_op<>'DELETE' and new.transfer_id is not null then perform budget_tracker.check_transfer_fee(new.transfer_id,new.user_id);end if;
 end if;
 return null;
end $$;
revoke all on function budget_tracker.enforce_transfer_fee() from public,anon,authenticated;
create constraint trigger transfer_fee_consistency after insert or update or delete on budget_tracker.payment_transfers
 deferrable initially deferred for each row execute function budget_tracker.enforce_transfer_fee();
create constraint trigger transfer_fee_expense_consistency after insert or update or delete on budget_tracker.transactions
 deferrable initially deferred for each row execute function budget_tracker.enforce_transfer_fee();

create or replace function budget_tracker.guard_transfer_funds() returns trigger
language plpgsql security definer set search_path='' as $$
declare m budget_tracker.payment_methods;zone text;today date;old_effect numeric:=0;required numeric;available numeric;
begin
 if auth.uid() is null then return new;end if;
 perform budget_tracker.financial_lock();
 if new.user_id<>auth.uid() then raise exception 'Transfer unavailable' using errcode='42501';end if;
 if tg_op='UPDATE' and new.amount=old.amount and new.fee_amount=old.fee_amount and new.source_id=old.source_id
 and new.destination_id=old.destination_id and new.transfer_date=old.transfer_date then return new;end if;
 select * into m from budget_tracker.payment_methods where id=new.source_id and user_id=auth.uid() for share;
 if m.method='card' and m.payment_type='Credit card' then return new;end if;
 if m.id is null or m.baseline_at is null then raise exception 'Set an initial balance before transferring.' using errcode='BT002';end if;
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();today:=(now() at time zone zone)::date;
 if tg_op='UPDATE' and old.transfer_date<=today then
  if old.source_id=m.id and (old.source_assigned_at>=m.baseline_at or old.transfer_date>(m.baseline_at at time zone zone)::date) then old_effect:=old_effect-old.amount-old.fee_amount;end if;
  if old.destination_id=m.id and (old.destination_assigned_at>=m.baseline_at or old.transfer_date>(m.baseline_at at time zone zone)::date) then old_effect:=old_effect+old.amount;end if;
 end if;
 required:=new.amount+new.fee_amount+old_effect;if required<=0 then return new;end if;
 available:=budget_tracker.method_balance(m.id);
 if available is null or required>available then raise exception 'Insufficient balance for the transfer and fee.' using errcode='BT001';end if;
 return new;
end $$;
revoke all on function budget_tracker.guard_transfer_funds() from public,anon,authenticated;

create or replace function budget_tracker.save_payment_transfer(p_transfer jsonb) returns budget_tracker.payment_transfers
language plpgsql security definer set search_path='' as $$
declare f budget_tracker.payment_transfers;old_f budget_tracker.payment_transfers;src budget_tracker.payment_methods;dst budget_tracker.payment_methods;
 owner_id uuid:=auth.uid();v_id uuid;operation text;amount_value numeric;fee numeric;mode text;day date;label text;category uuid;fee_id uuid;zone text;
begin
 perform budget_tracker.ensure_cash_method();v_id:=(p_transfer->>'id')::uuid;operation:=p_transfer->>'operation';
 if v_id is null then raise exception 'Transfer identifier required' using errcode='22023';end if;
 select * into old_f from budget_tracker.payment_transfers where id=v_id and user_id=owner_id for update;
 if exists(select from budget_tracker.payment_transfers where id=v_id and user_id<>owner_id) then raise exception 'Transfer unavailable' using errcode='42501';end if;
 if p_transfer ? 'payload_version' and (jsonb_typeof(p_transfer->'payload_version')<>'number' or p_transfer->>'payload_version'<>'2') then raise exception 'Unsupported transfer version' using errcode='22023';end if;
 if operation='delete' then
  if old_f.id is null then return null;end if;
  insert into budget_tracker.transfer_fee_writes values(txid_current(),v_id,owner_id);
  delete from budget_tracker.payment_transfers where id=v_id and user_id=owner_id;
  delete from budget_tracker.transfer_fee_writes where tx_id=txid_current() and transfer_id=v_id;
  return old_f;
 end if;
 if operation is null or operation not in ('create','update') or jsonb_typeof(p_transfer->'amount') is distinct from 'string'
 or coalesce(p_transfer->>'amount','') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$'
 or coalesce(p_transfer->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid transfer' using errcode='22023';end if;
 amount_value:=(p_transfer->>'amount')::numeric;day:=(p_transfer->>'date')::date;label:=nullif(btrim(p_transfer->>'note'),'');
 fee:=coalesce(old_f.fee_amount,0);mode:=coalesce(old_f.fee_mode,'added');
 if p_transfer ? 'feeAmount' then
  if p_transfer->>'payload_version' is distinct from '2' or jsonb_typeof(p_transfer->'feeAmount') is distinct from 'string'
  or coalesce(p_transfer->>'feeAmount','') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' then raise exception 'Invalid transfer fee' using errcode='22023';end if;
  fee:=(p_transfer->>'feeAmount')::numeric;
 end if;
 if p_transfer ? 'feeMode' then
  if p_transfer->>'payload_version' is distinct from '2' or jsonb_typeof(p_transfer->'feeMode') is distinct from 'string' or p_transfer->>'feeMode' not in ('added','deducted') then raise exception 'Invalid fee mode' using errcode='22023';end if;
  mode:=p_transfer->>'feeMode';
 end if;
 if fee=0 then mode:='added';end if;
 select * into src from budget_tracker.payment_methods where id=(p_transfer->>'sourceId')::uuid and user_id=owner_id for share;
 select * into dst from budget_tracker.payment_methods where id=(p_transfer->>'destinationId')::uuid and user_id=owner_id for share;
 if src.id is null or dst.id is null or src.id=dst.id or amount_value<=0 or amount_value+fee>9999999999.99
 or not isfinite(day) or day not between date '0001-01-01' and date '9999-12-31' then raise exception 'Choose two owned methods and valid amounts and date' using errcode='22023';end if;
 if (src.archived and src.id is distinct from old_f.source_id) or (dst.archived and dst.id is distinct from old_f.destination_id) then raise exception 'Choose active payment methods' using errcode='22023';end if;
 if operation='create' and old_f.id is not null then
  if old_f.source_id=src.id and old_f.destination_id=dst.id and old_f.amount=amount_value and old_f.fee_amount=fee and old_f.fee_mode=mode
  and old_f.transfer_date=day and old_f.note is not distinct from label then return old_f;end if;
  raise exception 'Transfer retry conflicts' using errcode='23505';
 end if;
 if operation='update' and old_f.id is null then raise exception 'Transfer unavailable' using errcode='42501';end if;
 insert into budget_tracker.transfer_fee_writes values(txid_current(),v_id,owner_id);
 if operation='create' then
  insert into budget_tracker.payment_transfers(id,user_id,source_id,destination_id,amount,fee_amount,fee_mode,transfer_date,note,source_assigned_at,destination_assigned_at)
   values(v_id,owner_id,src.id,dst.id,amount_value,fee,mode,day,label,clock_timestamp(),clock_timestamp()) returning * into f;
 else
  update budget_tracker.payment_transfers set source_id=src.id,destination_id=dst.id,amount=amount_value,fee_amount=fee,fee_mode=mode,transfer_date=day,note=label,
   source_assigned_at=case when source_id=src.id then source_assigned_at else clock_timestamp() end,
   destination_assigned_at=case when destination_id=dst.id then destination_assigned_at else clock_timestamp() end
   where id=v_id and user_id=owner_id returning * into f;
 end if;
 if fee=0 then delete from budget_tracker.transactions where transfer_id=v_id and user_id=owner_id;
 else
  select id,category_id into fee_id,category from budget_tracker.transactions where transfer_id=v_id and user_id=owner_id;
  if category is null then
   select id into category from budget_tracker.categories where user_id=owner_id and lower(btrim(name))='fees' order by id limit 1;
   if category is null then insert into budget_tracker.categories(user_id,name,color,icon,is_default)values(owner_id,'Fees','#607D8B','dots-horizontal',false)returning id into category;end if;
  end if;
  select timezone into zone from budget_tracker.profiles where user_id=owner_id;
  if fee_id is null then
   insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,transaction_date,payment_method_id,transfer_id)
    values(gen_random_uuid(),owner_id,'expense',category,fee,'Transfer fee',(day+time '12:00') at time zone zone,day,src.id,v_id);
  else
   update budget_tracker.transactions set amount=fee,transaction_date=day,occurred_at=(day+time '12:00') at time zone zone,payment_method_id=src.id
    where id=fee_id and user_id=owner_id;
  end if;
 end if;
 perform budget_tracker.check_transfer_fee(v_id,owner_id);
 delete from budget_tracker.transfer_fee_writes where tx_id=txid_current() and transfer_id=v_id;
 return f;
end $$;
revoke all on function budget_tracker.save_payment_transfer(jsonb) from public,anon;
grant execute on function budget_tracker.save_payment_transfer(jsonb) to authenticated;

-- A new RPC identity makes stale-capability/older-server requests fail before a
-- legacy implementation can ignore the fee fields and persist principal alone.
create function budget_tracker.save_payment_transfer_with_fee(p_transfer jsonb) returns budget_tracker.payment_transfers
language plpgsql security invoker set search_path='' as $$
begin
 if p_transfer->>'payload_version' is distinct from '2' then raise exception 'Transfer version required' using errcode='22023';end if;
 return budget_tracker.save_payment_transfer(p_transfer);
end $$;
revoke all on function budget_tracker.save_payment_transfer_with_fee(jsonb) from public,anon;
grant execute on function budget_tracker.save_payment_transfer_with_fee(jsonb) to authenticated;

-- Additive snapshot fields. Ordinary decimal transport differs from Reports' cents.
do $$declare definition text;begin
 select pg_get_functiondef('budget_tracker.payment_method_snapshot()'::regprocedure) into definition;
 if strpos(definition,'amount::text,transfer_date,note from budget_tracker.payment_transfers')=0 then raise exception 'Snapshot implementation differs';end if;
 definition:=replace(definition,'amount::text,transfer_date,note from budget_tracker.payment_transfers','amount::text,fee_amount::text,fee_mode,transfer_date,note from budget_tracker.payment_transfers');
 definition:=replace(definition,'''owner'',auth.uid(),''timezone'',zone,''methods'',methods','''owner'',auth.uid(),''timezone'',zone,''transferFeeVersion'',1,''methods'',methods');
 execute definition;
 select pg_get_functiondef('budget_tracker.report_transfer_history(date)'::regprocedure) into definition;
 if strpos(definition,'''amount'',budget_tracker.report_cents(f.amount)')=0 then raise exception 'Transfer history implementation differs';end if;
 execute replace(definition,'''amount'',budget_tracker.report_cents(f.amount)','''amount'',budget_tracker.report_cents(f.amount),''fee_amount'',budget_tracker.report_cents(f.fee_amount),''fee_mode'',f.fee_mode');
end $$;
notify pgrst,'reload schema';

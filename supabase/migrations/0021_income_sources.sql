-- Optional owner-scoped income sources; direct writes and RPCs share guards.
create table budget_tracker.income_sources (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(name=btrim(name) and char_length(name) between 1 and 80),
 creation_name text not null,
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 unique(user_id,id)
);
alter table budget_tracker.income_sources enable row level security;
create policy income_sources_owner on budget_tracker.income_sources for select to authenticated using(user_id=auth.uid());
revoke all on budget_tracker.income_sources from public,anon,authenticated;
grant select on budget_tracker.income_sources to authenticated;
alter table budget_tracker.transactions add column income_source_id uuid;
alter table budget_tracker.transactions add constraint transaction_income_source_owner foreign key(user_id,income_source_id) references budget_tracker.income_sources(user_id,id);
alter table budget_tracker.transactions add constraint expense_has_no_income_source check(type='income' or income_source_id is null);

create function budget_tracker.save_income_source(p_source jsonb) returns budget_tracker.income_sources
language plpgsql security definer set search_path='' as $$
declare s budget_tracker.income_sources; source_id uuid; op text; label text;
begin
 perform budget_tracker.financial_lock();
 if jsonb_typeof(p_source) is distinct from 'object' then raise exception 'Invalid source' using errcode='22023';end if;
 source_id:=(p_source->>'id')::uuid;op:=p_source->>'operation';label:=nullif(btrim(p_source->>'name'),'');
 if source_id is null or op is null or op not in ('create','rename','archive','restore') then raise exception 'Invalid source operation' using errcode='22023';end if;
 if op in ('create','rename') and (jsonb_typeof(p_source->'name') is distinct from 'string' or label is null or char_length(label)>80) then raise exception 'Enter a source name of 1 to 80 characters' using errcode='22023';end if;
 select * into s from budget_tracker.income_sources where id=source_id and user_id=auth.uid() for update;
 if op='create' then
  if s.id is not null then
   if s.creation_name=label then return s;end if;
   raise exception 'Source create retry conflicts' using errcode='23505';
  end if;
  insert into budget_tracker.income_sources(id,user_id,name,creation_name) values(source_id,auth.uid(),label,label) returning * into s;
 else
  if s.id is null then raise exception 'Source unavailable' using errcode='42501';end if;
  update budget_tracker.income_sources set name=case when op='rename' then label else name end,archived=case when op='archive' then true when op='restore' then false else archived end
   where id=source_id and user_id=auth.uid() returning * into s;
 end if;
 return s;
end $$;
revoke all on function budget_tracker.save_income_source(jsonb) from public,anon;
grant execute on function budget_tracker.save_income_source(jsonb) to authenticated;

-- Row locks require UPDATE privilege. Keep table writes private and expose
-- only this owner-checked lock/validation helper to the invoker save RPC.
create function budget_tracker.check_income_source(p_source uuid,p_existing uuid) returns void
language plpgsql security definer set search_path='' as $$
declare archived_source boolean;
begin
 perform budget_tracker.financial_lock();
 select archived into archived_source from budget_tracker.income_sources where id=p_source and user_id=auth.uid() for share;
 if not found then raise exception 'Income source unavailable' using errcode='42501';end if;
 if archived_source and p_source is distinct from p_existing then raise exception 'Choose an active income source' using errcode='22023';end if;
end $$;
revoke all on function budget_tracker.check_income_source(uuid,uuid) from public,anon;
grant execute on function budget_tracker.check_income_source(uuid,uuid) to authenticated;

create function budget_tracker.guard_income_source() returns trigger
language plpgsql security definer set search_path='' as $$
declare s budget_tracker.income_sources;
begin
 if auth.uid() is not null then
  perform budget_tracker.financial_lock();
  if new.user_id<>auth.uid() then raise exception 'Transaction unavailable' using errcode='42501';end if;
 end if;
 if new.income_source_id is not null then
  if new.type<>'income' then raise exception 'Expenses cannot have an income source' using errcode='23514';end if;
  if tg_op='INSERT' or new.income_source_id is distinct from old.income_source_id then
   select * into s from budget_tracker.income_sources where id=new.income_source_id and user_id=new.user_id for share;
   if not found then raise exception 'Source unavailable' using errcode='42501';end if;
   if s.archived then raise exception 'Choose an active income source' using errcode='22023';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function budget_tracker.guard_income_source() from public,anon,authenticated;
create trigger transaction_income_source_guard before insert or update on budget_tracker.transactions for each row execute function budget_tracker.guard_income_source();


create or replace function budget_tracker.save_transaction(p_transaction jsonb, p_items jsonb)
returns budget_tracker.transactions
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid(); tx_id uuid; operation text; tx_type text; cat_id uuid;
  manual numeric; total numeric; row jsonb; row_amount numeric; qty numeric; price numeric;
  saved budget_tracker.transactions; existing_rows jsonb; canonical_rows jsonb := '[]'::jsonb;
  tx_note text; tx_date timestamptz; idx integer := 0;
  source_id uuid; payment_id uuid; payment_archived boolean; payment_kind text; details jsonb; calendar_date date; payload_version integer; summary_flag boolean; counted boolean; fee_party text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform budget_tracker.financial_lock();
  if jsonb_typeof(p_transaction) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid save payload' using errcode = '22023';
  end if;
  if p_transaction ? 'payload_version' and (jsonb_typeof(p_transaction->'payload_version') <> 'number' or p_transaction->>'payload_version' not in ('1','2','3','4')) then
    raise exception 'Unsupported save version' using errcode='22023'; end if;
  payload_version := coalesce((p_transaction->>'payload_version')::integer,1);
  if p_transaction ? 'payment_method_id' then
    if payload_version<3 or jsonb_typeof(p_transaction->'payment_method_id') not in ('string','null') then raise exception 'Invalid payment method' using errcode='22023'; end if;
    payment_id:=(p_transaction->>'payment_method_id')::uuid;
  end if;
  if p_transaction ? 'income_source_id' then
    if payload_version<4 or jsonb_typeof(p_transaction->'income_source_id') not in ('string','null') then raise exception 'Invalid income source' using errcode='22023'; end if;
    source_id:=(p_transaction->>'income_source_id')::uuid;
  end if;
  details := p_transaction->'payment_details';
  if details = 'null'::jsonb then details := null; end if;
  if not budget_tracker.valid_payment_details(details) then raise exception 'Invalid payment details' using errcode='22023'; end if;
  if p_transaction ? 'transaction_date' and p_transaction->'transaction_date' <> 'null'::jsonb then
    if jsonb_typeof(p_transaction->'transaction_date') <> 'string' or p_transaction->>'transaction_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid transaction date' using errcode='22023'; end if;
    calendar_date := (p_transaction->>'transaction_date')::date;
  end if;
  operation := p_transaction->>'operation'; tx_type := p_transaction->>'type';
  if operation is null or operation not in ('create','update') or tx_type is null or tx_type not in ('expense','income')
    or jsonb_typeof(p_transaction->'id') is distinct from 'string'
    or jsonb_typeof(p_transaction->'amount') is distinct from 'string'
    or (p_transaction->>'amount') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$'
    or jsonb_typeof(p_transaction->'occurred_at') is distinct from 'string'
    or jsonb_typeof(p_transaction->'note') not in ('string','null') or not(p_transaction ? 'note')
    or jsonb_typeof(p_transaction->'category_id') not in ('string','null') or not(p_transaction ? 'category_id') then
    raise exception 'Invalid transaction fields' using errcode = '22023';
  end if;
  tx_id := (p_transaction->>'id')::uuid; cat_id := (p_transaction->>'category_id')::uuid;
  manual := (p_transaction->>'amount')::numeric;
  tx_note := p_transaction->>'note'; tx_date := (p_transaction->>'occurred_at')::timestamptz;
  if payload_version=1 and tx_type='income' and jsonb_array_length(p_items)>0 then raise exception 'Update the app to save income rows' using errcode='22023'; end if;
  if not isfinite(tx_date) or (tx_type = 'expense' and cat_id is null) or (tx_type = 'income' and cat_id is not null)
    or jsonb_array_length(p_items) > 100 then
    raise exception 'Invalid transaction fields or rows' using errcode = '22023';
  end if;
  for row in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(row) is distinct from 'object' or row->>'kind' is null or row->>'kind' not in ('item','deduction','tax','fee','adjustment')
      or jsonb_typeof(row->'label') is distinct from 'string' or length(budget_tracker.trim_item_label(row->>'label')) = 0 or char_length(row->>'label') > 200
      or jsonb_typeof(row->'amount') is distinct from 'string' or (row->>'amount') !~ '^-?(0|[1-9][0-9]{0,9})\.[0-9]{2}$'
      or row->>'amount' = '-0.00' or jsonb_typeof(row->'tax_included') is distinct from 'boolean'
      or not(row ? 'quantity') or not(row ? 'unit_price') then
      raise exception 'Invalid item fields' using errcode = '22023';
    end if;
    if (row ? 'is_payment_summary' and jsonb_typeof(row->'is_payment_summary') <> 'boolean') or (row ? 'affects_total' and jsonb_typeof(row->'affects_total') <> 'boolean') then
      raise exception 'Invalid item flags' using errcode='22023'; end if;
    summary_flag := coalesce((row->>'is_payment_summary')::boolean,false);
    counted := coalesce((row->>'affects_total')::boolean,true);
    fee_party := row->>'fee_party';
    if fee_party is not null and (jsonb_typeof(row->'fee_party') <> 'string' or fee_party not in ('sender','recipient','unknown') or row->>'kind' <> 'fee') then raise exception 'Invalid fee ownership' using errcode='22023'; end if;
    if payload_version = 1 and (summary_flag or (not counted and not(row->>'kind'='tax' and (row->>'tax_included')::boolean)) or fee_party is not null) then raise exception 'Update the app to save payment rows' using errcode='22023'; end if;
    row_amount := (row->>'amount')::numeric;
    if summary_flag and (row->>'kind' <> 'item' or not counted or row_amount <= 0) then raise exception 'Payment summary must be a counted positive item' using errcode='22023'; end if;
    if abs(row_amount) > 9999999999.99 or (row->>'kind' <> 'adjustment' and row_amount < 0)
      or ((row->>'tax_included')::boolean and row->>'kind' <> 'tax') then
      raise exception 'Invalid item amount or tax flag' using errcode = '22023';
    end if;
    qty := null; price := null;
    if row->'quantity' <> 'null'::jsonb then
      if row->>'kind' <> 'item' or jsonb_typeof(row->'quantity') <> 'string' or row->>'quantity' !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$' then
        raise exception 'Invalid item quantity' using errcode = '22023';
      end if;
      qty := (row->>'quantity')::numeric;
      if qty <= 0 then raise exception 'Quantity must be positive' using errcode = '22023'; end if;
    end if;
    if row->'unit_price' <> 'null'::jsonb then
      if row->>'kind' <> 'item' or jsonb_typeof(row->'unit_price') <> 'string' or row->>'unit_price' !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' then
        raise exception 'Invalid item unit price' using errcode = '22023';
      end if;
      price := (row->>'unit_price')::numeric;
    end if;
    canonical_rows := canonical_rows || jsonb_build_array(jsonb_build_object('kind',row->>'kind','label',budget_tracker.trim_item_label(row->>'label'),
      'amount',row_amount,'quantity',qty,'unit_price',price,'tax_included',(row->>'tax_included')::boolean,'is_payment_summary',summary_flag,'affects_total',counted,'fee_party',fee_party));
  end loop;
  total := case when jsonb_array_length(p_items) > 0 then budget_tracker.item_total(canonical_rows,tx_type) else manual end;
  if total <= 0 or total > 9999999999.99 then raise exception 'Amount must be positive and in range' using errcode = '22023'; end if;
  -- Stable UUID serializes even first-time concurrent creates; RLS still determines ownership.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tx_id::text, 12));
  select * into saved from budget_tracker.transactions where id = tx_id and user_id = owner_id for update;
  if payload_version=1 and details is not null then raise exception 'Update the app to save payment details' using errcode='22023'; end if;
  if found and operation='update' then
    if payload_version=1 and (saved.payment_details is not null or exists(select from budget_tracker.transaction_items where transaction_id=tx_id and (is_payment_summary or (not affects_total and not(kind='tax' and tax_included)) or (saved.type='income')))) then
      raise exception 'Update the app to edit this payment' using errcode='22023'; end if;
    if not(p_transaction ? 'income_source_id') then source_id:=saved.income_source_id; end if;
    if not(p_transaction ? 'payment_method_id') then payment_id:=saved.payment_method_id; end if;
    if not(p_transaction ? 'payment_details') then details := saved.payment_details; end if;
    if not(p_transaction ? 'transaction_date') then calendar_date := saved.transaction_date; end if;
  end if;
  if tx_type='expense' then source_id:=null; end if;
  if source_id is not null then
    perform budget_tracker.check_income_source(source_id,saved.income_source_id);
  end if;
  if payment_id is not null then payment_id:=budget_tracker.resolve_transaction_payment_method(payment_id,saved.payment_method_id); end if;
  if operation = 'create' and saved.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'label',label,'amount',amount,'quantity',quantity,'unit_price',unit_price,'tax_included',tax_included,'is_payment_summary',is_payment_summary,'affects_total',affects_total,'fee_party',budget_tracker.transaction_items.fee_party) order by position),'[]'::jsonb)
      into existing_rows from budget_tracker.transaction_items where transaction_id = tx_id;
    if saved.income_source_id is not distinct from source_id and saved.type = tx_type and saved.category_id is not distinct from cat_id and saved.amount = total
      and saved.payment_method_id is not distinct from payment_id and saved.payment_details is not distinct from details and saved.transaction_date is not distinct from calendar_date
      and saved.note is not distinct from tx_note and saved.occurred_at = tx_date and existing_rows = canonical_rows then return saved; end if;
    raise exception 'Create retry conflicts with saved transaction' using errcode = '23505';
  elsif operation = 'update' and saved.id is null then
    raise exception 'Transaction not found' using errcode = '42501';
  end if;
  if operation = 'create' then
    insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,payment_details,transaction_date,payment_method_id,income_source_id)
      values(tx_id,owner_id,tx_type,cat_id,total,tx_note,tx_date,details,calendar_date,payment_id,source_id) returning * into saved;
  else
    update budget_tracker.transactions set type=tx_type,category_id=cat_id,amount=total,note=tx_note,occurred_at=tx_date,payment_details=details,transaction_date=calendar_date,payment_method_id=payment_id,income_source_id=source_id
      where id=tx_id and user_id=owner_id returning * into saved;
  end if;
  delete from budget_tracker.transaction_items where transaction_id=tx_id;
  for row in select value from jsonb_array_elements(canonical_rows) loop
    insert into budget_tracker.transaction_items(transaction_id,user_id,kind,label,amount,quantity,unit_price,tax_included,position,is_payment_summary,affects_total,fee_party)
      values(tx_id,owner_id,row->>'kind',row->>'label',(row->>'amount')::numeric,(row->>'quantity')::numeric,
        (row->>'unit_price')::numeric,(row->>'tax_included')::boolean,idx,(row->>'is_payment_summary')::boolean,(row->>'affects_total')::boolean,row->>'fee_party');
    idx := idx+1;
  end loop;
  perform budget_tracker.check_transaction_items(tx_id);
  return saved;
end $$;
revoke all on function budget_tracker.save_transaction(jsonb,jsonb) from public,anon;
grant execute on function budget_tracker.save_transaction(jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Receipt rows and atomic saves; owner CRUD remains protected by deferred invariants.
alter table budget_tracker.transactions add constraint transactions_user_id_id_key unique(user_id, id);
alter table budget_tracker.transactions add constraint transactions_finite_amount check (amount <> 'NaN'::numeric and amount > 0 and amount <= 9999999999.99);

-- Match String.trim() whitespace, including NBSP and BOM, before label validation.
create function budget_tracker.trim_item_label(p_label text) returns text
language sql immutable security invoker set search_path = '' as $$
  select btrim(p_label, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
revoke all on function budget_tracker.trim_item_label(text) from public,anon;
grant execute on function budget_tracker.trim_item_label(text) to authenticated;

create table budget_tracker.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('item','deduction','tax','fee','adjustment')),
  label text not null check (length(budget_tracker.trim_item_label(label)) > 0 and char_length(label) <= 200),
  amount numeric(12,2) not null check (amount <> 'NaN'::numeric and abs(amount) <= 9999999999.99 and (kind = 'adjustment' or amount >= 0)),
  quantity numeric(12,3) check (quantity is null or (quantity <> 'NaN'::numeric and quantity > 0 and quantity <= 999999999.999 and kind = 'item')),
  unit_price numeric(12,2) check (unit_price is null or (unit_price <> 'NaN'::numeric and unit_price >= 0 and unit_price <= 9999999999.99 and kind = 'item')),
  tax_included boolean not null default false check (not tax_included or kind = 'tax'),
  position integer not null check (position >= 0),
  foreign key(user_id, transaction_id) references budget_tracker.transactions(user_id,id) on delete cascade,
  unique(transaction_id, position)
);
alter table budget_tracker.transaction_items enable row level security;
create policy items_select_own on budget_tracker.transaction_items for select using(auth.uid() = user_id);
create policy items_insert_own on budget_tracker.transaction_items for insert with check(auth.uid() = user_id);
create policy items_update_own on budget_tracker.transaction_items for update using(auth.uid() = user_id) with check(auth.uid() = user_id);
create policy items_delete_own on budget_tracker.transaction_items for delete using(auth.uid() = user_id);
grant select,insert,update,delete on budget_tracker.transaction_items to authenticated;

-- One exact formula, used by the RPC and the database-wide checks.
create function budget_tracker.item_total(p_rows jsonb) returns numeric
language sql immutable security invoker set search_path = '' as $$
  select coalesce(sum(case when r->>'kind' = 'tax' and (r->>'tax_included')::boolean then 0
    when r->>'kind' = 'deduction' then -round((r->>'amount')::numeric,2) else round((r->>'amount')::numeric,2) end),0)
  from jsonb_array_elements(p_rows) r
$$;
revoke all on function budget_tracker.item_total(jsonb) from public,anon;
grant execute on function budget_tracker.item_total(jsonb) to authenticated;

create function budget_tracker.check_transaction_items(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare p budget_tracker.transactions; rows jsonb; n integer; total numeric;
begin
  select * into p from budget_tracker.transactions where id = p_id for update;
  if not found then return; end if; -- parent/cascade deletion
  select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'amount',amount,'tax_included',tax_included)), '[]'::jsonb), count(*)
    into rows,n from budget_tracker.transaction_items where transaction_id = p_id;
  if n > 100 or (p.type = 'income' and n > 0) then raise exception 'Invalid transaction rows' using errcode = '23514'; end if;
  if n > 0 then
    total := budget_tracker.item_total(rows);
    if total <= 0 or total > 9999999999.99 or total <> p.amount then
      raise exception 'Transaction amount must match its items' using errcode = '23514';
    end if;
  end if;
end $$;
revoke all on function budget_tracker.check_transaction_items(uuid) from public,anon;
grant execute on function budget_tracker.check_transaction_items(uuid) to authenticated;

create function budget_tracker.lock_item_parent() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.transaction_id <> old.transaction_id) then
    raise exception 'Item ownership and parent are immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    perform 1 from budget_tracker.transactions where id = old.transaction_id for update;
    return old;
  end if;
  perform 1 from budget_tracker.transactions where id = new.transaction_id for update;
  return new;
end $$;
create trigger item_parent_lock before insert or update or delete on budget_tracker.transaction_items
for each row execute function budget_tracker.lock_item_parent();

create function budget_tracker.enforce_transaction_items() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'transactions' then
    perform budget_tracker.check_transaction_items(new.id);
  elsif tg_op = 'DELETE' then
    perform budget_tracker.check_transaction_items(old.transaction_id);
  else
    perform budget_tracker.check_transaction_items(new.transaction_id);
  end if;
  return null;
end $$;
create constraint trigger transaction_items_consistency after insert or update on budget_tracker.transactions
deferrable initially deferred for each row execute function budget_tracker.enforce_transaction_items();
create constraint trigger item_transaction_consistency after insert or update or delete on budget_tracker.transaction_items
deferrable initially deferred for each row execute function budget_tracker.enforce_transaction_items();
revoke all on function budget_tracker.lock_item_parent(), budget_tracker.enforce_transaction_items() from public,anon;

create function budget_tracker.save_transaction(p_transaction jsonb, p_items jsonb)
returns budget_tracker.transactions
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid(); tx_id uuid; operation text; tx_type text; cat_id uuid;
  manual numeric; total numeric; row jsonb; row_amount numeric; qty numeric; price numeric;
  saved budget_tracker.transactions; existing_rows jsonb; canonical_rows jsonb := '[]'::jsonb;
  tx_note text; tx_date timestamptz; idx integer := 0;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_transaction) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid save payload' using errcode = '22023';
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
  if not isfinite(tx_date) or (tx_type = 'expense' and cat_id is null) or (tx_type = 'income' and cat_id is not null)
    or jsonb_array_length(p_items) > 100 or (tx_type = 'income' and jsonb_array_length(p_items) > 0) then
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
    row_amount := (row->>'amount')::numeric;
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
      'amount',row_amount,'quantity',qty,'unit_price',price,'tax_included',(row->>'tax_included')::boolean));
  end loop;
  total := case when jsonb_array_length(p_items) > 0 then budget_tracker.item_total(canonical_rows) else manual end;
  if total <= 0 or total > 9999999999.99 then raise exception 'Amount must be positive and in range' using errcode = '22023'; end if;
  -- Stable UUID serializes even first-time concurrent creates; RLS still determines ownership.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tx_id::text, 12));
  select * into saved from budget_tracker.transactions where id = tx_id and user_id = owner_id for update;
  if operation = 'create' and found then
    select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'label',label,'amount',amount,'quantity',quantity,'unit_price',unit_price,'tax_included',tax_included) order by position),'[]'::jsonb)
      into existing_rows from budget_tracker.transaction_items where transaction_id = tx_id;
    if saved.type = tx_type and saved.category_id is not distinct from cat_id and saved.amount = total
      and saved.note is not distinct from tx_note and saved.occurred_at = tx_date and existing_rows = canonical_rows then return saved; end if;
    raise exception 'Create retry conflicts with saved transaction' using errcode = '23505';
  elsif operation = 'update' and not found then
    raise exception 'Transaction not found' using errcode = '42501';
  end if;
  if operation = 'create' then
    insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at)
      values(tx_id,owner_id,tx_type,cat_id,total,tx_note,tx_date) returning * into saved;
  else
    update budget_tracker.transactions set type=tx_type,category_id=cat_id,amount=total,note=tx_note,occurred_at=tx_date
      where id=tx_id and user_id=owner_id returning * into saved;
  end if;
  delete from budget_tracker.transaction_items where transaction_id=tx_id;
  for row in select value from jsonb_array_elements(canonical_rows) loop
    insert into budget_tracker.transaction_items(transaction_id,user_id,kind,label,amount,quantity,unit_price,tax_included,position)
      values(tx_id,owner_id,row->>'kind',row->>'label',(row->>'amount')::numeric,(row->>'quantity')::numeric,
        (row->>'unit_price')::numeric,(row->>'tax_included')::boolean,idx);
    idx := idx+1;
  end loop;
  perform budget_tracker.check_transaction_items(tx_id);
  return saved;
end $$;
revoke all on function budget_tracker.save_transaction(jsonb,jsonb) from public,anon;
grant execute on function budget_tracker.save_transaction(jsonb,jsonb) to authenticated;

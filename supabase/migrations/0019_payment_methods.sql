-- Manual payment methods and independent tracked balances. No full-card fields.
create table budget_tracker.payment_methods (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 method text not null check(method in ('cash','card','bank_account','wallet','other')),
 payment_type text not null check(char_length(payment_type) between 1 and 80),
 name text not null check(char_length(name) between 1 and 100),
 last_four text check(last_four is null or last_four ~ '^[0-9]{4}$'),
 opening_balance numeric(12,2), baseline_at timestamptz, archived boolean not null default false,
 unique(user_id,id), check((opening_balance is null)=(baseline_at is null)),
 check(method='cash' or opening_balance is not null),
 check(method<>'cash' or (name='Cash' and payment_type='Cash' and last_four is null and not archived)),
 check(method<>'card' or payment_type in ('Debit card','Prepaid card','Credit card')),
 check(method='card' or last_four is null),
 check(name !~ '([0-9][ -]?){13,}' and payment_type !~ '([0-9][ -]?){13,}')
);
create unique index one_cash_method on budget_tracker.payment_methods(user_id) where method='cash';
alter table budget_tracker.payment_methods enable row level security;
revoke all on budget_tracker.payment_methods from public,anon,authenticated;
grant select on budget_tracker.payment_methods to authenticated;
create policy payment_methods_owner on budget_tracker.payment_methods for select to authenticated using(user_id=auth.uid());
alter table budget_tracker.transactions add column payment_method_id uuid, add column payment_assigned_at timestamptz not null default now(),
 add constraint transaction_payment_method_owner foreign key(user_id,payment_method_id) references budget_tracker.payment_methods(user_id,id);
create index transactions_payment_method on budget_tracker.transactions(user_id,payment_method_id);
alter table budget_tracker.recurring_rules add column payment_method_id uuid,
 add constraint rule_payment_method_owner foreign key(user_id,payment_method_id) references budget_tracker.payment_methods(user_id,id);
alter table budget_tracker.recurring_occurrences add column payment_method_id uuid,
 add constraint occurrence_payment_method_owner foreign key(user_id,payment_method_id) references budget_tracker.payment_methods(user_id,id);

create table budget_tracker.payment_transfers (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null,destination_id uuid not null,amount numeric(12,2) not null check(amount>0),
 transfer_date date not null check(isfinite(transfer_date)),note text check(char_length(note)<=200),
 source_assigned_at timestamptz not null,destination_assigned_at timestamptz not null,
 check(source_id<>destination_id),foreign key(user_id,source_id) references budget_tracker.payment_methods(user_id,id),foreign key(user_id,destination_id) references budget_tracker.payment_methods(user_id,id)
);
create table budget_tracker.balance_corrections (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,method_id uuid not null,
 target_balance numeric(12,2) not null,delta numeric not null,note text check(char_length(note)<=200),created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,method_id) references budget_tracker.payment_methods(user_id,id)
);
alter table budget_tracker.payment_transfers enable row level security;
alter table budget_tracker.balance_corrections enable row level security;
revoke all on budget_tracker.payment_transfers,budget_tracker.balance_corrections from public,anon,authenticated;
grant select on budget_tracker.payment_transfers,budget_tracker.balance_corrections to authenticated;
create policy transfers_owner on budget_tracker.payment_transfers for select to authenticated using(user_id=auth.uid());
create policy corrections_owner on budget_tracker.balance_corrections for select to authenticated using(user_id=auth.uid());

create function budget_tracker.ensure_cash_method() returns void language plpgsql security definer set search_path='' as $$
begin
 perform budget_tracker.financial_lock();
 if not exists(select from budget_tracker.profiles where user_id=auth.uid()) then raise exception 'Preferences are still syncing. Retry shortly.' using errcode='42501'; end if;
 insert into budget_tracker.payment_methods(id,user_id,method,payment_type,name) values(gen_random_uuid(),auth.uid(),'cash','Cash','Cash') on conflict(user_id) where method='cash' do nothing;
end $$;
revoke all on function budget_tracker.ensure_cash_method() from public,anon,authenticated;

grant execute on function budget_tracker.financial_lock() to authenticated;

-- All write paths hold the same owner lock; balances are derived, never cached counters.
create function budget_tracker.method_balance(p_id uuid) returns numeric language sql stable security definer set search_path='' as $$
 select case when m.baseline_at is null then null else m.opening_balance
 +coalesce((select sum(case when t.type='income' then t.amount else -t.amount end) from budget_tracker.transactions t
   where t.user_id=m.user_id and (t.payment_method_id=m.id or (m.method='cash' and t.payment_method_id is null))
   and coalesce(t.transaction_date,(t.occurred_at at time zone p.timezone)::date)<=(now() at time zone p.timezone)::date
   and (t.payment_assigned_at>=m.baseline_at or coalesce(t.transaction_date,(t.occurred_at at time zone p.timezone)::date)>(m.baseline_at at time zone p.timezone)::date)),0)
 +coalesce((select sum(case when f.destination_id=m.id then f.amount else -f.amount end) from budget_tracker.payment_transfers f
   where f.user_id=m.user_id and m.id in (f.source_id,f.destination_id) and f.transfer_date<=(now() at time zone p.timezone)::date
   and (case when f.destination_id=m.id then f.destination_assigned_at else f.source_assigned_at end>=m.baseline_at or f.transfer_date>(m.baseline_at at time zone p.timezone)::date)),0)
 +coalesce((select sum(c.delta) from budget_tracker.balance_corrections c where c.user_id=m.user_id and c.method_id=m.id and c.created_at>=m.baseline_at),0) end
 from budget_tracker.payment_methods m join budget_tracker.profiles p on p.user_id=m.user_id where m.id=p_id and m.user_id=auth.uid()
$$;
revoke all on function budget_tracker.method_balance(uuid) from public,anon,authenticated;

create function budget_tracker.resolve_transaction_payment_method(p_id uuid,p_existing uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare m budget_tracker.payment_methods;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into m from budget_tracker.payment_methods where id=p_id and user_id=auth.uid() for share;
 if not found then raise exception 'Payment method unavailable' using errcode='42501'; end if;
 if m.archived and p_existing is distinct from m.id then raise exception 'Choose an active payment method' using errcode='22023'; end if;
 return case when m.method='cash' then null else m.id end;
end $$;
revoke all on function budget_tracker.resolve_transaction_payment_method(uuid,uuid) from public,anon;
grant execute on function budget_tracker.resolve_transaction_payment_method(uuid,uuid) to authenticated;

create function budget_tracker.save_payment_method(p_method jsonb) returns budget_tracker.payment_methods language plpgsql security definer set search_path='' as $$
declare existing budget_tracker.payment_methods;saved budget_tracker.payment_methods;owner_id uuid:=auth.uid();method_id uuid;kind text;label text;subtype text;digits text;balance numeric;operation text;replacement uuid;
begin
 perform budget_tracker.ensure_cash_method();method_id:=(p_method->>'id')::uuid;operation:=p_method->>'operation';
 select * into existing from budget_tracker.payment_methods where id=method_id and user_id=owner_id for update;
 if operation in ('archive','restore') then
  if existing.id is null or existing.method='cash' then raise exception 'Payment method unavailable' using errcode='42501'; end if;
  if operation='archive' then
   if exists(select from budget_tracker.recurring_rules where user_id=owner_id and not archived and payment_method_id=method_id) or exists(select from budget_tracker.recurring_occurrences where user_id=owner_id and state in ('outstanding','replacement') and payment_method_id=method_id) then
    if coalesce((p_method->>'reassignBills')::boolean,false) is not true then raise exception 'Reassign linked recurring bills before archiving' using errcode='22023'; end if;
    replacement:=(p_method->>'replacementMethodId')::uuid;
    if replacement=method_id then raise exception 'Choose another payment method' using errcode='22023'; end if;
    if replacement is not null then replacement:=budget_tracker.resolve_transaction_payment_method(replacement,null); end if;
    update budget_tracker.recurring_rules set payment_method_id=replacement where user_id=owner_id and not archived and payment_method_id=method_id;
    update budget_tracker.recurring_occurrences set payment_method_id=replacement where user_id=owner_id and state in ('outstanding','replacement') and payment_method_id=method_id;
   end if;
  end if;
  update budget_tracker.payment_methods set archived=(operation='archive') where id=method_id returning * into saved;return saved;
 end if;
 if operation is null or operation not in ('create','update') or method_id is null then raise exception 'Invalid payment method operation' using errcode='22023'; end if;
 kind:=p_method->>'method';label:=btrim(p_method->>'name');subtype:=btrim(p_method->>'paymentType');digits:=nullif(p_method->>'lastFour','');
 if jsonb_typeof(p_method->'openingBalance') is distinct from 'string' or coalesce(p_method->>'openingBalance','') !~ '^-?(0|[1-9][0-9]{0,9})\.[0-9]{2}$' then raise exception 'Enter an initial balance' using errcode='22023'; end if;
 balance:=(p_method->>'openingBalance')::numeric;
 if kind='card' and subtype='Credit card' then if balance<0 then raise exception 'Enter amount owed as a positive value' using errcode='22023'; end if;balance:=-balance;end if;
 if kind is null or kind not in ('cash','card','bank_account','wallet','other') or label is null or subtype is null then raise exception 'Invalid payment method fields' using errcode='22023'; end if;
 if kind<>'card' and digits is not null then raise exception 'Last digits are only for cards' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(method_id::text,73));
 if operation='create' then
  select * into existing from budget_tracker.payment_methods where id=method_id and user_id=owner_id for update;
  if existing.id is not null then
   if existing.method=kind and existing.name=label and existing.payment_type=subtype and existing.last_four is not distinct from digits and existing.opening_balance=balance then return existing;end if;
   raise exception 'Payment method retry conflicts' using errcode='23505';
  end if;
  if kind='cash' then raise exception 'Cash already exists. Set its initial balance in Settings.' using errcode='22023';end if;
  insert into budget_tracker.payment_methods(id,user_id,method,payment_type,name,last_four,opening_balance,baseline_at) values(method_id,owner_id,kind,subtype,label,digits,balance,clock_timestamp()) returning * into saved;
 else
  if existing.id is null then raise exception 'Payment method unavailable' using errcode='42501';end if;
  if existing.method<>kind or (existing.payment_type='Credit card')<>(subtype='Credit card') then raise exception 'Create a separate method to change its funding type' using errcode='22023';end if;
  if existing.opening_balance is not null and existing.opening_balance is distinct from balance and (exists(select from budget_tracker.transactions where user_id=owner_id and (payment_method_id=method_id or (kind='cash' and payment_method_id is null))) or exists(select from budget_tracker.payment_transfers where user_id=owner_id and method_id in (source_id,destination_id)) or exists(select from budget_tracker.balance_corrections c where c.user_id=owner_id and c.method_id=existing.id)) and coalesce((p_method->>'confirmOpening')::boolean,false) is not true then raise exception 'Confirm initial balance recalculation' using errcode='22023';end if;
  update budget_tracker.payment_methods set name=label,payment_type=subtype,last_four=digits,opening_balance=balance,baseline_at=coalesce(baseline_at,clock_timestamp()) where id=method_id returning * into saved;
 end if;return saved;
end $$;
revoke all on function budget_tracker.save_payment_method(jsonb) from public,anon;
grant execute on function budget_tracker.save_payment_method(jsonb) to authenticated;

create function budget_tracker.correct_method_balance(p_correction jsonb) returns budget_tracker.balance_corrections language plpgsql security definer set search_path='' as $$
declare m budget_tracker.payment_methods;c budget_tracker.balance_corrections;v_id uuid;target numeric;expected numeric;current_value numeric;label text;
begin
 perform budget_tracker.financial_lock();v_id:=(p_correction->>'id')::uuid;
 select * into m from budget_tracker.payment_methods where id=(p_correction->>'methodId')::uuid and user_id=auth.uid() for update;
 if m.id is null or m.archived or m.baseline_at is null then raise exception 'Set an initial balance on an active method first' using errcode='22023';end if;
 if jsonb_typeof(p_correction->'targetBalance') is distinct from 'string' or jsonb_typeof(p_correction->'expectedBalance') is distinct from 'string' or coalesce(p_correction->>'targetBalance','') !~ '^-?(0|[1-9][0-9]{0,9})\.[0-9]{2}$' or coalesce(p_correction->>'expectedBalance','') !~ '^-?[0-9]+\.[0-9]{2}$' then raise exception 'Enter a valid balance' using errcode='22023';end if;
 target:=(p_correction->>'targetBalance')::numeric;expected:=(p_correction->>'expectedBalance')::numeric;label:=nullif(btrim(p_correction->>'note'),'');
 if m.method='card' and m.payment_type='Credit card' then if target<0 then raise exception 'Enter amount owed as a positive value' using errcode='22023';end if;if coalesce((p_correction->>'creditBalance')::boolean,false) is not true then target:=-target;end if;end if;
 select * into c from budget_tracker.balance_corrections where id=v_id and user_id=auth.uid();
 if c.id is not null then if c.method_id=m.id and c.target_balance=target and c.note is not distinct from label then return c;end if;raise exception 'Correction retry conflicts' using errcode='23505';end if;
 current_value:=budget_tracker.method_balance(m.id);if current_value is distinct from expected then raise exception 'Balance changed. Refresh and retry.' using errcode='40001';end if;
 insert into budget_tracker.balance_corrections(id,user_id,method_id,target_balance,delta,note) values(v_id,auth.uid(),m.id,target,target-current_value,label) returning * into c;return c;
end $$;
revoke all on function budget_tracker.correct_method_balance(jsonb) from public,anon;
grant execute on function budget_tracker.correct_method_balance(jsonb) to authenticated;

create function budget_tracker.save_payment_transfer(p_transfer jsonb) returns budget_tracker.payment_transfers language plpgsql security definer set search_path='' as $$
declare f budget_tracker.payment_transfers;old_f budget_tracker.payment_transfers;src budget_tracker.payment_methods;dst budget_tracker.payment_methods;v_id uuid;operation text;amount_value numeric;day date;label text;
begin
 perform budget_tracker.ensure_cash_method();v_id:=(p_transfer->>'id')::uuid;operation:=p_transfer->>'operation';
 select * into old_f from budget_tracker.payment_transfers where id=v_id and user_id=auth.uid() for update;
 if operation='delete' then if old_f.id is null then return null;end if;delete from budget_tracker.payment_transfers where id=v_id;return old_f;end if;
 if operation not in ('create','update') or operation is null or v_id is null or jsonb_typeof(p_transfer->'amount') is distinct from 'string' or coalesce(p_transfer->>'amount','') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' or coalesce(p_transfer->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid transfer' using errcode='22023';end if;
 select * into src from budget_tracker.payment_methods where id=(p_transfer->>'sourceId')::uuid and user_id=auth.uid() for share;
 select * into dst from budget_tracker.payment_methods where id=(p_transfer->>'destinationId')::uuid and user_id=auth.uid() for share;
 amount_value:=(p_transfer->>'amount')::numeric;day:=(p_transfer->>'date')::date;label:=nullif(btrim(p_transfer->>'note'),'');
 if src.id is null or dst.id is null or src.id=dst.id or amount_value<=0 or not isfinite(day) then raise exception 'Choose two different owned methods and a positive amount' using errcode='22023';end if;
 if (src.archived and src.id is distinct from old_f.source_id) or (dst.archived and dst.id is distinct from old_f.destination_id) then raise exception 'Choose active payment methods' using errcode='22023';end if;
 if operation='create' and old_f.id is not null then if old_f.source_id=src.id and old_f.destination_id=dst.id and old_f.amount=amount_value and old_f.transfer_date=day and old_f.note is not distinct from label then return old_f;end if;raise exception 'Transfer retry conflicts' using errcode='23505';end if;
 if operation='update' and old_f.id is null then raise exception 'Transfer unavailable' using errcode='42501';end if;
 if operation='create' then insert into budget_tracker.payment_transfers(id,user_id,source_id,destination_id,amount,transfer_date,note,source_assigned_at,destination_assigned_at) values(v_id,auth.uid(),src.id,dst.id,amount_value,day,label,clock_timestamp(),clock_timestamp()) returning * into f;
 else update budget_tracker.payment_transfers set source_id=src.id,destination_id=dst.id,amount=amount_value,transfer_date=day,note=label,source_assigned_at=case when source_id=src.id then source_assigned_at else clock_timestamp() end,destination_assigned_at=case when destination_id=dst.id then destination_assigned_at else clock_timestamp() end where id=v_id returning * into f;end if;return f;
end $$;
revoke all on function budget_tracker.save_payment_transfer(jsonb) from public,anon;
grant execute on function budget_tracker.save_payment_transfer(jsonb) to authenticated;

create function budget_tracker.payment_method_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare zone text;methods jsonb;transfers jsonb;corrections jsonb;
begin
 perform budget_tracker.ensure_cash_method();select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 select coalesce(jsonb_agg(to_jsonb(x) order by (x.method='cash') desc,x.archived,x.name,x.id),'[]') into methods from (
  select m.id,m.user_id,m.method,m.payment_type,m.name,m.last_four,m.opening_balance::text,m.baseline_at,m.archived,budget_tracker.method_balance(m.id)::text balance,
   (exists(select from budget_tracker.transactions t where t.user_id=m.user_id and (t.payment_method_id=m.id or (m.method='cash' and t.payment_method_id is null))) or exists(select from budget_tracker.payment_transfers f where f.user_id=m.user_id and m.id in (f.source_id,f.destination_id)) or exists(select from budget_tracker.balance_corrections c where c.method_id=m.id)) has_activity,
   coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'label',coalesce(r.note,'Recurring bill'))) from budget_tracker.recurring_rules r where r.user_id=m.user_id and not r.archived and (r.payment_method_id=m.id or exists(select from budget_tracker.recurring_occurrences o where o.rule_id=r.id and o.state in ('outstanding','replacement') and o.payment_method_id=m.id))),'[]') related_bills
  from budget_tracker.payment_methods m where m.user_id=auth.uid()
 )x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.transfer_date desc,x.id),'[]') into transfers from (select id,source_id,destination_id,amount::text,transfer_date,note from budget_tracker.payment_transfers where user_id=auth.uid())x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') into corrections from (select id,method_id,target_balance::text,delta::text,note,created_at from budget_tracker.balance_corrections where user_id=auth.uid())x;
 return jsonb_build_object('owner',auth.uid(),'timezone',zone,'methods',methods,'transfers',transfers,'corrections',corrections);
end $$;
revoke all on function budget_tracker.payment_method_snapshot() from public,anon;
grant execute on function budget_tracker.payment_method_snapshot() to authenticated;

create or replace function budget_tracker.save_transaction(p_transaction jsonb, p_items jsonb)
returns budget_tracker.transactions
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid(); tx_id uuid; operation text; tx_type text; cat_id uuid;
  manual numeric; total numeric; row jsonb; row_amount numeric; qty numeric; price numeric;
  saved budget_tracker.transactions; existing_rows jsonb; canonical_rows jsonb := '[]'::jsonb;
  tx_note text; tx_date timestamptz; idx integer := 0;
  payment_id uuid; payment_archived boolean; payment_kind text; details jsonb; calendar_date date; payload_version integer; summary_flag boolean; counted boolean; fee_party text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform budget_tracker.financial_lock();
  if jsonb_typeof(p_transaction) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid save payload' using errcode = '22023';
  end if;
  if p_transaction ? 'payload_version' and (jsonb_typeof(p_transaction->'payload_version') <> 'number' or p_transaction->>'payload_version' not in ('1','2','3')) then
    raise exception 'Unsupported save version' using errcode='22023'; end if;
  payload_version := coalesce((p_transaction->>'payload_version')::integer,1);
  if p_transaction ? 'payment_method_id' then
    if payload_version<3 or jsonb_typeof(p_transaction->'payment_method_id') not in ('string','null') then raise exception 'Invalid payment method' using errcode='22023'; end if;
    payment_id:=(p_transaction->>'payment_method_id')::uuid;
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
    if not(p_transaction ? 'payment_method_id') then payment_id:=saved.payment_method_id; end if;
    if not(p_transaction ? 'payment_details') then details := saved.payment_details; end if;
    if not(p_transaction ? 'transaction_date') then calendar_date := saved.transaction_date; end if;
  end if;
  if payment_id is not null then payment_id:=budget_tracker.resolve_transaction_payment_method(payment_id,saved.payment_method_id); end if;
  if operation = 'create' and saved.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'label',label,'amount',amount,'quantity',quantity,'unit_price',unit_price,'tax_included',tax_included,'is_payment_summary',is_payment_summary,'affects_total',affects_total,'fee_party',budget_tracker.transaction_items.fee_party) order by position),'[]'::jsonb)
      into existing_rows from budget_tracker.transaction_items where transaction_id = tx_id;
    if saved.type = tx_type and saved.category_id is not distinct from cat_id and saved.amount = total
      and saved.payment_method_id is not distinct from payment_id and saved.payment_details is not distinct from details and saved.transaction_date is not distinct from calendar_date
      and saved.note is not distinct from tx_note and saved.occurred_at = tx_date and existing_rows = canonical_rows then return saved; end if;
    raise exception 'Create retry conflicts with saved transaction' using errcode = '23505';
  elsif operation = 'update' and saved.id is null then
    raise exception 'Transaction not found' using errcode = '42501';
  end if;
  if operation = 'create' then
    insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,payment_details,transaction_date,payment_method_id)
      values(tx_id,owner_id,tx_type,cat_id,total,tx_note,tx_date,details,calendar_date,payment_id) returning * into saved;
  else
    update budget_tracker.transactions set type=tx_type,category_id=cat_id,amount=total,note=tx_note,occurred_at=tx_date,payment_details=details,transaction_date=calendar_date,payment_method_id=payment_id
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



create function budget_tracker.validate_transaction_payment_method() returns trigger language plpgsql security definer set search_path='' as $$
declare m budget_tracker.payment_methods;
begin
 if tg_op='DELETE' then if auth.uid() is not null then perform budget_tracker.financial_lock();end if;return old;end if;
 if auth.uid() is not null then perform budget_tracker.financial_lock();if new.user_id<>auth.uid() then raise exception 'Transaction unavailable' using errcode='42501';end if;end if;
 if new.payment_method_id is not null and (tg_op='INSERT' or old.payment_method_id is distinct from new.payment_method_id) then
  select * into m from budget_tracker.payment_methods where id=new.payment_method_id and user_id=new.user_id for share;
  if not found then raise exception 'Payment method unavailable' using errcode='42501';end if;
  if m.archived then raise exception 'Choose an active payment method' using errcode='22023';end if;
 end if;
 if tg_op='INSERT' or old.payment_method_id is distinct from new.payment_method_id then new.payment_assigned_at:=clock_timestamp();else new.payment_assigned_at:=old.payment_assigned_at;end if;return new;
end $$;
revoke all on function budget_tracker.validate_transaction_payment_method() from public,anon,authenticated;
create trigger transaction_payment_method_guard before insert or update or delete on budget_tracker.transactions for each row execute function budget_tracker.validate_transaction_payment_method();

create or replace function budget_tracker.generate_occurrences(p_rule uuid,p_through date) returns void language plpgsql security definer set search_path='' as $$
declare r budget_tracker.recurring_rules; d date; n integer:=0;
begin
 select * into r from budget_tracker.recurring_rules where id=p_rule and user_id=auth.uid() for update;
 if not found or not r.active or r.archived then return; end if;
 d:=r.next_occurrence_date;
 while d<=p_through loop
  n:=n+1; if n>10000 then raise exception 'Recurring schedule is too old; update its next due date' using errcode='22023'; end if;
  insert into budget_tracker.recurring_occurrences(user_id,rule_id,scheduled_date,amount,category_id,label,payment_method_id)
   values(r.user_id,r.id,d,r.amount,r.category_id,r.note,r.payment_method_id) on conflict(user_id,rule_id,scheduled_date) do nothing;
  d:=budget_tracker.next_rule_date(d,r.frequency,r.anchor_day,r.month_end);
 end loop;
 update budget_tracker.recurring_rules set preview_through=greatest(coalesce(preview_through,p_through),p_through) where id=r.id;
end $$;


create or replace function budget_tracker.save_recurring_rule(p_rule jsonb) returns budget_tracker.recurring_rules language plpgsql security definer set search_path='' as $$
declare r budget_tracker.recurring_rules; day date; v_rule_id uuid; next_day date; today date; command text; zone text;chosen_method uuid;
begin
 perform budget_tracker.financial_lock();
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 if zone is null then raise exception 'Set your timezone first' using errcode='22023'; end if;
 today:=(now() at time zone zone)::date;
 command:=coalesce(p_rule->>'command','save'); v_rule_id:=(p_rule->>'id')::uuid;
 if v_rule_id is not null then select * into r from budget_tracker.recurring_rules where user_id=auth.uid() and recurring_rules.id=v_rule_id for update;
  if not found then raise exception 'Rule unavailable' using errcode='42501'; end if;
 end if;
 if command in ('pause','resume','archive') then
  if v_rule_id is null then raise exception 'Rule required' using errcode='22023'; end if;
  if command='pause' then
   update budget_tracker.recurring_rules set active=false,paused_at=today where recurring_rules.id=v_rule_id returning * into r;
   update budget_tracker.recurring_occurrences set state='skipped',skip_reason='pause' where rule_id=v_rule_id and state in ('outstanding','replacement') and scheduled_date>=today;
  elsif command='archive' then
   update budget_tracker.recurring_rules set active=false,archived=true where recurring_rules.id=v_rule_id returning * into r;
   update budget_tracker.recurring_occurrences set state='skipped',skip_reason='archive' where rule_id=v_rule_id and state in ('outstanding','replacement');
  else
   if r.archived then raise exception 'Archived rule cannot resume' using errcode='22023'; end if;
   next_day:=r.next_occurrence_date;
   while next_day<today loop next_day:=budget_tracker.next_rule_date(next_day,r.frequency,r.anchor_day,r.month_end); end loop;
   update budget_tracker.recurring_occurrences set state='skipped',skip_reason='pause' where rule_id=v_rule_id and state in ('outstanding','replacement') and scheduled_date>=coalesce(r.paused_at,today);
   -- Previously previewed future skipped dates become payable again on resume.
   delete from budget_tracker.recurring_occurrences where rule_id=v_rule_id and state='skipped' and skip_reason='pause' and scheduled_date>=next_day;
   update budget_tracker.recurring_rules set active=true,paused_at=null,next_occurrence_date=next_day where recurring_rules.id=v_rule_id returning * into r;
  end if;
  if command='resume' then perform budget_tracker.generate_occurrences(r.id,greatest(coalesce(r.preview_through,today),(date_trunc('month',today)+interval '1 month - 1 day')::date)); end if;
  return r;
 end if;
 if command<>'save' or p_rule->>'frequency' not in ('weekly','monthly') or p_rule->>'frequency' is null then raise exception 'Invalid rule' using errcode='22023'; end if;
 if p_rule ? 'paymentMethodId' then chosen_method:=(p_rule->>'paymentMethodId')::uuid;else chosen_method:=r.payment_method_id;end if;
 if chosen_method is not null then chosen_method:=budget_tracker.resolve_transaction_payment_method(chosen_method,r.payment_method_id);end if;
 day:=(p_rule->>'nextDueDate')::date;
 if day is null or not isfinite(day) or coalesce(p_rule->>'amount','') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' or (p_rule->>'amount')::numeric<=0 then raise exception 'Invalid due date or amount' using errcode='22023'; end if;
 if not exists(select from budget_tracker.categories where user_id=auth.uid() and categories.id=(p_rule->>'categoryId')::uuid) then raise exception 'Category unavailable' using errcode='42501'; end if;
 if v_rule_id is null then
  insert into budget_tracker.recurring_rules(user_id,category_id,amount,note,frequency,next_occurrence_date,anchor_day,month_end)
  values(auth.uid(),(p_rule->>'categoryId')::uuid,(p_rule->>'amount')::numeric,p_rule->>'note',p_rule->>'frequency',day,extract(day from day)::integer,coalesce((p_rule->>'monthEnd')::boolean,false)) returning * into r;
 else
  delete from budget_tracker.recurring_occurrences where rule_id=v_rule_id and state='outstanding' and scheduled_date>=today;
  update budget_tracker.recurring_rules set category_id=(p_rule->>'categoryId')::uuid,amount=(p_rule->>'amount')::numeric,note=p_rule->>'note',frequency=p_rule->>'frequency',next_occurrence_date=day,
  anchor_day=case when day=r.next_occurrence_date then r.anchor_day else extract(day from day)::integer end,month_end=coalesce((p_rule->>'monthEnd')::boolean,false)
  where recurring_rules.id=v_rule_id returning * into r;
 end if;
 if p_rule ? 'reminderEnabled' and jsonb_typeof(p_rule->'reminderEnabled') <> 'boolean' then raise exception 'Invalid reminder switch' using errcode='22023'; end if;
 update budget_tracker.recurring_rules set reminder_enabled=coalesce((p_rule->>'reminderEnabled')::boolean,reminder_enabled),reminder_days_before=coalesce((p_rule->>'reminderDaysBefore')::integer,reminder_days_before),reminder_time=coalesce(p_rule->>'reminderTime',reminder_time) ,payment_method_id=chosen_method where id=r.id returning * into r;
 update budget_tracker.recurring_occurrences set payment_method_id=chosen_method where rule_id=r.id and state in ('outstanding','replacement') and scheduled_date>=today;
 perform budget_tracker.generate_occurrences(r.id,greatest(coalesce(r.preview_through,today),(date_trunc('month',today)+interval '1 month - 1 day')::date));
 return r;
end $$;



create or replace function budget_tracker.prepare_dashboard(p_month date) returns void language plpgsql security definer set search_path='' as $$
declare zone text; today date; current_month date; through date; r record; o budget_tracker.recurring_occurrences; tx_id uuid; cursor date; prior budget_tracker.monthly_limits;
begin
 perform budget_tracker.financial_lock();
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 if zone is null then raise exception 'Set your timezone first' using errcode='22023'; end if;
 today:=(now() at time zone zone)::date; current_month:=date_trunc('month',today)::date;
 if not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date or p_month>current_month+interval '2 years' then raise exception 'Choose a month within the next two years' using errcode='22023'; end if;
 if p_month=current_month and not exists(select from budget_tracker.monthly_limits where user_id=auth.uid() and month=p_month) then
  select * into prior from budget_tracker.monthly_limits where user_id=auth.uid() and month<p_month order by month desc limit 1;
  if found then insert into budget_tracker.monthly_limits(user_id,month,amount,inherited_from) values(auth.uid(),p_month,prior.amount,prior.month) on conflict do nothing; end if;
 end if;
 through:=greatest(today,(p_month+interval '1 month - 1 day')::date);
 for r in select id from budget_tracker.recurring_rules where user_id=auth.uid() and active and not archived order by id loop
  perform budget_tracker.generate_occurrences(r.id,through);
 end loop;
 for o in select x.* from budget_tracker.recurring_occurrences x join budget_tracker.recurring_rules rr on rr.id=x.rule_id where x.user_id=auth.uid() and rr.active and not rr.archived and x.state='outstanding' and x.scheduled_date<=today order by x.rule_id,x.scheduled_date for update of x loop
  tx_id:=gen_random_uuid();
  insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,transaction_date,recurring_rule_id,spending_source,occurrence_id,payment_method_id)
   values(tx_id,auth.uid(),'expense',o.category_id,o.amount,o.label,(o.scheduled_date+time '12:00') at time zone zone,o.scheduled_date,o.rule_id,'recurring',o.id,o.payment_method_id);
  update budget_tracker.recurring_occurrences set state='recorded',transaction_id=tx_id where id=o.id;
 end loop;
 for r in select * from budget_tracker.recurring_rules where user_id=auth.uid() and active and not archived order by id loop
  cursor:=r.next_occurrence_date;
  while cursor<=today loop cursor:=budget_tracker.next_rule_date(cursor,r.frequency,r.anchor_day,r.month_end); end loop;
  update budget_tracker.recurring_rules set next_occurrence_date=cursor where id=r.id;
 end loop;
end $$;




create function budget_tracker.delete_transaction(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare t budget_tracker.transactions;
begin
 perform budget_tracker.financial_lock();select * into t from budget_tracker.transactions where id=p_id and user_id=auth.uid() for update;
 if not found then return;end if;
 if t.occurrence_id is not null then perform budget_tracker.bill_command(t.occurrence_id,'skip');else delete from budget_tracker.transactions where id=t.id and user_id=auth.uid();end if;
end $$;
revoke all on function budget_tracker.delete_transaction(uuid) from public,anon;
grant execute on function budget_tracker.delete_transaction(uuid) to authenticated;

notify pgrst, 'reload schema';

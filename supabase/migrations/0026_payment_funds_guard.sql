-- Guard bill payments/transfers. Already-paid ordinary expenses remain recordable.
-- Historical maintenance writes without a user JWT keep their existing behavior.
create function budget_tracker.guard_transaction_funds() returns trigger
language plpgsql security definer set search_path='' as $$
declare m budget_tracker.payment_methods; zone text; today date; old_day date; old_effect numeric:=0; required numeric; available numeric;
begin
 if auth.uid() is null or new.type<>'expense' or new.occurrence_id is null then return new;end if;
 perform budget_tracker.financial_lock();
 if new.user_id<>auth.uid() then raise exception 'Transaction unavailable' using errcode='42501';end if;
 if tg_op='UPDATE' and new.amount=old.amount and new.type=old.type
  and new.payment_method_id is not distinct from old.payment_method_id
  and new.transaction_date is not distinct from old.transaction_date and new.occurred_at=old.occurred_at
 then return new;end if;
 select * into m from budget_tracker.payment_methods where user_id=auth.uid()
  and (id=new.payment_method_id or (new.payment_method_id is null and method='cash')) for share;
 if m.method='card' and m.payment_type='Credit card' then return new;end if;
 if m.id is null or m.baseline_at is null then raise exception 'Set an initial balance before paying.' using errcode='BT002';end if;
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();today:=(now() at time zone zone)::date;
 if tg_op='UPDATE' then
  old_day:=coalesce(old.transaction_date,(old.occurred_at at time zone zone)::date);
  if (old.payment_method_id=m.id or (m.method='cash' and old.payment_method_id is null)) and old_day<=today
    and (old.payment_assigned_at>=m.baseline_at or old_day>(m.baseline_at at time zone zone)::date)
  then old_effect:=case when old.type='expense' then -old.amount else old.amount end;end if;
 end if;
 required:=new.amount+old_effect;
 if required<=0 then return new;end if;
 available:=budget_tracker.method_balance(m.id);
 if available is null or required>available then raise exception 'Insufficient balance. Choose another payment method.' using errcode='BT001';end if;
 return new;
end $$;
revoke all on function budget_tracker.guard_transaction_funds() from public,anon,authenticated;
create trigger zz_transaction_funds_guard before insert or update on budget_tracker.transactions
 for each row execute function budget_tracker.guard_transaction_funds();

create function budget_tracker.guard_transfer_funds() returns trigger
language plpgsql security definer set search_path='' as $$
declare m budget_tracker.payment_methods; zone text; today date; old_effect numeric:=0; required numeric; available numeric;
begin
 if auth.uid() is null then return new;end if;
 perform budget_tracker.financial_lock();
 if new.user_id<>auth.uid() then raise exception 'Transfer unavailable' using errcode='42501';end if;
 if tg_op='UPDATE' and new.amount=old.amount and new.source_id=old.source_id and new.destination_id=old.destination_id and new.transfer_date=old.transfer_date then return new;end if;
 select * into m from budget_tracker.payment_methods where id=new.source_id and user_id=auth.uid() for share;
 if m.method='card' and m.payment_type='Credit card' then return new;end if;
 if m.id is null or m.baseline_at is null then raise exception 'Set an initial balance before transferring.' using errcode='BT002';end if;
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();today:=(now() at time zone zone)::date;
 if tg_op='UPDATE' and old.transfer_date<=today then
  if old.source_id=m.id and (old.source_assigned_at>=m.baseline_at or old.transfer_date>(m.baseline_at at time zone zone)::date) then old_effect:=old_effect-old.amount;end if;
  if old.destination_id=m.id and (old.destination_assigned_at>=m.baseline_at or old.transfer_date>(m.baseline_at at time zone zone)::date) then old_effect:=old_effect+old.amount;end if;
 end if;
 required:=new.amount+old_effect;if required<=0 then return new;end if;
 available:=budget_tracker.method_balance(m.id);
 if available is null or required>available then raise exception 'Insufficient balance. Choose another source method.' using errcode='BT001';end if;
 return new;
end $$;
revoke all on function budget_tracker.guard_transfer_funds() from public,anon,authenticated;
create trigger zz_transfer_funds_guard before insert or update on budget_tracker.payment_transfers
 for each row execute function budget_tracker.guard_transfer_funds();

create function budget_tracker.require_bill_funds(p_method uuid,p_amount numeric) returns void
language plpgsql security definer set search_path='' as $$
declare m budget_tracker.payment_methods; available numeric;
begin
 perform budget_tracker.financial_lock();
 select * into m from budget_tracker.payment_methods where user_id=auth.uid()
  and (id=p_method or (p_method is null and method='cash')) for share;
 if m.method='card' and m.payment_type='Credit card' then return;end if;
 if m.id is null or m.baseline_at is null then raise exception 'Balance not set. Set an initial balance before paying.' using errcode='BT002';end if;
 available:=budget_tracker.method_balance(m.id);
 if p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid payment amount' using errcode='22023';end if;
 if available is null or p_amount>available then raise exception 'Insufficient balance. Choose another payment method.' using errcode='BT001';end if;
end $$;
revoke all on function budget_tracker.require_bill_funds(uuid,numeric) from public,anon,authenticated;

-- Record creates the expense before linking it; enforce funds before that insert.
-- Existing UUID retries and linking already-paid expenses must not charge twice.
do $patch_bill$
declare definition text; before_text text; after_text text;
begin
 select pg_get_functiondef('budget_tracker.bill_command(uuid,text,jsonb,jsonb,boolean)'::regprocedure) into definition;
 before_text:=$before$  t:=budget_tracker.save_transaction(payload,p_items);
  if t.amount<>o.amount$before$;
 after_text:=$after$  if p_command='record' and not exists(select from budget_tracker.transactions where id=(payload->>'id')::uuid and user_id=auth.uid()) then
   perform budget_tracker.require_bill_funds((payload->>'payment_method_id')::uuid,(payload->>'amount')::numeric);
  end if;
  t:=budget_tracker.save_transaction(payload,p_items);
  if t.amount<>o.amount$after$;
 if strpos(definition,before_text)=0 then raise exception 'Bill implementation differs; funds guard not applied';end if;
 execute replace(definition,before_text,after_text);
end $patch_bill$;

-- A due bill with insufficient/unset funds stays outstanding and reserved.
-- One blocked bill must never prevent the dashboard from loading.
do $patch$
declare definition text; before_text text; after_text text;
begin
 select pg_get_functiondef('budget_tracker.prepare_dashboard(date)'::regprocedure) into definition;
 before_text:=$before$  tx_id:=gen_random_uuid();
  insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,transaction_date,recurring_rule_id,spending_source,occurrence_id,payment_method_id)
   values(tx_id,auth.uid(),'expense',o.category_id,o.amount,o.label,(o.scheduled_date+time '12:00') at time zone zone,o.scheduled_date,o.rule_id,'recurring',o.id,o.payment_method_id);
  update budget_tracker.recurring_occurrences set state='recorded',transaction_id=tx_id where id=o.id;$before$;
 after_text:=$after$  begin
   tx_id:=gen_random_uuid();
   insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,transaction_date,recurring_rule_id,spending_source,occurrence_id,payment_method_id)
    values(tx_id,auth.uid(),'expense',o.category_id,o.amount,o.label,(o.scheduled_date+time '12:00') at time zone zone,o.scheduled_date,o.rule_id,'recurring',o.id,o.payment_method_id);
   update budget_tracker.recurring_occurrences set state='recorded',transaction_id=tx_id where id=o.id;
  exception when sqlstate 'BT001' or sqlstate 'BT002' then null;
  end;$after$;
 if strpos(definition,before_text)=0 then raise exception 'Dashboard implementation differs; funds guard not applied';end if;
 execute replace(definition,before_text,after_text);
end $patch$;

create function budget_tracker.pay_bill(p_occurrence uuid,p_payment_method uuid,p_transaction_id uuid,p_expected_amount text,p_expected_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o budget_tracker.recurring_occurrences; zone text; payload jsonb;
begin
 perform budget_tracker.financial_lock();
 if p_transaction_id is null then raise exception 'Payment identifier required' using errcode='22023';end if;
 select * into o from budget_tracker.recurring_occurrences where id=p_occurrence and user_id=auth.uid() for update;
 if o.id is null then raise exception 'Bill unavailable' using errcode='42501';end if;
 if p_expected_amount is null or p_expected_amount !~ '^[0-9]+\.[0-9]{2}$' or p_expected_date is null
  or p_expected_amount::numeric<>o.amount or p_expected_date<>o.scheduled_date
 then raise exception 'Bill changed. Refresh its details before paying.' using errcode='40001';end if;
 if o.state not in ('outstanding','replacement','recorded') then raise exception 'Bill is no longer payable' using errcode='22023';end if;
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 payload:=jsonb_build_object('id',p_transaction_id,'operation','create','payload_version',4,'type','expense',
  'category_id',o.category_id,'amount',o.amount::text,'note',o.label,'transaction_date',o.scheduled_date,
  'occurred_at',(o.scheduled_date+time '12:00') at time zone zone,'payment_method_id',p_payment_method);
 return budget_tracker.bill_command(o.id,'record',payload,'[]'::jsonb,false);
end $$;
revoke all on function budget_tracker.pay_bill(uuid,uuid,uuid,text,date) from public,anon;
grant execute on function budget_tracker.pay_bill(uuid,uuid,uuid,text,date) to authenticated;
notify pgrst,'reload schema';

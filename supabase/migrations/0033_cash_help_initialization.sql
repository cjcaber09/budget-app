-- An old client/server cannot silently discard an initialize-only condition.
create function budget_tracker.initialize_cash_balance(p_method_id uuid,p_amount text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();cash budget_tracker.payment_methods;amount numeric;
begin
 if owner_id is null then raise exception 'Sign in again' using errcode='42501';end if;
 perform budget_tracker.financial_lock();
 select * into cash from budget_tracker.payment_methods
 where id=p_method_id and user_id=owner_id and method='cash' and not archived for update;
 if cash.id is null then raise exception 'Cash unavailable. Refresh and retry' using errcode='42501';end if;
 if p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' then
  raise exception 'Enter a nonnegative Cash amount with up to two decimal places' using errcode='22023';
 end if;
 amount:=p_amount::numeric;
 if amount>9999999999.99 then raise exception 'Cash amount is too large' using errcode='22023';end if;
 if cash.opening_balance is not null then
  return jsonb_build_object('owner',owner_id,'methodId',cash.id,'state','already_initialized');
 end if;
 perform budget_tracker.save_payment_method(jsonb_build_object('id',cash.id,'operation','update',
  'method','cash','paymentType',cash.payment_type,'name',cash.name,'lastFour',null,'openingBalance',p_amount));
 return jsonb_build_object('owner',owner_id,'methodId',cash.id,'state','initialized');
end $$;
revoke all on function budget_tracker.initialize_cash_balance(uuid,text) from public,anon;
grant execute on function budget_tracker.initialize_cash_balance(uuid,text) to authenticated;
notify pgrst,'reload schema';

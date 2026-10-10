-- Category allocations share a cap; all client writes acquire the owner lock first.
revoke all on budget_tracker.budgets,budget_tracker.monthly_limits from public,anon,authenticated;
grant select on budget_tracker.budgets,budget_tracker.monthly_limits to authenticated;

create function budget_tracker.guard_monthly_allowance() returns trigger
language plpgsql security definer set search_path='' as $$
declare allocated numeric;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,371));
 select coalesce(sum(amount),0) into allocated from budget_tracker.budgets where user_id=new.user_id and month=new.month;
 if new.amount<allocated then
  -- Automatic inheritance must not block dashboard loading for legacy excess.
  if tg_op='INSERT' and new.inherited_from is not null then return null;end if;
  raise exception 'Monthly allowance cannot be less than combined category budgets. Reduce category budgets first.' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function budget_tracker.guard_monthly_allowance() from public,anon,authenticated;
create trigger monthly_allowance_cap before insert or update on budget_tracker.monthly_limits
 for each row execute function budget_tracker.guard_monthly_allowance();

create function budget_tracker.set_monthly_allowance(p_month date,p_amount text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform budget_tracker.financial_lock();
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date
  or p_month not between date '0001-01-01' and date '9999-12-01'
  or p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' then
  raise exception 'Enter a valid month and monthly allowance.' using errcode='22023';
 end if;
 insert into budget_tracker.monthly_limits(user_id,month,amount,inherited_from)
 values(auth.uid(),p_month,p_amount::numeric,null)
 on conflict(user_id,month) do update set amount=excluded.amount,inherited_from=null;
end $$;
revoke all on function budget_tracker.set_monthly_allowance(date,text) from public,anon;
grant execute on function budget_tracker.set_monthly_allowance(date,text) to authenticated;

create function budget_tracker.set_category_budget(p_category uuid,p_month date,p_amount text) returns void
language plpgsql security definer set search_path='' as $$
declare limit_row budget_tracker.monthly_limits;previous budget_tracker.budgets;allocated numeric;next_amount numeric;today date;zone text;
begin
 perform budget_tracker.financial_lock();
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date
  or p_month not between date '0001-01-01' and date '9999-12-01'
  or p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' then
  raise exception 'Enter a valid month and category budget.' using errcode='22023';
 end if;
 perform 1 from budget_tracker.categories where id=p_category and user_id=auth.uid() for key share;
 if not found then raise exception 'Category unavailable.' using errcode='42501';end if;
 next_amount:=p_amount::numeric;
 select * into previous from budget_tracker.budgets where user_id=auth.uid() and category_id=p_category and month=p_month;
 select coalesce(sum(amount),0) into allocated from budget_tracker.budgets where user_id=auth.uid() and month=p_month;
 select * into limit_row from budget_tracker.monthly_limits where user_id=auth.uid() and month=p_month;
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 today:=(now() at time zone coalesce(zone,'UTC'))::date;
 if limit_row.user_id is null and p_month>=date_trunc('month',today)::date then
  select * into limit_row from budget_tracker.monthly_limits where user_id=auth.uid() and month<p_month order by month desc limit 1;
 end if;
 if next_amount>0 and limit_row.user_id is null and not(next_amount<coalesce(previous.amount,0)) then
  raise exception 'Set a monthly allowance before allocating category budgets.' using errcode='22023';
 end if;
 if limit_row.user_id is not null and allocated-coalesce(previous.amount,0)+next_amount>limit_row.amount
  and not(next_amount<coalesce(previous.amount,0)) then
  raise exception 'Combined category budgets cannot exceed the monthly allowance.' using errcode='22023';
 end if;
 insert into budget_tracker.budgets(user_id,category_id,month,amount) values(auth.uid(),p_category,p_month,next_amount)
 on conflict(user_id,category_id,month) do update set amount=excluded.amount;
 if limit_row.user_id is not null and limit_row.month<>p_month then
  insert into budget_tracker.monthly_limits(user_id,month,amount,inherited_from)
  values(auth.uid(),p_month,limit_row.amount,limit_row.month) on conflict(user_id,month) do nothing;
 end if;
end $$;
revoke all on function budget_tracker.set_category_budget(uuid,date,text) from public,anon;
grant execute on function budget_tracker.set_category_budget(uuid,date,text) to authenticated;
notify pgrst,'reload schema';

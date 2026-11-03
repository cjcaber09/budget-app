-- Read-only reconstructed running balances; existing balance/write rules stay authoritative.
create function budget_tracker.activity_balance_history(p_entries jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();zone text;today date;result jsonb;
begin
 if owner_id is null or not budget_tracker.account_is_active(owner_id) then raise exception 'Sign in again' using errcode='42501';end if;
 select timezone into zone from budget_tracker.profiles where user_id=owner_id;
 if zone is null then raise exception 'Preferences unavailable' using errcode='42501';end if;
 today:=(now() at time zone zone)::date;
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Invalid activity request' using errcode='22023';end if;
 if jsonb_array_length(p_entries)>100 or exists(select from jsonb_array_elements(p_entries) e
  where jsonb_typeof(e) is distinct from 'object' or e->>'kind' is null or e->>'kind' not in ('transaction','transfer','refund','correction')
  or jsonb_typeof(e->'id') is distinct from 'string' or e->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 then raise exception 'Invalid activity request' using errcode='22023';end if;
 with requested as (
  select distinct e->>'kind' kind,(e->>'id')::uuid id from jsonb_array_elements(p_entries) e
 ), raw_moves as (
  select case when t.transfer_id is null then 'transaction' else 'transfer' end kind,coalesce(t.transfer_id,t.id) id,m.id method_id,
   case when t.type='income' then t.amount else -t.amount end delta,
   coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date) financial_day,t.payment_assigned_at assigned_at
  from budget_tracker.transactions t join budget_tracker.payment_methods m on m.user_id=t.user_id
   and (m.id=t.payment_method_id or (t.payment_method_id is null and m.method='cash')) where t.user_id=owner_id
  union all
  select 'transfer',f.id,m.id,case when m.id=f.source_id then -f.amount else f.amount end,f.transfer_date,
   case when m.id=f.source_id then f.source_assigned_at else f.destination_assigned_at end
  from budget_tracker.payment_transfers f join budget_tracker.payment_methods m on m.user_id=f.user_id and m.id in(f.source_id,f.destination_id) where f.user_id=owner_id
  union all
  select 'refund',r.id,r.method_id,r.amount,r.refund_date,r.assigned_at from budget_tracker.refunds r where r.user_id=owner_id
  union all
  select 'correction',c.id,c.method_id,c.delta,(c.created_at at time zone zone)::date,c.created_at from budget_tracker.balance_corrections c where c.user_id=owner_id
 ), events as (
  -- Fee rows share the source's assignment/date and are included once in that transfer.
  select kind,id,method_id,financial_day,assigned_at,sum(delta) delta from raw_moves group by kind,id,method_id,financial_day,assigned_at
 ), classified as (
  select e.*,m.opening_balance,m.method,m.payment_type,m.name,
   greatest(e.assigned_at,e.financial_day::timestamp at time zone zone) effective_at,
   case when m.baseline_at is null then 'unset'
    when not(e.assigned_at>=m.baseline_at or e.financial_day>(m.baseline_at at time zone zone)::date) then 'opening'
    when e.kind<>'correction' and e.financial_day>today then 'scheduled' else 'applied' end state
  from events e join budget_tracker.payment_methods m on m.id=e.method_id and m.user_id=owner_id
 ), running as (
  select c.*,opening_balance+sum(case when state='applied' then delta else 0 end) over(
   partition by method_id order by effective_at,kind,id rows between unbounded preceding and current row) after_balance from classified c
 ), totals as (
  select method_id,opening_balance+sum(case when state='applied' then delta else 0 end) balance from classified group by method_id,opening_balance
 )
 select jsonb_build_object('owner',owner_id,'timezone',zone,'today',today,
  'reconciled',coalesce((select bool_and(balance is not distinct from budget_tracker.method_balance(method_id)) from totals),true),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('kind',q.kind,'id',q.id,'accounts',
   coalesce((select jsonb_agg(jsonb_build_object('methodId',r.method_id,'name',r.name,'method',r.method,'paymentType',r.payment_type,
    'state',r.state,'changeCents',budget_tracker.report_cents(r.delta),
    'beforeCents',case when r.state='applied' then budget_tracker.report_cents(r.after_balance-r.delta) end,
    'afterCents',case when r.state='applied' then budget_tracker.report_cents(r.after_balance) end)
    order by r.delta,r.method_id) from running r where r.kind=q.kind and r.id=q.id),'[]')) order by q.kind,q.id) from requested q),'[]')) into result;
 if not(result->>'reconciled')::boolean then raise exception 'Account balances could not be reconciled. Refresh and retry.' using errcode='22023';end if;
 return result;
end $$;
revoke all on function budget_tracker.activity_balance_history(jsonb) from public,anon;
grant execute on function budget_tracker.activity_balance_history(jsonb) to authenticated;
notify pgrst,'reload schema';

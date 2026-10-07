create function budget_tracker.dashboard_snapshot(p_month date) returns jsonb language sql stable security invoker set search_path='' as $$
 with prefs as (select timezone from budget_tracker.profiles where user_id=auth.uid()),
 context as (select timezone,(now() at time zone timezone)::date as today from prefs),
 tx as (select t.*,coalesce(t.transaction_date,(t.occurred_at at time zone c.timezone)::date) as day from budget_tracker.transactions t cross join context c where t.user_id=auth.uid()),
 monthly as (select * from tx where day>=p_month and day<(p_month+interval '1 month')::date),
 totals as (select
 coalesce(sum(amount) filter(where type='income'),0)*100 income,
 coalesce(sum(amount) filter(where type='expense'),0)*100 expenses,
 coalesce(sum(amount) filter(where type='expense' and day<=(select today from context)),0)*100 spent_to_date,
 coalesce(sum(amount) filter(where type='expense' and day>(select today from context)),0)*100 future_recorded,
 coalesce(sum(amount) filter(where type='expense' and day<=(select today from context) and occurrence_id is null and spending_source='manual'),0)*100 discretionary_to_date,
 coalesce(sum(amount) filter(where type='expense' and day>(select today from context) and occurrence_id is null and spending_source='manual'),0)*100 future_discretionary from monthly),
 limits as (select amount*100 as amount,false as preview from budget_tracker.monthly_limits where user_id=auth.uid() and month=p_month
 union all select amount*100,true from budget_tracker.monthly_limits where user_id=auth.uid() and month=(select max(month) from budget_tracker.monthly_limits where user_id=auth.uid() and month<p_month)
 and p_month>date_trunc('month',(select today from context))::date and not exists(select from budget_tracker.monthly_limits where user_id=auth.uid() and month=p_month)),
 bills as (select o.* from budget_tracker.recurring_occurrences o join budget_tracker.recurring_rules r on r.id=o.rule_id where o.user_id=auth.uid() and o.scheduled_date>=p_month and o.scheduled_date<(p_month+interval '1 month')::date and (o.state='recorded' or (r.active and not r.archived))),
 categories as (select c.id,c.name,c.color,coalesce(sum(m.amount),0)*100 as spent from budget_tracker.categories c left join monthly m on m.category_id=c.id and m.type='expense' where c.user_id=auth.uid() group by c.id,c.name,c.color)
 select jsonb_build_object('today',c.today,'timezone',c.timezone,'complete',true,'month',p_month,
 'limitCents',(select amount from limits limit 1),'preview',coalesce((select preview from limits limit 1),false),
 'allocatedCents',(select coalesce(sum(amount),0)*100 from budget_tracker.budgets where user_id=auth.uid() and month=p_month),
 'incomeCents',t.income,'expenseCents',t.expenses,'spentToDateCents',t.spent_to_date,'futureRecordedCents',t.future_recorded,
 'discretionaryToDateCents',t.discretionary_to_date,'futureDiscretionaryCents',t.future_discretionary,
 'reservedCents',(select coalesce(sum(amount),0)*100 from bills where state in ('outstanding','replacement')),
 'bills',(select coalesce(jsonb_agg(to_jsonb(b) order by scheduled_date,id),'[]') from bills b),
 'categoryTotals',(select coalesce(jsonb_agg(to_jsonb(cat)),'[]') from categories cat),
 'legacyDuplicates',(select count(*) from monthly where spending_source='recurring' and occurrence_id is null))
 from context c cross join totals t
$$;
create function budget_tracker.monthly_expense_totals(p_start date,p_end date) returns table(month date,total numeric) language sql stable security invoker set search_path='' as $$
 with prefs as (select timezone from budget_tracker.profiles where user_id=auth.uid()),
 t as (select amount,coalesce(transaction_date,(occurred_at at time zone timezone)::date) as day from budget_tracker.transactions cross join prefs where user_id=auth.uid() and type='expense')
 select date_trunc('month',day)::date,sum(amount) from t where day>=p_start and day<p_end group by 1 order by 1
$$;
revoke all on function budget_tracker.dashboard_snapshot(date),budget_tracker.monthly_expense_totals(date,date) from public,anon;
grant execute on function budget_tracker.dashboard_snapshot(date),budget_tracker.monthly_expense_totals(date,date) to authenticated;
notify pgrst,'reload schema';

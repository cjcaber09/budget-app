-- Complete export envelopes, independent of PostgREST's row limit.
create function budget_tracker.report_export_snapshot(p_start_month date,p_end_month date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); zone text; unit text; today date; m date; result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 select timezone,currency into zone,unit from budget_tracker.profiles where user_id=owner_id;
 if zone is null then raise exception 'Saved preferences required' using errcode='22023';end if;
 today:=(now() at time zone zone)::date;
 if p_start_month is null or p_end_month is null or not isfinite(p_start_month) or not isfinite(p_end_month)
 or p_start_month<>date_trunc('month',p_start_month)::date or p_end_month<>date_trunc('month',p_end_month)::date
 or p_start_month<date '0001-12-01' or p_end_month>(date_trunc('month',today)+interval '2 years')::date
 or (p_end_month<>p_start_month and p_end_month<>(p_start_month+interval '11 months')::date) then raise exception 'Unsupported export period' using errcode='22023';end if;
 perform budget_tracker.financial_lock();
 for m in select generate_series(p_start_month,p_end_month,interval '1 month')::date loop perform budget_tracker.prepare_dashboard(m);end loop;
 -- All exported amounts and labels below are read in one statement snapshot.
 with months as(select generate_series(p_start_month,p_end_month,interval '1 month')::date as month),
 tx as(select t.*,date_trunc('month',coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date))::date as month
  from budget_tracker.transactions t where t.user_id=owner_id and coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date)>=p_start_month
  and coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date)<(p_end_month+interval '1 month')::date),
 summaries as(select m.month,coalesce(sum(t.amount)filter(where t.type='income'),0) income,coalesce(sum(t.amount)filter(where t.type='expense'),0) spending,
  count(t.id)filter(where t.type='expense') expense_count from months m left join tx t using(month) group by m.month),
 categories as(select m.month,c.id::text identifier,c.name,coalesce(sum(t.amount),0) spending,count(t.id) expense_count
  from months m cross join budget_tracker.categories c left join tx t on t.month=m.month and t.category_id=c.id and t.type='expense'
  where c.user_id=owner_id group by m.month,c.id,c.name
  union all select m.month,'uncategorized','Uncategorized',coalesce(sum(t.amount),0),count(t.id) from months m left join tx t on t.month=m.month and t.category_id is null and t.type='expense' group by m.month),
 accounts as(select m.month,a.id::text identifier,a.name,a.payment_type,a.last_four,a.archived,coalesce(sum(t.amount),0) spending,count(t.id) expense_count
  from months m cross join budget_tracker.payment_methods a left join tx t on t.month=m.month and t.payment_method_id=a.id and t.type='expense'
  where a.user_id=owner_id and a.method<>'cash' group by m.month,a.id,a.name,a.payment_type,a.last_four,a.archived
  having not a.archived or count(t.id)>0
  union all select m.month,'cash','Cash','Cash',null,false,coalesce(sum(t.amount),0),count(t.id) from months m left join tx t
  on t.month=m.month and t.type='expense' and (t.payment_method_id is null or t.payment_method_id in(select id from budget_tracker.payment_methods where user_id=owner_id and method='cash')) group by m.month),
 rows as(select month,0 kind,spending,expense_count,'' identifier,jsonb_build_object('row_type','monthly','month',month,'income',budget_tracker.report_cents(income),'spending',budget_tracker.report_cents(spending),'net_income',budget_tracker.report_cents(income-spending),'expense_count',expense_count) row from summaries
  union all select month,1,spending,expense_count,identifier,jsonb_build_object('row_type','category','month',month,'identifier',identifier,'name',name,'spending',budget_tracker.report_cents(spending),'expense_count',expense_count) from categories
  union all select month,2,spending,expense_count,identifier,jsonb_build_object('row_type','account','month',month,'identifier',identifier,'name',name,'payment_type',payment_type,'last_four',last_four,'archived',archived,'spending',budget_tracker.report_cents(spending),'expense_count',expense_count) from accounts)
 select jsonb_build_object('owner',owner_id,'start',p_start_month,'end',p_end_month,'timezone',zone,'currency',unit,'generated_at',now(),
  'rows',coalesce(jsonb_agg(row order by month,kind,spending desc,expense_count desc,identifier),'[]')) into result from rows;
 return result;
end $$;
revoke all on function budget_tracker.report_export_snapshot(date,date) from public,anon;
grant execute on function budget_tracker.report_export_snapshot(date,date) to authenticated;

create function budget_tracker.transaction_export_snapshot(p_month date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();zone text;unit text;result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 select timezone,currency into zone,unit from budget_tracker.profiles where user_id=owner_id;
 if zone is null then raise exception 'Saved preferences required' using errcode='22023';end if;
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date or p_month<date '0001-12-01'
 or p_month>(date_trunc('month',now() at time zone zone)+interval '2 years')::date then raise exception 'Unsupported export period' using errcode='22023';end if;
 perform budget_tracker.financial_lock();
 select jsonb_build_object('owner',owner_id,'start',p_month,'end',p_month,'timezone',zone,'currency',unit,'generated_at',now(),
 'rows',coalesce(jsonb_agg(jsonb_build_object('transaction_id',t.id,'financial_date',coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date),
 'type',t.type,'amount',budget_tracker.report_cents(t.amount),'category',case when t.type='expense' then coalesce(c.name,'Uncategorized') else '' end,'search_category',coalesce(c.name,''),'payment_account_id',coalesce(a.id::text,'cash'),
 'payment_account',coalesce(a.name,'Cash'),'payment_type',coalesce(a.payment_type,'Cash'),'last_four',a.last_four,
 'income_source',case when t.type='income' then coalesce(s.name,'Unspecified') else '' end,'note',t.note,
 'spending_source',case when t.recurring_rule_id is null then 'manual' else 'recurring' end)
 order by coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date) desc,t.occurred_at desc,t.id desc),'[]')) into result
 from budget_tracker.transactions t left join budget_tracker.categories c on c.id=t.category_id and c.user_id=owner_id
 left join budget_tracker.payment_methods a on a.id=t.payment_method_id and a.user_id=owner_id
 left join budget_tracker.income_sources s on s.id=t.income_source_id and s.user_id=owner_id
 where t.user_id=owner_id and coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date)>=p_month
 and coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date)<(p_month+interval '1 month')::date;
 return result;
end $$;
revoke all on function budget_tracker.transaction_export_snapshot(date) from public,anon;
grant execute on function budget_tracker.transaction_export_snapshot(date) to authenticated;
notify pgrst,'reload schema';

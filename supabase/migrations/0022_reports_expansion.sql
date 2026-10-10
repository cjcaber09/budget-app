create function budget_tracker.report_cents(p_amount numeric) returns text language sql immutable strict set search_path='' as $$select trunc(p_amount*100)::text$$;
revoke all on function budget_tracker.report_cents(numeric) from public,anon;
grant execute on function budget_tracker.report_cents(numeric) to authenticated;

create function budget_tracker.reporting_snapshot(p_month date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); zone text; today date; stop date; oldest date; previous date; compare_stop date; previous_stop date; result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 select timezone into zone from budget_tracker.profiles where user_id=owner_id;
 if zone is null then raise exception 'Saved financial preferences are unavailable; retry' using errcode='22023';end if;
 today:=(now() at time zone zone)::date;
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date or p_month<date '0001-12-01' or p_month>least(date '9999-12-01',(date_trunc('month',today)+interval '2 years')::date) then raise exception 'Unsupported reporting month' using errcode='22023';end if;
 perform budget_tracker.prepare_dashboard(p_month);
 stop:=(p_month+interval '1 month')::date;oldest:=(p_month-interval '11 months')::date;previous:=(p_month-interval '1 month')::date;
 if p_month<=date_trunc('month',today)::date then
  compare_stop:=case when p_month=date_trunc('month',today)::date then today+1 else stop end;
  previous_stop:=case when p_month=date_trunc('month',today)::date then least(p_month,previous+(today-p_month+1)) else p_month end;
 end if;
 with tx as (
  select t.*,coalesce(transaction_date,(occurred_at at time zone zone)::date) financial_day
  from budget_tracker.transactions t where t.user_id=owner_id
 ), monthly as(select * from tx where financial_day>=p_month and financial_day<stop),
 totals as(select coalesce(sum(amount)filter(where type='income'),0) income,coalesce(sum(amount)filter(where type='expense'),0) expense,count(*) count from monthly),
 cat as(
  select c.id::text key,c.id,c.name,c.color,b.amount budget,coalesce(sum(t.amount),0) spent,count(t.id) count
  from budget_tracker.categories c left join budget_tracker.budgets b on b.user_id=owner_id and b.category_id=c.id and b.month=p_month
  left join monthly t on t.category_id=c.id and t.type='expense' where c.user_id=owner_id group by c.id,b.amount
  union all
  select 'uncategorized',null,'Uncategorized','#69736A',null,coalesce(sum(amount),0),count(*) from monthly where type='expense' and category_id is null having count(*)>0
 ), sources as (
  select s.id::text key,s.id,s.name,s.archived,coalesce(sum(t.amount),0) amount,count(t.id) count
  from budget_tracker.income_sources s left join monthly t on t.income_source_id=s.id and t.type='income' where s.user_id=owner_id group by s.id having not s.archived or count(t.id)>0
  union all select 'unspecified',null,'Unspecified',false,coalesce(sum(amount),0),count(*) from monthly where type='income' and income_source_id is null
 ), accounts as (
  select m.id::text key,m.id,m.name,m.payment_type,m.last_four,m.archived,coalesce(sum(t.amount),0) amount,count(t.id) count
  from budget_tracker.payment_methods m left join monthly t on t.payment_method_id=m.id and t.type='expense' where m.user_id=owner_id and m.method<>'cash' group by m.id having not m.archived or count(t.id)>0
  union all select 'cash',null,'Cash','Cash',null,false,coalesce(sum(t.amount),0),count(t.id) from monthly t where t.type='expense' and (t.payment_method_id is null or t.payment_method_id in(select id from budget_tracker.payment_methods where user_id=owner_id and method='cash'))
 ), daily as (
  select d::date financial_day,coalesce(sum(t.amount),0) amount from generate_series(p_month::timestamp,(stop-1)::timestamp,interval '1 day') d
  left join monthly t on t.financial_day=d::date and t.type='expense' group by d
 ), weekly as (
  select greatest(p_month,date_trunc('week',financial_day)::date) financial_day,least(stop-1,(date_trunc('week',financial_day)+interval '6 days')::date) ending,sum(amount) amount from daily group by 1,2
 ), months as (
  select d::date bucket_month,coalesce(sum(t.amount),0) amount from generate_series(oldest::timestamp,p_month::timestamp,interval '1 month') d
  left join tx t on t.financial_day>=d::date and t.financial_day<(d+interval '1 month')::date and t.type='expense' group by d
 ), current_comparison as (
  select coalesce(sum(amount)filter(where type='income'),0) income,coalesce(sum(amount)filter(where type='expense'),0) expense
  from tx where financial_day>=p_month and financial_day<compare_stop
 ), prior_comparison as (
  select coalesce(sum(amount)filter(where type='income'),0) income,coalesce(sum(amount)filter(where type='expense'),0) expense
  from tx where financial_day>=previous and financial_day<previous_stop
 ), comparisons as (
  select c.id::text key,c.name,
   coalesce((select sum(amount) from tx where type='expense' and category_id=c.id and financial_day>=p_month and financial_day<compare_stop),0) current_amount,
   coalesce((select sum(amount) from tx where type='expense' and category_id=c.id and financial_day>=previous and financial_day<previous_stop),0) prior_amount
  from budget_tracker.categories c where user_id=owner_id
  union all select 'uncategorized','Uncategorized',
   coalesce((select sum(amount) from tx where type='expense' and category_id is null and financial_day>=p_month and financial_day<compare_stop),0),
   coalesce((select sum(amount) from tx where type='expense' and category_id is null and financial_day>=previous and financial_day<previous_stop),0)
 ), category_months as (
  select c.key,d::date bucket_month,coalesce(sum(t.amount),0) amount from cat c cross join generate_series(oldest::timestamp,p_month::timestamp,interval '1 month') d
  left join tx t on t.type='expense' and t.category_id is not distinct from c.id and t.financial_day>=d::date and t.financial_day<(d+interval '1 month')::date group by c.key,d
 )
 select jsonb_build_object(
  'owner',owner_id,'month',p_month,'timezone',zone,'today',today,'start',p_month,'end',stop,
  'totals',jsonb_build_object('income',budget_tracker.report_cents(a.income),'expense',budget_tracker.report_cents(a.expense),'net',budget_tracker.report_cents(a.income-a.expense),'count',a.count),
  'categories',(select coalesce(jsonb_agg(jsonb_build_object('key',key,'id',id,'name',name,'color',color,'budget',budget_tracker.report_cents(budget),'spent',budget_tracker.report_cents(spent),'count',count)order by name,key),'[]')from cat),
  'sources',(select coalesce(jsonb_agg(jsonb_build_object('key',key,'id',id,'name',name,'archived',archived,'amount',budget_tracker.report_cents(amount),'count',count)order by name,key),'[]')from sources),
  'accounts',(select coalesce(jsonb_agg(jsonb_build_object('key',key,'id',id,'name',name,'paymentType',payment_type,'lastFour',last_four,'archived',archived,'amount',budget_tracker.report_cents(amount),'count',count)order by name,key),'[]')from accounts),
  'daily',(select jsonb_agg(jsonb_build_object('day',financial_day,'amount',budget_tracker.report_cents(amount),'future',financial_day>today)order by financial_day)from daily),
  'weekly',(select jsonb_agg(jsonb_build_object('day',financial_day,'end',ending,'amount',budget_tracker.report_cents(amount),'future',financial_day>today)order by financial_day)from weekly),
  'monthly',(select jsonb_agg(jsonb_build_object('day',bucket_month,'amount',budget_tracker.report_cents(amount),'future',bucket_month>date_trunc('month',today)::date)order by bucket_month)from months),
  'categoryMonthly',(select coalesce(jsonb_agg(jsonb_build_object('key',key,'day',bucket_month,'amount',budget_tracker.report_cents(amount))order by key,bucket_month),'[]')from category_months),
  'comparison',case when compare_stop is null then null else jsonb_build_object(
   'start',p_month,'end',compare_stop,'previousStart',previous,'previousEnd',previous_stop,
   'current',jsonb_build_object('income',budget_tracker.report_cents(cc.income),'expense',budget_tracker.report_cents(cc.expense),'net',budget_tracker.report_cents(cc.income-cc.expense)),
   'previous',jsonb_build_object('income',budget_tracker.report_cents(pc.income),'expense',budget_tracker.report_cents(pc.expense),'net',budget_tracker.report_cents(pc.income-pc.expense)),
   'delta',jsonb_build_object('income',budget_tracker.report_cents(cc.income-pc.income),'expense',budget_tracker.report_cents(cc.expense-pc.expense),'net',budget_tracker.report_cents((cc.income-cc.expense)-(pc.income-pc.expense))),
   'categories',(select jsonb_agg(jsonb_build_object('key',key,'name',name,'current',budget_tracker.report_cents(current_amount),'previous',budget_tracker.report_cents(prior_amount),'delta',budget_tracker.report_cents(current_amount-prior_amount))order by name,key)from comparisons)
  )end
 )into result from totals a cross join current_comparison cc cross join prior_comparison pc;
 return result;
end $$;
revoke all on function budget_tracker.reporting_snapshot(date) from public,anon;
grant execute on function budget_tracker.reporting_snapshot(date) to authenticated;
-- JSON histories are complete in one database read, without shifting offset pages.
create function budget_tracker.report_transaction_history(p_month date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();zone text;result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 select timezone into zone from budget_tracker.profiles where user_id=owner_id;
 if zone is null then raise exception 'Saved financial preferences are unavailable' using errcode='22023';end if;
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date or p_month<date '0001-12-01' or p_month>(date_trunc('month',now() at time zone zone)+interval '2 years')::date then raise exception 'Invalid history month' using errcode='22023';end if;
 select jsonb_build_object('owner',owner_id,'month',p_month,'timezone',zone,'rows',coalesce(jsonb_agg(
  to_jsonb(t)||jsonb_build_object('amount',budget_tracker.report_cents(t.amount),'payment_method_kind',coalesce(m.method,'cash'),'financial_date',coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date))
  order by coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date) desc,t.occurred_at desc,t.id desc),'[]')) into result
 from budget_tracker.transactions t left join budget_tracker.payment_methods m on m.id=t.payment_method_id and m.user_id=owner_id
 where t.user_id=owner_id and coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date)>=p_month and coalesce(t.transaction_date,(t.occurred_at at time zone zone)::date)<(p_month+interval '1 month')::date;
 return result;
end $$;
revoke all on function budget_tracker.report_transaction_history(date) from public,anon;
grant execute on function budget_tracker.report_transaction_history(date) to authenticated;
create function budget_tracker.report_transfer_history(p_month date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();zone text;result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 select timezone into zone from budget_tracker.profiles where user_id=owner_id;
 if zone is null then raise exception 'Saved financial preferences are unavailable' using errcode='22023';end if;
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date or p_month<date '0001-12-01' or p_month>(date_trunc('month',now() at time zone zone)+interval '2 years')::date then raise exception 'Invalid history month' using errcode='22023';end if;
 select jsonb_build_object('owner',owner_id,'month',p_month,'timezone',zone,'rows',coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'transfer_date',f.transfer_date,'amount',budget_tracker.report_cents(f.amount),'source_id',f.source_id,'destination_id',f.destination_id,'source_name',s.name,'destination_name',d.name,'note',f.note)
  order by f.transfer_date desc,f.id desc),'[]')) into result
 from budget_tracker.payment_transfers f
 join budget_tracker.payment_methods s on s.id=f.source_id and s.user_id=owner_id
 join budget_tracker.payment_methods d on d.id=f.destination_id and d.user_id=owner_id
 where f.user_id=owner_id and f.transfer_date>=p_month and f.transfer_date<(p_month+interval '1 month')::date;
 return result;
end $$;
revoke all on function budget_tracker.report_transfer_history(date) from public,anon;
grant execute on function budget_tracker.report_transfer_history(date) to authenticated;
notify pgrst,'reload schema';

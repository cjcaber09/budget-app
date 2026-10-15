-- Read-only Overview lists. Never derive rankings from a paged client history.
create function budget_tracker.overview_highlights(p_month date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();zone text;today date;recent jsonb;categories jsonb;methods jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 select p.timezone into zone from budget_tracker.profiles p where p.user_id=owner_id;
 if zone is null then raise exception 'Profile unavailable' using errcode='42501';end if;
 today:=(now() at time zone zone)::date;
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date
 or p_month<date '0001-12-01' or p_month>(date_trunc('month',today)+interval '24 months')::date then
  raise exception 'Unsupported month' using errcode='22023';
 end if;

 select coalesce(jsonb_agg(a.row_data order by a.financial_date desc,a.sort_at desc,a.row_kind desc,a.activity_id desc),'[]') into recent
 from (select * from budget_tracker.activity_records(p_month)
 order by financial_date desc,sort_at desc,row_kind desc,activity_id desc limit 5) a;

 with monthly as (
  select t.category_id,t.amount from budget_tracker.financial_entries t
  where t.user_id=owner_id and t.type='expense' and
  ((t.transaction_date>=p_month and t.transaction_date<(p_month+interval '1 month')::date)
   or (t.transaction_date is null and t.occurred_at>=p_month::timestamp at time zone zone and t.occurred_at<(p_month+interval '1 month')::timestamp at time zone zone))
 ),ranked as (
  select c.id,coalesce(c.name,'Uncategorized') as name,coalesce(c.color,'#69736A') as color,sum(t.amount) as spent
  from monthly t left join budget_tracker.categories c on c.user_id=owner_id and c.id=t.category_id
  group by c.id,c.name,c.color having sum(t.amount)>0
  order by sum(t.amount) desc,lower(coalesce(c.name,'Uncategorized')),coalesce(c.id::text,'uncategorized') limit 5
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'key',coalesce(id::text,'uncategorized'),'name',name,'color',color,'spent',budget_tracker.report_cents(spent))
 order by spent desc,lower(name),coalesce(id::text,'uncategorized')),'[]') into categories from ranked;

 with monthly as (
  -- financial_activity retains the Refund type, so a refund never adds a use.
  select t.payment_method_id,t.type,t.amount from budget_tracker.financial_activity t
  where t.user_id=owner_id and t.type::text in ('expense','refund') and
  ((t.transaction_date>=p_month and t.transaction_date<(p_month+interval '1 month')::date)
   or (t.transaction_date is null and t.occurred_at>=p_month::timestamp at time zone zone and t.occurred_at<(p_month+interval '1 month')::timestamp at time zone zone))
 ),ranked as (
  select m.id,m.name,m.method,m.payment_type,m.last_four,m.archived,
   count(*) filter(where t.type::text='expense') as uses,
   sum(case when t.type::text='refund' then -t.amount else t.amount end) as spent
  from monthly t join budget_tracker.payment_methods m on m.user_id=owner_id
   and (m.id=t.payment_method_id or (t.payment_method_id is null and m.method='cash'))
  group by m.id,m.name,m.method,m.payment_type,m.last_four,m.archived
  having count(*) filter(where t.type::text='expense')>0
  order by count(*) filter(where t.type::text='expense') desc,
   sum(case when t.type::text='refund' then -t.amount else t.amount end) desc,lower(m.name),m.id limit 5
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'key',case when method='cash' then 'cash' else id::text end,'name',name,'paymentType',payment_type,'lastFour',last_four,'archived',archived,'count',uses,'spent',budget_tracker.report_cents(spent))
 order by uses desc,spent desc,lower(name),id),'[]') into methods from ranked;

 return jsonb_build_object('version',1,'owner',owner_id,'month',p_month,'timezone',zone,'today',today,
 'recent',recent,'categories',categories,'methods',methods);
end $$;
revoke all on function budget_tracker.overview_highlights(date) from public,anon;
grant execute on function budget_tracker.overview_highlights(date) to authenticated;
notify pgrst,'reload schema';

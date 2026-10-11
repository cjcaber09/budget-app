-- Interactive history is bounded; dedicated CSV/report reads remain complete.
create index transactions_dated_history on budget_tracker.transactions
  (user_id, transaction_date desc, occurred_at desc, id desc) where transaction_date is not null;
create index transactions_legacy_history on budget_tracker.transactions
  (user_id, occurred_at desc, id desc) where transaction_date is null;

create function budget_tracker.transaction_history_page(
 p_month date, p_type text default 'all', p_search text default '',
 p_before_date date default null, p_before_at timestamptz default null, p_before_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 owner_id uuid:=auth.uid(); zone text; end_month date; start_at timestamptz; end_at timestamptz;
 term text:=lower(btrim(coalesce(p_search,''))); page_rows jsonb; more boolean; last_row jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select timezone into zone from budget_tracker.profiles where user_id=owner_id;
 if zone is null then raise exception 'Saved preferences required' using errcode='22023'; end if;
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date
    or p_month<date '0001-01-01' or p_month>date '9999-12-01'
    or p_type is null or p_type not in ('all','income','expense') or length(term)>500
    or (p_before_date is null)<>(p_before_at is null) or (p_before_at is null)<>(p_before_id is null)
 then raise exception 'Invalid history request' using errcode='22023'; end if;
 end_month:=(p_month+interval '1 month')::date;
 if p_before_date is not null and (not isfinite(p_before_date) or not isfinite(p_before_at)
    or p_before_date<p_month or p_before_date>=end_month)
 then raise exception 'Invalid history cursor' using errcode='22023'; end if;
 start_at:=p_month::timestamp at time zone zone;
 end_at:=end_month::timestamp at time zone zone;
 with dated as (
  select t.*, t.transaction_date as financial_date
  from budget_tracker.transactions t
  left join budget_tracker.categories c on c.id=t.category_id and c.user_id=owner_id
  where t.user_id=owner_id and t.transaction_date>=p_month and t.transaction_date<end_month
    and (p_type='all' or t.type::text=p_type)
    and (term='' or strpos(lower(coalesce(c.name,'')||' '||coalesce(t.note,'')||' '||t.type::text||' '||trim_scale(t.amount)::text),term)>0)
    and (p_before_date is null or (t.transaction_date,t.occurred_at,t.id)<(p_before_date,p_before_at,p_before_id))
  order by t.transaction_date desc,t.occurred_at desc,t.id desc limit 11
 ), legacy as (
  select t.*, (t.occurred_at at time zone zone)::date as financial_date
  from budget_tracker.transactions t
  left join budget_tracker.categories c on c.id=t.category_id and c.user_id=owner_id
  where t.user_id=owner_id and t.transaction_date is null and t.occurred_at>=start_at and t.occurred_at<end_at
    and (p_type='all' or t.type::text=p_type)
    and (term='' or strpos(lower(coalesce(c.name,'')||' '||coalesce(t.note,'')||' '||t.type::text||' '||trim_scale(t.amount)::text),term)>0)
    and (p_before_date is null or ((t.occurred_at at time zone zone)::date,t.occurred_at,t.id)<(p_before_date,p_before_at,p_before_id))
  order by financial_date desc,t.occurred_at desc,t.id desc limit 11
 ), lookahead as (
  select * from (select * from dated union all select * from legacy) combined
  order by financial_date desc,occurred_at desc,id desc limit 11
 ), numbered as (
  select *,row_number() over(order by financial_date desc,occurred_at desc,id desc) as position from lookahead
 )
 select coalesce(jsonb_agg((to_jsonb(n)-'position')||jsonb_build_object('amount',n.amount::text)
   order by financial_date desc,occurred_at desc,id desc) filter(where position<=10),'[]'),count(*)>10
 into page_rows,more from numbered n;
 last_row:=page_rows->(jsonb_array_length(page_rows)-1);
 return jsonb_build_object('owner',owner_id,'month',p_month,'timezone',zone,'rows',page_rows,'has_more',more,
  'next',case when more then jsonb_build_object('date',last_row->>'financial_date','at',last_row->>'occurred_at','id',last_row->>'id') else null end);
end $$;
revoke all on function budget_tracker.transaction_history_page(date,text,text,date,timestamptz,uuid) from public,anon;
grant execute on function budget_tracker.transaction_history_page(date,text,text,date,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';

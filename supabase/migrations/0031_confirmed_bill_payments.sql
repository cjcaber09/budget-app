-- Schedules describe obligations. Only an explicit Record/Link command records payment.
create or replace function budget_tracker.prepare_dashboard(p_month date) returns void
language plpgsql security definer set search_path='' as $$
declare zone text; today date; current_month date; through date; r record; cursor date; prior budget_tracker.monthly_limits;
begin
 perform budget_tracker.financial_lock();
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 if zone is null then raise exception 'Set your timezone first' using errcode='22023';end if;
 today:=(now() at time zone zone)::date;current_month:=date_trunc('month',today)::date;
 if p_month is null or not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date
  or p_month not between date '0001-01-01' and date '9999-12-01' or p_month>current_month+interval '2 years'
 then raise exception 'Choose a supported month' using errcode='22023';end if;
 if p_month=current_month and not exists(select from budget_tracker.monthly_limits where user_id=auth.uid() and month=p_month) then
  select * into prior from budget_tracker.monthly_limits where user_id=auth.uid() and month<p_month order by month desc limit 1;
  if found then insert into budget_tracker.monthly_limits(user_id,month,amount,inherited_from)values(auth.uid(),p_month,prior.amount,prior.month)on conflict do nothing;end if;
 end if;
 through:=greatest(today,(p_month+interval '1 month - 1 day')::date);
 for r in select id from budget_tracker.recurring_rules where user_id=auth.uid() and active and not archived order by id loop
  perform budget_tracker.generate_occurrences(r.id,through);
 end loop;
 -- Advance the next schedule date, retaining every generated unpaid occurrence.
 for r in select * from budget_tracker.recurring_rules where user_id=auth.uid() and active and not archived order by id loop
  cursor:=r.next_occurrence_date;
  while cursor<=today loop cursor:=budget_tracker.next_rule_date(cursor,r.frequency,r.anchor_day,r.month_end);end loop;
  update budget_tracker.recurring_rules set next_occurrence_date=cursor where id=r.id;
 end loop;
end $$;

-- Unpaid older obligations remain visible and reserved in the current month.
do $patch$
declare definition text; before_text text;
begin
 select pg_get_functiondef('budget_tracker.dashboard_snapshot(date)'::regprocedure)into definition;
 before_text:='o.scheduled_date>=p_month and o.scheduled_date<(p_month+interval ''1 month'')::date';
 if strpos(definition,before_text)=0 then raise exception 'Dashboard bill range differs';end if;
 execute replace(definition,before_text,'(o.scheduled_date>=p_month or (p_month=date_trunc(''month'',(select today from context))::date and o.state in (''outstanding'',''replacement''))) and o.scheduled_date<(p_month+interval ''1 month'')::date');
end $patch$;

-- Private exact-create receipts retain the original payload through later bill edits.
-- Replacement retries must never delete another phone's newer payment.
do $patch$
declare definition text;before_text text;
begin
 select pg_get_functiondef('budget_tracker.bill_command(uuid,text,jsonb,jsonb,boolean)'::regprocedure)into definition;
 before_text:='if p_command in (''skip'',''replace'',''convert_income'') then';
 if strpos(definition,before_text)=0 then raise exception 'Bill replacement implementation differs';end if;
 execute replace(definition,before_text,'if p_command=''replace'' and p_transaction ? ''id'' and o.transaction_id is not null and o.transaction_id is distinct from (p_transaction->>''id'')::uuid then raise exception ''This bill payment changed. Reopen its details.'' using errcode=''40001'';end if; '||before_text);
end $patch$;

create table budget_tracker.recurring_rule_creations(
 request_id uuid primary key,user_id uuid not null,rule_id uuid not null,payload jsonb not null,
 foreign key(user_id,rule_id)references budget_tracker.recurring_rules(user_id,id)on delete cascade
);
alter table budget_tracker.recurring_rule_creations enable row level security;
revoke all on budget_tracker.recurring_rule_creations from public,anon,authenticated;
grant all on budget_tracker.recurring_rule_creations to service_role;
alter function budget_tracker.save_recurring_rule(jsonb)rename to save_recurring_rule_internal;
revoke all on function budget_tracker.save_recurring_rule_internal(jsonb)from public,anon,authenticated;

create function budget_tracker.save_recurring_rule(p_rule jsonb)returns budget_tracker.recurring_rules
language plpgsql security definer set search_path='' as $$
declare receipt budget_tracker.recurring_rule_creations;r budget_tracker.recurring_rules;request uuid;payload jsonb;
begin
 perform budget_tracker.financial_lock();
 if not(p_rule ? 'createId')then return budget_tracker.save_recurring_rule_internal(p_rule);end if;
 if jsonb_typeof(p_rule->'createId')is distinct from 'string' or p_rule->>'id' is not null or coalesce(p_rule->>'command','save')<>'save'
 then raise exception 'Invalid bill creation request' using errcode='22023';end if;
 request:=(p_rule->>'createId')::uuid;payload:=p_rule-'createId';
 select * into receipt from budget_tracker.recurring_rule_creations where request_id=request;
 if found then
  if receipt.user_id<>auth.uid()then raise exception 'Bill unavailable' using errcode='42501';end if;
  if receipt.payload is distinct from payload then raise exception 'Bill was already created with different details' using errcode='23505';end if;
  select * into r from budget_tracker.recurring_rules where id=receipt.rule_id and user_id=auth.uid();
  if not found then raise exception 'Bill unavailable' using errcode='42501';end if;
  return r;
 end if;
 r:=budget_tracker.save_recurring_rule_internal(payload);
 insert into budget_tracker.recurring_rule_creations(request_id,user_id,rule_id,payload)values(request,auth.uid(),r.id,payload);
 return r;
end $$;
revoke all on function budget_tracker.save_recurring_rule(jsonb)from public,anon;
grant execute on function budget_tracker.save_recurring_rule(jsonb)to authenticated;

-- Optional sixth argument keeps old callers compatible, defaulting to today's financial date.
drop function budget_tracker.pay_bill(uuid,uuid,uuid,text,date);
create function budget_tracker.pay_bill(p_occurrence uuid,p_payment_method uuid,p_transaction_id uuid,p_expected_amount text,p_expected_date date,p_payment_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o budget_tracker.recurring_occurrences;zone text;today date;payment_day date;payload jsonb;existing budget_tracker.transactions;
begin
 perform budget_tracker.financial_lock();
 if p_transaction_id is null then raise exception 'Payment identifier required' using errcode='22023';end if;
 select * into o from budget_tracker.recurring_occurrences where id=p_occurrence and user_id=auth.uid()for update;
 if o.id is null then raise exception 'Bill unavailable' using errcode='42501';end if;
 if p_expected_amount is null or p_expected_amount !~ '^[0-9]+\.[0-9]{2}$' or p_expected_date is null
  or p_expected_amount::numeric<>o.amount or p_expected_date<>o.scheduled_date
 then raise exception 'Bill changed. Refresh its details before paying.' using errcode='40001';end if;
 if o.state not in ('outstanding','replacement','recorded')then raise exception 'Bill is no longer payable' using errcode='22023';end if;
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 if zone is null then raise exception 'Set your timezone first' using errcode='22023';end if;
 today:=(now() at time zone zone)::date;
 select * into existing from budget_tracker.transactions where id=p_transaction_id and user_id=auth.uid();
 -- Old callers retrying after midnight keep the previously committed date.
 payment_day:=coalesce(p_payment_date,existing.transaction_date,today);
 if not isfinite(payment_day)or payment_day<date '0001-01-01' or payment_day>today then raise exception 'Choose a payment date on or before today' using errcode='22023';end if;
 payload:=jsonb_build_object('id',p_transaction_id,'operation','create','payload_version',4,'type','expense',
  'category_id',o.category_id,'amount',o.amount::text,'note',o.label,'transaction_date',payment_day,
  'occurred_at',(payment_day+time '12:00')at time zone zone,'payment_method_id',p_payment_method);
 return budget_tracker.bill_command(o.id,'record',payload,'[]'::jsonb,false);
end $$;
revoke all on function budget_tracker.pay_bill(uuid,uuid,uuid,text,date,date)from public,anon;
grant execute on function budget_tracker.pay_bill(uuid,uuid,uuid,text,date,date)to authenticated;
notify pgrst,'reload schema';

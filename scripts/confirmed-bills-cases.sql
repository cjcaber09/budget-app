insert into auth.users(id)values('00000000-0000-4000-8000-000000045001'),('00000000-0000-4000-8000-000000045002');
insert into budget_tracker.profiles(user_id,timezone,currency)values('00000000-0000-4000-8000-000000045001','Pacific/Kiritimati','USD'),('00000000-0000-4000-8000-000000045002','UTC','USD');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000045001';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$
declare today date:=(now()at time zone 'Pacific/Kiritimati')::date;month date:=date_trunc('month',today)::date;
 c uuid;m budget_tracker.payment_methods;r budget_tracker.recurring_rules;again budget_tracker.recurring_rules;o budget_tracker.recurring_occurrences;
 payload jsonb;snapshot jsonb;result jsonb;due date:=month-1;tx uuid:='00000000-0000-4000-8000-000000045101';
begin
 select id into c from budget_tracker.categories where user_id=auth.uid()limit 1;
 m:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','bank_account','paymentType','Bank account','name','Synthetic funded method','openingBalance','1000.00'));
 perform budget_tracker.set_monthly_allowance(month,'1000.00');
 payload:=jsonb_build_object('createId','00000000-0000-4000-8000-000000045100','categoryId',c,'amount','50.00','note','Synthetic pending bill','frequency','monthly','nextDueDate',due,'paymentMethodId',m.id,'reminderEnabled',true,'reminderDaysBefore',1,'reminderTime','09:00');
 r:=budget_tracker.save_recurring_rule(payload);again:=budget_tracker.save_recurring_rule(payload);
 if r.id<>again.id or(select count(*)from budget_tracker.recurring_rules where user_id=auth.uid())<>1 then raise exception 'Creation retry duplicated bill';end if;
 begin perform budget_tracker.save_recurring_rule(payload||'{"amount":"51.00"}');raise exception 'Conflicting creation accepted';exception when unique_violation then null;end;
 if has_table_privilege('authenticated','budget_tracker.recurring_rule_creations','SELECT')or has_function_privilege('authenticated','budget_tracker.save_recurring_rule_internal(jsonb)','EXECUTE')then raise exception 'Creation receipt bypass exposed';end if;
 perform budget_tracker.prepare_dashboard(month);perform budget_tracker.prepare_dashboard(month);
 if exists(select from budget_tracker.transactions where user_id=auth.uid())then raise exception 'Funded due bill was automatically recorded';end if;
 select * into o from budget_tracker.recurring_occurrences where rule_id=r.id and scheduled_date=due;
 if o.state<>'outstanding'then raise exception 'Due bill was not retained';end if;
 snapshot:=budget_tracker.dashboard_snapshot(month);
 if not exists(select from jsonb_array_elements(snapshot->'bills')b where b->>'id'=o.id::text)
  or(snapshot->>'reservedCents')::numeric<5000 then raise exception 'Overdue bill was not visible or reserved';end if;
 if(select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=m.id::text)<>1000 then raise exception 'Schedule changed tracked balance';end if;
 begin perform budget_tracker.pay_bill(o.id,m.id,tx,'51.00',due,today);raise exception 'Stale expected amount accepted';exception when serialization_failure then null;end;
 begin perform budget_tracker.pay_bill(o.id,m.id,tx,'50.00',due,today+1);raise exception 'Future actual payment accepted';exception when invalid_parameter_value then null;end;
 result:=budget_tracker.pay_bill(o.id,m.id,tx,'50.00',due,today);
 if result->'transaction'->>'transaction_date'<>today::text or(result->'transaction'->>'amount')::numeric<>50 then raise exception 'Actual date or scheduled amount changed';end if;
 perform budget_tracker.pay_bill(o.id,m.id,tx,'50.00',due,today);
 perform budget_tracker.pay_bill(o.id,m.id,tx,'50.00',due); -- Older clients keep the committed date.
 if(select count(*)from budget_tracker.transactions where user_id=auth.uid())<>1 then raise exception 'Payment retry duplicated expense';end if;
 if(budget_tracker.dashboard_snapshot(month)->>'expenseCents')::numeric<>5000 or(budget_tracker.dashboard_snapshot(date_trunc('month',due)::date)->>'expenseCents')::numeric<>0 then raise exception 'Payment entered due month instead of actual month';end if;
 if budget_tracker.reporting_snapshot(month)->'totals'->>'expense'<>'5000' or budget_tracker.reporting_snapshot(date_trunc('month',due)::date)->'totals'->>'expense'<>'0' then raise exception 'Reports disagree with actual payment date';end if;
 if exists(select from jsonb_array_elements(budget_tracker.dashboard_snapshot(month)->'bills')b where b->>'id'=o.id::text and b->>'state' in ('outstanding','replacement'))then raise exception 'Payment still reserved';end if;
 begin perform budget_tracker.bill_command(o.id,'replace',jsonb_build_object('id',gen_random_uuid()));raise exception 'Stale replacement deleted newer payment';exception when serialization_failure then null;end;
 perform budget_tracker.bill_command(o.id,'replace',jsonb_build_object('id',tx));
 perform budget_tracker.bill_command(o.id,'replace',jsonb_build_object('id',tx));
 if exists(select from budget_tracker.transactions where id=tx)or(select state from budget_tracker.recurring_occurrences where id=o.id)<>'replacement'then raise exception 'Confirmed replacement failed';end if;
 -- Exact creation retry after editing returns the owned existing rule without overwriting it.
 perform budget_tracker.save_recurring_rule((payload-'createId')||jsonb_build_object('id',r.id,'amount','60.00'));
 again:=budget_tracker.save_recurring_rule(payload);if again.id<>r.id or again.amount<>60 then raise exception 'Creation retry overwrote later edit';end if;
 perform budget_tracker.save_recurring_rule(jsonb_build_object('id',r.id,'command','archive'));
 again:=budget_tracker.save_recurring_rule(payload);if not again.archived then raise exception 'Creation retry restored archived bill';end if;
 perform set_config('test.foreign_bill_payload',payload::text,true);
 perform set_config('test.foreign_occurrence',o.id::text,true);
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000045002';
do $$begin
 begin perform budget_tracker.save_recurring_rule(current_setting('test.foreign_bill_payload')::jsonb);raise exception 'Foreign creation retry allowed';exception when insufficient_privilege then null;end;
 begin perform budget_tracker.pay_bill(current_setting('test.foreign_occurrence')::uuid,null,gen_random_uuid(),'50.00',current_date,current_date);raise exception 'Foreign bill payment allowed';exception when insufficient_privilege then null;end;
 if exists(select from budget_tracker.recurring_rules where user_id=auth.uid())then raise exception 'Foreign conflict created a bill';end if;
end $$;
reset role;set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';

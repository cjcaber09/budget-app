insert into auth.users(id)values('00000000-0000-4000-8000-000000048001'),('00000000-0000-4000-8000-000000048002');
insert into budget_tracker.profiles(user_id,timezone,currency)values('00000000-0000-4000-8000-000000048001','Asia/Manila','PHP'),('00000000-0000-4000-8000-000000048002','UTC','USD');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000048001';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$
declare e budget_tracker.transactions;card_expense budget_tracker.transactions;m budget_tracker.payment_methods;card budget_tracker.payment_methods;wallet budget_tracker.payment_methods;
 bill budget_tracker.recurring_rules;occ budget_tracker.recurring_occurrences;bill_tx uuid:=gen_random_uuid();
 c uuid;payload jsonb;r jsonb;snap jsonb;today date:=(now() at time zone 'Asia/Manila')::date;prior date;rid uuid:='00000000-0000-4000-8000-000000048101';
begin
 prior:=(date_trunc('month',today)-interval '1 day')::date;
 insert into budget_tracker.categories(user_id,name,color,icon)values(auth.uid(),'Synthetic groceries','#55816A','tag')returning id into c;
 m:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','bank_account','paymentType','Savings account','name','Synthetic bank','openingBalance','1000.00'));
 e:=budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','type','expense','amount','100.00','category_id',c,'payment_method_id',m.id,'transaction_date',prior,'occurred_at',prior::timestamp at time zone 'Asia/Manila','note',null,'payload_version',4),'[{"kind":"item","label":"Original purchase","amount":"100.00","quantity":null,"unit_price":null,"tax_included":false}]');
 payload:=jsonb_build_object('id',rid,'expenseId',e.id,'expenseCreatedAt',e.created_at,'operation','create','amount','25.50','methodId',m.id,'date',today,'note','Partial return');
 r:=budget_tracker.save_refund(payload);perform budget_tracker.save_refund(payload);
 begin perform budget_tracker.save_refund(payload||jsonb_build_object('expenseCreatedAt',e.created_at-interval '1 second'));raise exception 'stale expense identity accepted';exception when sqlstate '40001' then null;end;
 begin perform budget_tracker.save_refund(payload||jsonb_build_object('id',e.id));raise exception 'refund reused transaction ID';exception when unique_violation then null;end;
 begin perform budget_tracker.save_transaction(jsonb_build_object('id',rid,'operation','create','type','income','amount','1.00','category_id',null,'payment_method_id',m.id,'transaction_date',today,'occurred_at',now(),'note',null,'payload_version',4),'[]');raise exception 'transaction reused refund ID';exception when unique_violation then null;end;
 if (select count(*) from budget_tracker.refunds where expense_id=e.id)<>1 then raise exception 'retry duplicated refund';end if;
 if (budget_tracker.refund_snapshot(e.id)->>'refunded')::numeric<>25.50 then raise exception 'wrong refund amount';end if;
 snap:=budget_tracker.dashboard_snapshot(date_trunc('month',today)::date);
 if (snap->>'incomeCents')::numeric<>0 or (snap->>'expenseCents')::numeric<>-2550 then raise exception 'refund counted as income or wrong month';end if;
 if (budget_tracker.dashboard_snapshot(date_trunc('month',prior)::date)->>'expenseCents')::numeric<>10000 then raise exception 'purchase history changed';end if;
 snap:=budget_tracker.payment_method_snapshot();
 if snap->>'refundVersion'<>'1' or (select (x->>'balance')::numeric from jsonb_array_elements(snap->'methods')x where x->>'id'=m.id::text)<>925.50 then raise exception 'refund balance wrong';end if;
 snap:=budget_tracker.reporting_snapshot(date_trunc('month',today)::date);
 if snap->>'refundVersion'<>'1' or (snap->'totals'->>'expense')::numeric<>-2550 or (snap->'totals'->>'income')::numeric<>0 then raise exception 'report units wrong';end if;
 if not exists(select from jsonb_array_elements(budget_tracker.transaction_history_page(date_trunc('month',today)::date,'refund')->'rows')x where x->>'refund_of'=e.id::text and x->>'type'='refund') then raise exception 'refund missing in history';end if;
 begin perform budget_tracker.save_refund(payload||jsonb_build_object('amount','26.00'));raise exception 'conflicting retry accepted';exception when sqlstate '23505' then null;end;
 begin perform budget_tracker.save_refund(payload||jsonb_build_object('id',gen_random_uuid(),'amount','75.00'));raise exception 'over refund accepted';exception when sqlstate '22023' then null;end;
 begin perform budget_tracker.delete_transaction(e.id);raise exception 'refunded expense deleted';exception when sqlstate '22023' then null;end;
 begin delete from budget_tracker.refunds where id=rid;raise exception 'direct refund deletion allowed';exception when insufficient_privilege then null;end;
 r:=budget_tracker.save_refund(payload||jsonb_build_object('operation','update','amount','50.00','expectedVersion',1));
 perform budget_tracker.save_refund(payload||jsonb_build_object('operation','update','amount','50.00','expectedVersion',1));
 if (budget_tracker.refund_snapshot(e.id)->>'refunded')::numeric<>50 then raise exception 'edit retry failed';end if;
 perform budget_tracker.save_refund(jsonb_build_object('id',rid,'expenseId',e.id,'expenseCreatedAt',e.created_at,'operation','delete','expectedVersion',2));
 perform budget_tracker.save_refund(jsonb_build_object('id',rid,'expenseId',e.id,'expenseCreatedAt',e.created_at,'operation','delete','expectedVersion',2));
 begin perform budget_tracker.save_refund(payload);raise exception 'deleted retry resurrected';exception when sqlstate '23505' then null;end;
 perform budget_tracker.save_refund(payload||jsonb_build_object('id',gen_random_uuid(),'amount','100.00'));
 if (budget_tracker.refund_snapshot(e.id)->>'refunded')::numeric<>100 then raise exception 'full refund failed';end if;
 if (select amount from budget_tracker.transactions where id=e.id)<>100 or (select count(*) from budget_tracker.transaction_items where transaction_id=e.id)<>1 then raise exception 'refund changed original receipt';end if;
 begin perform budget_tracker.save_transaction(jsonb_build_object('id',e.id,'operation','update','type','expense','amount','99.00','category_id',c,'payment_method_id',m.id,'transaction_date',prior,'occurred_at',e.occurred_at,'note',null,'payload_version',4),'[]');raise exception 'purchase reduced below refunded total';exception when sqlstate '22023' then null;end;
 begin perform budget_tracker.save_refund(payload||jsonb_build_object('id',gen_random_uuid(),'date',today+1));raise exception 'future refund accepted';exception when sqlstate '22023' then null;end;
 card:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','card','paymentType','Credit card','name','Synthetic credit','openingBalance','500.00'));
 card_expense:=budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','type','expense','amount','100.00','category_id',c,'payment_method_id',card.id,'transaction_date',today,'occurred_at',now(),'note',null,'payload_version',4),'[]');
 perform budget_tracker.save_refund(jsonb_build_object('id',gen_random_uuid(),'expenseId',card_expense.id,'expenseCreatedAt',card_expense.created_at,'operation','create','amount','50.00','methodId',card.id,'date',today));
 if (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=card.id::text)<>-550 then raise exception 'credit refund did not reduce debt';end if;
 wallet:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','wallet','paymentType','E-wallet','name','Synthetic refund wallet','openingBalance','0.00'));
 perform budget_tracker.save_refund(jsonb_build_object('id',gen_random_uuid(),'expenseId',card_expense.id,'expenseCreatedAt',card_expense.created_at,'operation','create','amount','25.00','methodId',wallet.id,'date',today));
 snap:=budget_tracker.payment_method_snapshot();
 if not (select (x->>'has_activity')::boolean from jsonb_array_elements(snap->'methods')x where x->>'id'=wallet.id::text) or (select (x->>'balance')::numeric from jsonb_array_elements(snap->'methods')x where x->>'id'=wallet.id::text)<>25 then raise exception 'refund-only method activity or balance missing';end if;
 begin perform budget_tracker.save_payment_method(jsonb_build_object('id',wallet.id,'operation','update','method','wallet','paymentType','E-wallet','name',wallet.name,'openingBalance','10.00'));raise exception 'refund activity opening balance changed without confirmation';exception when sqlstate '22023' then null;end;
 bill:=budget_tracker.save_recurring_rule(jsonb_build_object('createId',gen_random_uuid(),'categoryId',c,'amount','50.00','note','Synthetic refunded bill','frequency','monthly','nextDueDate',today,'paymentMethodId',m.id));
 perform budget_tracker.prepare_dashboard(date_trunc('month',today)::date);select * into occ from budget_tracker.recurring_occurrences where rule_id=bill.id and scheduled_date=today;
 perform budget_tracker.pay_bill(occ.id,m.id,bill_tx,'50.00',today,today);
 perform budget_tracker.save_refund(jsonb_build_object('id',gen_random_uuid(),'expenseId',bill_tx,'expenseCreatedAt',(select created_at from budget_tracker.transactions where id=bill_tx),'operation','create','amount','50.00','methodId',m.id,'date',today));
 if (select state from budget_tracker.recurring_occurrences where id=occ.id)<>'recorded' or (select transaction_id from budget_tracker.recurring_occurrences where id=occ.id)<>bill_tx then raise exception 'refund reopened paid bill';end if;
 if (budget_tracker.dashboard_snapshot(date_trunc('month',today)::date)->>'discretionaryToDateCents')::numeric<>-7500 then raise exception 'bill refund altered discretionary forecast';end if;
 if not exists(select from jsonb_array_elements(budget_tracker.transaction_export_snapshot(date_trunc('month',today)::date)->'rows')x where x->>'type'='refund' and x->>'refund_of'=e.id::text and (x->>'amount')::numeric=10000) then raise exception 'refund missing exact CSV linkage';end if;
 snap:=budget_tracker.report_export_snapshot(date_trunc('month',today)::date,date_trunc('month',today)::date);
 if snap->>'refundVersion'<>'1' then raise exception 'export refund version missing';end if;
 if has_table_privilege('authenticated','budget_tracker.refund_requests','SELECT') then raise exception 'private retry records exposed';end if;
end $$;
reset role;
select set_config('refund_test.foreign_expense',(select expense_id::text from budget_tracker.refunds where user_id='00000000-0000-4000-8000-000000048001' limit 1),true);
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000048002';set local role authenticated;
do $$begin
 if exists(select from budget_tracker.refunds) or exists(select from budget_tracker.financial_activity) then raise exception 'foreign financial rows exposed';end if;
 begin perform budget_tracker.refund_snapshot(current_setting('refund_test.foreign_expense')::uuid);raise exception 'foreign refund history exposed';exception when sqlstate '42501' then null;end;
end $$;
reset role;
-- Cash initialized after a recorded refund must not credit that historic refund twice.
do $$declare m budget_tracker.payment_methods;e budget_tracker.transactions;c uuid;today date:=(now() at time zone 'UTC')::date;begin
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000048002',true);
 perform budget_tracker.payment_method_snapshot();select * into m from budget_tracker.payment_methods where user_id=auth.uid() and method='cash';
 insert into budget_tracker.categories(user_id,name,color,icon)values(auth.uid(),'Synthetic second owner','#55816A','tag')returning id into c;
 e:=budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','payload_version',4,'type','expense','amount','20.00','category_id',c,'payment_method_id',m.id,'occurred_at',now(),'transaction_date',today,'note',null),'[]');
 perform budget_tracker.save_refund(jsonb_build_object('id',gen_random_uuid(),'expenseId',e.id,'expenseCreatedAt',e.created_at,'operation','create','amount','10.00','methodId',m.id,'date',today));
 m:=budget_tracker.save_payment_method(jsonb_build_object('id',m.id,'operation','update','method','cash','paymentType','Cash','name','Cash','openingBalance','100.00'));
 if (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=m.id::text)<>100 then raise exception 'Cash baseline double credited historic refund';end if;
end $$;
do $$declare e budget_tracker.transactions;m uuid;c uuid;today date:=(now() at time zone 'UTC')::date;begin
 select id into m from budget_tracker.payment_methods where user_id='00000000-0000-4000-8000-000000048002' and method='cash';
 select id into c from budget_tracker.categories where user_id='00000000-0000-4000-8000-000000048002' limit 1;
 e:=budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','payload_version',4,'type','expense','amount','20.00','category_id',c,'payment_method_id',m,'occurred_at',now(),'transaction_date',today,'note',null),'[]');
 begin
  insert into budget_tracker.refunds(id,user_id,expense_id,method_id,amount,refund_date)values(gen_random_uuid(),auth.uid(),e.id,m,21,today);
  set constraints all immediate;raise exception 'deferred refund cap bypassed';
 exception when check_violation then null;end;
 set constraints all deferred;
 insert into budget_tracker.refunds(id,user_id,expense_id,method_id,amount,refund_date)
 select gen_random_uuid(),auth.uid(),e.id,m,0.01,today from generate_series(1,1001);
 if (select jsonb_array_length(budget_tracker.report_transaction_history(date_trunc('month',today)::date)->'rows'))<>1004 then raise exception 'complete refund history capped';end if;
 if (select jsonb_array_length(budget_tracker.transaction_export_snapshot(date_trunc('month',today)::date)->'rows'))<>1004 then raise exception 'refund CSV history capped';end if;
 if (select jsonb_array_length(budget_tracker.transaction_history_page(date_trunc('month',today)::date,'refund')->'rows'))<>10 then raise exception 'refund history page unbounded';end if;
end $$;
-- Actual Auth cascades are supported; this entire synthetic deletion rolls back.
set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
delete from auth.users where id='00000000-0000-4000-8000-000000048001';
do $$begin
 if exists(select from budget_tracker.refunds where user_id='00000000-0000-4000-8000-000000048001') or exists(select from budget_tracker.refund_requests where user_id='00000000-0000-4000-8000-000000048001') then raise exception 'Auth cascade retained refunds';end if;
 if (select count(*) from budget_tracker.refunds where user_id='00000000-0000-4000-8000-000000048002')<>1002 then raise exception 'Other owner refunds removed';end if;
end $$;
-- Synthetic private reset completion, inside ROLLBACK, keeps Auth/profile and removes the new ledger.
select set_config('refund_test.reset_id',gen_random_uuid()::text,true);
select budget_tracker.begin_financial_reset('00000000-0000-4000-8000-000000048002',current_setting('refund_test.reset_id')::uuid);
update budget_tracker.financial_resets set settle_after=now()-interval '1 minute' where request_id=current_setting('refund_test.reset_id')::uuid;
select set_config('refund_test.reset_token',budget_tracker.claim_financial_reset(current_setting('refund_test.reset_id')::uuid)::text,true);
select budget_tracker.complete_financial_reset(current_setting('refund_test.reset_id')::uuid,current_setting('refund_test.reset_token')::uuid);
do $$begin
 if exists(select from budget_tracker.refunds where user_id='00000000-0000-4000-8000-000000048002') or exists(select from budget_tracker.refund_requests where user_id='00000000-0000-4000-8000-000000048002') then raise exception 'Reset retained refunds';end if;
 if not exists(select from auth.users where id='00000000-0000-4000-8000-000000048002') then raise exception 'Reset deleted Auth';end if;
end $$;

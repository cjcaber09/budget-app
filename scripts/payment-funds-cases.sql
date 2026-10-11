insert into auth.users(id) values('00000000-0000-4000-8000-000000009931');
insert into budget_tracker.profiles(user_id,timezone,currency)values('00000000-0000-4000-8000-000000009931','Asia/Manila','PHP');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009931';
set local request.jwt.claim.role='authenticated';set local role authenticated;
do $cases$
declare day date:=(now() at time zone 'Asia/Manila')::date;m date:=date_trunc('month',day)::date;c uuid;
 debit budget_tracker.payment_methods; wallet budget_tracker.payment_methods; credit budget_tracker.payment_methods;
 t budget_tracker.transactions;f budget_tracker.payment_transfers;r budget_tracker.recurring_rules;o budget_tracker.recurring_occurrences;
 payload jsonb;payment jsonb;tx uuid:=gen_random_uuid();
begin
 select id into c from budget_tracker.categories where user_id=auth.uid() limit 1;
 debit:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','card','paymentType','Debit card','name','Synthetic debit','openingBalance','100.00'));
 wallet:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','wallet','paymentType','E-wallet','name','Synthetic wallet','openingBalance','100.00'));
 credit:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','card','paymentType','Credit card','name','Synthetic credit','openingBalance','300.00'));
 payload:=jsonb_build_object('id',gen_random_uuid(),'operation','create','payload_version',4,'type','expense','category_id',c,'amount','60.00','note','Funds test','occurred_at',now(),'transaction_date',day,'payment_method_id',null);
 -- Already-paid expenses are recordable even when Cash has no opening balance.
 begin perform budget_tracker.save_transaction(payload,'[]');raise exception 'Rollback ordinary expense' using errcode='ZX001';exception when sqlstate 'ZX001' then null;end;
 payload:=payload||jsonb_build_object('payment_method_id',debit.id);t:=budget_tracker.save_transaction(payload,'[]');
 if (select (entry->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods') entry where (entry->>'id')::uuid=debit.id)<>40 then raise exception 'Initial spend balance';end if;
 perform budget_tracker.save_transaction(payload,'[]'); -- Exact retry after funds were consumed.
 begin
  perform budget_tracker.save_transaction(payload||jsonb_build_object('id',gen_random_uuid(),'amount','50.00'),'[]');
  if (select (entry->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods') entry where (entry->>'id')::uuid=debit.id)<>-10 then raise exception 'Paid expense was not recorded';end if;
  raise exception 'Rollback ordinary expense' using errcode='ZX001';exception when sqlstate 'ZX001' then null;
 end;
 perform budget_tracker.save_transaction(payload||jsonb_build_object('operation','update','amount','65.00'),'[]');
 if (select (entry->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods') entry where (entry->>'id')::uuid=debit.id)<>35 then raise exception 'Incremental edit charged twice';end if;
 begin perform budget_tracker.save_payment_transfer(jsonb_build_object('id',gen_random_uuid(),'operation','create','sourceId',debit.id,'destinationId',wallet.id,'amount','40.00','date',day));raise exception 'Transfer overspend accepted';exception when sqlstate 'BT001' then null;end;
 f:=budget_tracker.save_payment_transfer(jsonb_build_object('id',gen_random_uuid(),'operation','create','sourceId',debit.id,'destinationId',wallet.id,'amount','35.00','date',day));
 perform budget_tracker.save_payment_transfer(jsonb_build_object('id',f.id,'operation','create','sourceId',debit.id,'destinationId',wallet.id,'amount','35.00','date',day));
 if (select (entry->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods') entry where (entry->>'id')::uuid=debit.id)<>0 then raise exception 'Transfer equality/retry';end if;
 perform budget_tracker.save_transaction(payload||jsonb_build_object('id',gen_random_uuid(),'payment_method_id',credit.id,'amount','1200.00'),'[]');
 if (select (entry->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods') entry where (entry->>'id')::uuid=credit.id)<>-1500 then raise exception 'Credit debt tracking blocked';end if;
 r:=budget_tracker.save_recurring_rule(jsonb_build_object('command','save','categoryId',c,'amount','15.00','note','Synthetic bill','frequency','monthly','nextDueDate',day+1,'paymentMethodId',debit.id));
 select * into o from budget_tracker.recurring_occurrences where rule_id=r.id order by scheduled_date limit 1;
 begin perform budget_tracker.pay_bill(o.id,debit.id,tx,'15.00',o.scheduled_date);raise exception 'Bill overspend accepted';exception when sqlstate 'BT001' then null;end;
 if(select state from budget_tracker.recurring_occurrences where id=o.id)<>'outstanding' then raise exception 'Failed bill changed state';end if;
 payment:=budget_tracker.pay_bill(o.id,wallet.id,tx,'15.00',o.scheduled_date);
 if (payment->'transaction'->>'amount')::numeric<>15 or payment->'transaction'->>'transaction_date'<>o.scheduled_date::text then raise exception 'Bill did not use saved details';end if;
 perform budget_tracker.pay_bill(o.id,wallet.id,tx,'15.00',o.scheduled_date);
 -- A due bill without funds stays reserved; dashboard preparation still succeeds.
 r:=budget_tracker.save_recurring_rule(jsonb_build_object('command','save','categoryId',c,'amount','15.00','note','Blocked due bill','frequency','monthly','nextDueDate',day,'paymentMethodId',debit.id));
 perform budget_tracker.prepare_dashboard(m);
 if not exists(select from budget_tracker.recurring_occurrences where rule_id=r.id and state='outstanding' and scheduled_date=day)then raise exception 'Unfunded due bill was silently paid';end if;
end $cases$;
reset role;

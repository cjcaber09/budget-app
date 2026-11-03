do $$
declare owner_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();category uuid:=gen_random_uuid();cash uuid;bank uuid:=gen_random_uuid();
 legacy uuid:=gen_random_uuid();expense uuid:=gen_random_uuid();income uuid:=gen_random_uuid();future_id uuid:=gen_random_uuid();transfer uuid:=gen_random_uuid();refund uuid:=gen_random_uuid();correction uuid:=gen_random_uuid();
 today date:=(now() at time zone 'Asia/Manila')::date;s jsonb;v jsonb;payload jsonb;tx budget_tracker.transactions;n integer;credit uuid:=gen_random_uuid();credit_tx uuid:=gen_random_uuid();
begin
 insert into auth.users(id)values(owner_id),(other_id);
 insert into budget_tracker.profiles(user_id,timezone)values(owner_id,'Asia/Manila'),(other_id,'Asia/Manila');
 insert into budget_tracker.categories(id,user_id,name,color,icon,is_default)values(category,owner_id,'Synthetic balance history','#55816A','tag',false);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform budget_tracker.payment_method_snapshot();select id into cash from budget_tracker.payment_methods where user_id=owner_id and method='cash';
 payload:=jsonb_build_object('operation','create','payload_version',4,'id',legacy,'type','expense','category_id',category,'amount','20.00','note','Synthetic balance history','occurred_at',clock_timestamp(),'transaction_date',today,'payment_method_id',null);
 perform budget_tracker.save_transaction(payload,'[]');
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',legacy)));
 if s#>>'{rows,0,accounts,0,state}'<>'unset' or s#>'{rows,0,accounts,0,beforeCents}'<>'null'::jsonb then raise exception 'Unset balance fabricated';end if;
 perform budget_tracker.initialize_cash_balance(cash,'100.00');
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',legacy)));
 if s#>>'{rows,0,accounts,0,state}'<>'opening' then raise exception 'Cash baseline included historical expense twice';end if;
 payload:=payload||jsonb_build_object('id',expense,'amount','50.00');tx:=budget_tracker.save_transaction(payload,'[]');
 perform budget_tracker.save_transaction(payload,'[]'); -- exact retry cannot deduct twice
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',expense)));
 v:=s#>'{rows,0,accounts,0}';
 if v->>'beforeCents'<>'10000' or v->>'afterCents'<>'5000' or v->>'changeCents'<>'-5000' then raise exception 'Cash 50 deduction or exact retry inaccurate';end if;
 perform budget_tracker.save_transaction(payload||jsonb_build_object('id',income,'type','income','category_id',null,'amount','25.00','transaction_date',today-30),'[]');
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',income)));
 if s#>>'{rows,0,accounts,0,beforeCents}'<>'5000' or s#>>'{rows,0,accounts,0,afterCents}'<>'7500' then raise exception 'Backdated assignment order inaccurate';end if;
 perform budget_tracker.save_transaction(payload||jsonb_build_object('id',future_id,'amount','5.00','transaction_date',today+1),'[]');
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',future_id)));
 if s#>>'{rows,0,accounts,0,state}'<>'scheduled' or s#>'{rows,0,accounts,0,afterCents}'<>'null'::jsonb then raise exception 'Future balance fabricated';end if;
 perform budget_tracker.save_payment_method(jsonb_build_object('operation','create','id',bank,'method','bank_account','paymentType','Savings account','name','Synthetic bank','openingBalance','100.00'));
 perform budget_tracker.save_transfer_entry(jsonb_build_object('payload_version',3,'operation','create','id',transfer,'requestId',transfer,'sourceId',cash,'destinationId',bank,'amount','10.00','feeAmount','2.00','feeMode','added','date',today,'note','Synthetic fee transfer'));
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transfer','id',transfer)));
 select a into v from jsonb_array_elements(s#>'{rows,0,accounts}') a where a->>'methodId'=cash::text;
 if v->>'beforeCents'<>'7500' or v->>'afterCents'<>'6300' or v->>'changeCents'<>'-1200' then raise exception 'Transfer fee counted incorrectly';end if;
 perform budget_tracker.save_refund(jsonb_build_object('operation','create','id',refund,'expenseId',expense,'expenseCreatedAt',tx.created_at,'methodId',cash,'amount','10.00','date',today,'note','Synthetic refund'));
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','refund','id',refund)));
 if s#>>'{rows,0,accounts,0,beforeCents}'<>'6300' or s#>>'{rows,0,accounts,0,afterCents}'<>'7300' then raise exception 'Refund missing from ledger';end if;
 perform budget_tracker.correct_method_balance(jsonb_build_object('id',correction,'methodId',cash,'targetBalance','80.00','expectedBalance','73.00','note','Synthetic reconciliation'));
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','correction','id',correction)));
 if s#>>'{rows,0,accounts,0,beforeCents}'<>'7300' or s#>>'{rows,0,accounts,0,afterCents}'<>'8000' then raise exception 'Correction missing from ledger';end if;
 -- Ordinary edits retain assignment order and recalculate, rather than freezing false historical snapshots.
 perform budget_tracker.save_transaction(payload||jsonb_build_object('operation','update','amount','40.00'),'[]');
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',expense)));
 if s#>>'{rows,0,accounts,0,beforeCents}'<>'10000' or s#>>'{rows,0,accounts,0,afterCents}'<>'6000' then raise exception 'Expense edit did not recalculate';end if;
 -- Full ledger calculation must not be limited by the requested rows or PostgREST's row cap.
 for n in 1..1001 loop
  perform budget_tracker.save_transaction(payload||jsonb_build_object('id',gen_random_uuid(),'amount','0.01'),'[]');
 end loop;
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',expense)));
 if s#>>'{rows,0,accounts,0,afterCents}'<>'6000' then raise exception 'Requested subset corrupted historical running balance';end if;
 perform budget_tracker.save_transaction(payload||jsonb_build_object('operation','update','amount','40.00','payment_method_id',bank),'[]');
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',expense)));
 if s#>>'{rows,0,accounts,0,methodId}'<>bank::text or s#>>'{rows,0,accounts,0,beforeCents}'<>'11000' or s#>>'{rows,0,accounts,0,afterCents}'<>'7000' then raise exception 'Reassignment retained the old account effect';end if;
 perform budget_tracker.save_payment_method(jsonb_build_object('operation','create','id',credit,'method','card','paymentType','Credit card','name','Synthetic credit','openingBalance','100.00'));
 perform budget_tracker.save_transaction(payload||jsonb_build_object('id',credit_tx,'payment_method_id',credit,'amount','10.00'),'[]');
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',credit_tx)));
 if s#>>'{rows,0,accounts,0,beforeCents}'<>'-10000' or s#>>'{rows,0,accounts,0,afterCents}'<>'-11000' then raise exception 'Credit debt sign incorrect';end if;
 begin perform budget_tracker.activity_balance_history('[{"kind":"transaction","id":"not-a-uuid"}]');raise exception 'Invalid request accepted';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claim.sub',other_id::text,true);
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',expense)));
 if jsonb_array_length(s#>'{rows,0,accounts}')<>0 then raise exception 'Foreign balance leaked';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform budget_tracker.activity_balance_history('[]');raise exception 'Missing auth accepted';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','budget_tracker.activity_balance_history(jsonb)','EXECUTE') then raise exception 'Anonymous execution allowed';end if;
 perform set_config('app.balance_test.owner',owner_id::text,true);
 perform set_config('app.balance_test.expense',expense::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.balance_test.owner'),true);
do $$declare s jsonb;begin
 s:=budget_tracker.activity_balance_history(jsonb_build_array(jsonb_build_object('kind','transaction','id',current_setting('app.balance_test.expense'))));
 if s#>>'{rows,0,accounts,0,afterCents}'<>'7000' then raise exception 'Authenticated RPC read failed';end if;
end $$;
reset role;
select 'PASS exact Cash 50, retry, baseline, backdated/future, transfer fee, refund, correction, edit, complete ledger and ownership' as result;

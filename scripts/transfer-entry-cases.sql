insert into auth.users(id) values('00000000-0000-4000-8000-000000049001'),('00000000-0000-4000-8000-000000049002');
insert into budget_tracker.profiles(user_id,timezone,currency) values('00000000-0000-4000-8000-000000049001','Asia/Manila','PHP'),('00000000-0000-4000-8000-000000049002','UTC','USD');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000049001';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$
declare bank budget_tracker.payment_methods;cash budget_tracker.payment_methods;f budget_tracker.payment_transfers;a budget_tracker.transaction_attachments;payload jsonb;r jsonb;edit jsonb;today date:=(now() at time zone 'Asia/Manila')::date;tid uuid:='00000000-0000-4000-8000-000000049101';cmd uuid:=gen_random_uuid();category uuid;prior_time timestamptz;
begin
 bank:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','bank_account','paymentType','Savings account','name','Synthetic withdrawal bank','openingBalance','10000.00'));
 select * into cash from budget_tracker.payment_methods where user_id=auth.uid() and method='cash';
 cash:=budget_tracker.save_payment_method(jsonb_build_object('id',cash.id,'operation','update','method','cash','paymentType','Cash','name','Cash','openingBalance','0.00'));
 payload:=jsonb_build_object('payload_version',3,'id',tid,'requestId',tid,'operation','create','sourceId',bank.id,'destinationId',cash.id,'amount','2000.00','feeAmount','15.00','feeMode','added','date',today,'note','Synthetic withdrawal');
 r:=budget_tracker.save_transfer_entry(payload);perform budget_tracker.save_transfer_entry(payload);
 if r->>'state'<>'saved' or r->'transfer'->>'version'<>'1' then raise exception 'create contract wrong';end if;
 if (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=bank.id::text)<>7985 or (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=cash.id::text)<>2000 then raise exception 'withdrawal counted fee twice';end if;
 if (budget_tracker.dashboard_snapshot(date_trunc('month',today)::date)->>'incomeCents')::numeric<>0 or (budget_tracker.dashboard_snapshot(date_trunc('month',today)::date)->>'expenseCents')::numeric<>1500 then raise exception 'principal entered budget totals';end if;
 if(select count(*) from budget_tracker.transactions where transfer_id=tid)<>1 then raise exception 'fee duplicated';end if;
 set constraints all immediate;set constraints all deferred;
 begin perform budget_tracker.save_payment_transfer(jsonb_build_object('id',tid,'operation','delete'));raise exception 'legacy delete accepted';exception when sqlstate 'TE001' then null;end;
 begin perform budget_tracker.save_transfer_entry(payload||jsonb_build_object('destinationId',bank.id,'id',gen_random_uuid(),'requestId',gen_random_uuid()));raise exception 'invalid command accepted';exception when sqlstate '22023' then null;end;
 begin perform budget_tracker.save_transaction(jsonb_build_object('id',tid,'operation','create','type','income','amount','1.00','category_id',null,'payment_method_id',bank.id,'transaction_date',today,'occurred_at',now(),'note',null,'payload_version',4),'[]');raise exception 'transaction reused transfer ID';exception when unique_violation then null;end;
 prior_time:=(r->'transfer'->>'created_at')::timestamptz;
 edit:=payload||jsonb_build_object('operation','update','requestId',cmd,'expectedVersion',1,'amount','1985.00','feeMode','deducted');
 r:=budget_tracker.save_transfer_entry(edit);perform budget_tracker.save_transfer_entry(edit);
 if r->'transfer'->>'version'<>'2' or (r->'transfer'->>'created_at')::timestamptz<>prior_time then raise exception 'revision retry or immutable order failed';end if;
 begin perform budget_tracker.save_transfer_entry(edit||jsonb_build_object('requestId',gen_random_uuid()));raise exception 'stale edit accepted';exception when sqlstate 'TE002' then null;end;
 if (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=bank.id::text)<>8000 or (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=cash.id::text)<>1985 then raise exception 'deducted fee mapping wrong';end if;
 a:=budget_tracker.reserve_transfer_attachment(tid,jsonb_build_object('id',gen_random_uuid(),'name','Synthetic.pdf','mime','application/pdf','size',8));
 if a.transaction_id is not null or a.transfer_id<>tid or not budget_tracker.proof_upload_allowed(a.object_path) then raise exception 'proof parent or admission wrong';end if;
 begin perform budget_tracker.reserve_transaction_attachment((select id from budget_tracker.transactions where transfer_id=tid),jsonb_build_object('id',a.id,'name','Synthetic.pdf','mime','application/pdf','size',8));raise exception 'old endpoint admitted transfer proof';exception when unique_violation then null;end;
 r:=budget_tracker.activity_history_page(date_trunc('month',today)::date,'transfer','synthetic withdrawal bank');
 if jsonb_array_length(r->'rows')<>1 or r->'rows'->0->>'row_kind'<>'transfer' then raise exception 'transfer history/search missing';end if;
 r:=budget_tracker.activity_export_snapshot(date_trunc('month',today)::date);
 if (select sum((x->>'income_effect')::numeric) from jsonb_array_elements(r->'rows')x)<>0 or (select sum((x->>'spending_effect')::numeric) from jsonb_array_elements(r->'rows')x)<>1500 then raise exception 'CSV double counting';end if;
 perform budget_tracker.save_transfer_entry(jsonb_build_object('payload_version',3,'id',tid,'requestId',gen_random_uuid(),'operation','delete','expectedVersion',2));
 r:=budget_tracker.save_transfer_entry(payload);
 if r->>'state'<>'removed' or exists(select from budget_tracker.payment_transfers where id=tid) or exists(select from budget_tracker.transaction_attachments where id=a.id) then raise exception 'retry resurrected or proof cascade failed';end if;
 if (budget_tracker.transfer_entry_status(tid)->>'state')<>'removed' then raise exception 'removed status lost';end if;
 begin perform budget_tracker.save_transaction(jsonb_build_object('id',tid,'operation','create','type','income','amount','1.00','category_id',null,'payment_method_id',bank.id,'transaction_date',today,'occurred_at',now(),'note',null,'payload_version',4),'[]');raise exception 'deleted ID reused across types';exception when unique_violation then null;end;
 if (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=bank.id::text)<>10000 or (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=cash.id::text)<>0 then raise exception 'delete did not restore balances';end if;
 if has_table_privilege('authenticated','budget_tracker.payment_transfer_requests','SELECT') or has_table_privilege('authenticated','budget_tracker.financial_activity_ids','SELECT') or has_function_privilege('authenticated','budget_tracker.transfer_core_v2(jsonb)','EXECUTE') then raise exception 'private command data exposed';end if;
end $$;
reset role;
-- Baselines, future financial dates, credit advances, and complete history.
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000049002';set local role authenticated;
do $$
declare bank budget_tracker.payment_methods;cash budget_tracker.payment_methods;card budget_tracker.payment_methods;r jsonb;p jsonb;tid uuid;today date:=(now() at time zone 'UTC')::date;month date:=date_trunc('month',today)::date;cursor jsonb;n integer;seen uuid[]:=array[]::uuid[];
begin
 bank:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','bank_account','paymentType','Savings account','name','Synthetic baseline bank','openingBalance','1000.00'));
 select * into cash from budget_tracker.payment_methods where user_id=auth.uid() and method='cash';tid:=gen_random_uuid();
 p:=jsonb_build_object('payload_version',3,'id',tid,'requestId',tid,'operation','create','sourceId',bank.id,'destinationId',cash.id,'amount','100.00','feeAmount','0.00','feeMode','added','date',today);
 perform budget_tracker.save_transfer_entry(p);
 cash:=budget_tracker.save_payment_method(jsonb_build_object('id',cash.id,'operation','update','method','cash','paymentType','Cash','name','Cash','openingBalance','100.00','confirmOpening',true));
 if (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=cash.id::text)<>100 then raise exception 'Cash initialized after withdrawal counted history twice';end if;
 tid:=gen_random_uuid();perform budget_tracker.save_transfer_entry(p||jsonb_build_object('id',tid,'requestId',tid,'date',today+1));
 if (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=bank.id::text)<>900 then raise exception 'future transfer applied early';end if;
 card:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','card','paymentType','Credit card','name','Synthetic cash advance','openingBalance','0.00'));
 tid:=gen_random_uuid();perform budget_tracker.save_transfer_entry(p||jsonb_build_object('id',tid,'requestId',tid,'sourceId',card.id,'amount','200.00','feeAmount','10.00'));
 if (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=card.id::text)<>-210 or (select (x->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=cash.id::text)<>300 then raise exception 'credit advance balances wrong';end if;
 r:=budget_tracker.dashboard_snapshot(month);if (r->>'incomeCents')::numeric<>0 or (r->>'expenseCents')::numeric<>1000 then raise exception 'credit advance treated as income';end if;
 -- Small credit-source transfers bypass available-funds caps and exercise >1000 RPC rows.
 for n in 1..1001 loop tid:=gen_random_uuid();perform budget_tracker.save_transfer_entry(p||jsonb_build_object('id',tid,'requestId',tid,'sourceId',card.id,'amount','0.01'));end loop;
 r:=budget_tracker.activity_export_snapshot(month,'transfer');if jsonb_array_length(r->'rows')<1003 then raise exception 'complete transfer export capped';end if;
 r:=budget_tracker.activity_history_page(month,'transfer');if jsonb_array_length(r->'rows')<>10 or not(r->>'has_more')::boolean then raise exception 'transfer page bounds wrong';end if;
 seen:=array(select (x->>'id')::uuid from jsonb_array_elements(r->'rows')x);cursor:=r->'next';
 r:=budget_tracker.activity_history_page(month,'transfer','',(cursor->>'date')::date,(cursor->>'at')::timestamptz,cursor->>'kind',(cursor->>'id')::uuid);
 if exists(select from jsonb_array_elements(r->'rows')x where (x->>'id')::uuid=any(seen)) then raise exception 'composite cursor repeated rows';end if;
end $$;
reset role;
-- Reset removes durable claims/receipts while retaining Auth. No real owner is touched.
set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
select set_config('transfer_test.reset_id',gen_random_uuid()::text,true);
select budget_tracker.begin_financial_reset('00000000-0000-4000-8000-000000049002',current_setting('transfer_test.reset_id')::uuid);
update budget_tracker.financial_resets set settle_after=now()-interval '1 minute' where request_id=current_setting('transfer_test.reset_id')::uuid;
select set_config('transfer_test.reset_token',budget_tracker.claim_financial_reset(current_setting('transfer_test.reset_id')::uuid)::text,true);
select budget_tracker.complete_financial_reset(current_setting('transfer_test.reset_id')::uuid,current_setting('transfer_test.reset_token')::uuid);
do $$begin if exists(select from budget_tracker.payment_transfer_requests where user_id='00000000-0000-4000-8000-000000049002') or exists(select from budget_tracker.financial_activity_ids where user_id='00000000-0000-4000-8000-000000049002') or not exists(select from auth.users where id='00000000-0000-4000-8000-000000049002') then raise exception 'reset retained claims or removed Auth';end if;end $$;
do $$begin if not exists(select from budget_tracker.attachment_cleanup_jobs where owner_id='00000000-0000-4000-8000-000000049001') then raise exception 'proof cleanup not queued';end if;end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000049002';set local role authenticated;
do $$begin
 if budget_tracker.transfer_entry_status('00000000-0000-4000-8000-000000049101')->>'state'<>'not_found' then raise exception 'foreign tombstone disclosed';end if;
 if jsonb_array_length(budget_tracker.activity_history_page(date_trunc('month',now())::date)->'rows')<>0 then raise exception 'foreign history exposed';end if;
end $$;
reset role;
set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
delete from auth.users where id in ('00000000-0000-4000-8000-000000049001','00000000-0000-4000-8000-000000049002');
do $$begin if exists(select from budget_tracker.payment_transfer_requests where user_id='00000000-0000-4000-8000-000000049001') or exists(select from budget_tracker.financial_activity_ids where user_id='00000000-0000-4000-8000-000000049001') then raise exception 'Auth cascade retained private data';end if;end $$;

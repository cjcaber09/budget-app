-- Synthetic owners, enclosed in the runner's BEGIN/ROLLBACK; no lasting deployment.
insert into auth.users(id)values('00000000-0000-4000-8000-000000046001'),('00000000-0000-4000-8000-000000046002');
insert into budget_tracker.profiles(user_id,timezone,currency)values('00000000-0000-4000-8000-000000046001','Asia/Manila','PHP'),('00000000-0000-4000-8000-000000046002','UTC','USD');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000046001';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$
declare src budget_tracker.payment_methods;dst budget_tracker.payment_methods;card budget_tracker.payment_methods;f budget_tracker.payment_transfers;
 today date:=(now() at time zone 'Asia/Manila')::date;month date;payload jsonb;snap jsonb;fee_id uuid;rows jsonb;
begin
 month:=date_trunc('month',today)::date;
 src:=budget_tracker.save_payment_method(jsonb_build_object('operation','create','id',gen_random_uuid(),'method','bank_account','paymentType','Savings account','name','Synthetic source','openingBalance','1015.00'));
 dst:=budget_tracker.save_payment_method(jsonb_build_object('operation','create','id',gen_random_uuid(),'method','wallet','paymentType','E-wallet','name','Synthetic destination','openingBalance','0.00'));
 payload:=jsonb_build_object('operation','create','id','00000000-0000-4000-8000-000000046101','sourceId',src.id,'destinationId',dst.id,'amount','1000.00','feeAmount','15.00','feeMode','added','payload_version',2,'date',today,'note',null);
 f:=budget_tracker.save_payment_transfer_with_fee(payload);perform budget_tracker.save_payment_transfer_with_fee(payload);
 select id into fee_id from budget_tracker.transactions where transfer_id=f.id;
 if (select count(*) from budget_tracker.transactions where transfer_id=f.id)<>1 or fee_id is null then raise exception 'Retry did not preserve one fee';end if;
 snap:=budget_tracker.payment_method_snapshot();
 if snap->>'transferFeeVersion'<>'1' or not exists(select from jsonb_array_elements(snap->'methods')x where x->>'id'=src.id::text and (x->>'balance')::numeric=0)
 or not exists(select from jsonb_array_elements(snap->'methods')x where x->>'id'=dst.id::text and (x->>'balance')::numeric=1000) then raise exception 'Added fee balances wrong';end if;
 if (budget_tracker.dashboard_snapshot(month)->>'expenseCents')::numeric<>1500 or budget_tracker.reporting_snapshot(month)->'totals'->>'expense'<>'1500' then raise exception 'Fee reports do not reconcile';end if;
 rows:=budget_tracker.report_transfer_history(month)->'rows';
 if rows->0->>'amount'<>'100000' or rows->0->>'fee_amount'<>'1500' then raise exception 'Report cents transport wrong';end if;
 if (select x->>'fee_amount' from jsonb_array_elements(snap->'transfers')x where x->>'id'=f.id::text)<>'15.00' then raise exception 'Snapshot decimal transport wrong';end if;
 if not exists(select from jsonb_array_elements(budget_tracker.transaction_export_snapshot(month)->'rows')x where x->>'transaction_id'=fee_id::text and x->>'amount'='1500') then raise exception 'Fee missing from exact export';end if;
 begin perform budget_tracker.save_payment_transfer(payload||'{"feeAmount":"16.00"}');raise exception 'Conflicting retry accepted';exception when unique_violation then null;end;
 begin perform budget_tracker.save_payment_transfer(payload||'{"operation":"update","feeAmount":"16.00"}');raise exception 'Fee-only increase overdrew source';exception when sqlstate 'BT001' then null;end;
 perform budget_tracker.save_payment_transfer(payload||'{"operation":"update"}');
 if (select id from budget_tracker.transactions where transfer_id=f.id)<>fee_id then raise exception 'Unchanged edit replaced fee';end if;
 -- Freed fee funds must be included when increasing the principal.
 perform budget_tracker.save_payment_transfer(payload||'{"operation":"update","amount":"1010.00","feeAmount":"5.00"}');
 if (select amount from budget_tracker.transactions where id=fee_id)<>5 then raise exception 'Fee edit not atomic';end if;
 -- Legacy updates retain fee metadata; old direct transaction APIs cannot break it.
 perform budget_tracker.save_payment_transfer((payload-'feeAmount'-'feeMode'-'payload_version')||'{"operation":"update","amount":"1010.00"}');
 if (select fee_amount from budget_tracker.payment_transfers where id=f.id)<>5 then raise exception 'Legacy update erased fee';end if;
 begin perform budget_tracker.delete_transaction(fee_id);raise exception 'Ordinary delete removed linked fee';exception when sqlstate 'TF001' then null;end;
 begin update budget_tracker.transactions set amount=4 where id=fee_id;raise exception 'Direct fee edit accepted';exception when sqlstate 'TF001' then null;end;
 begin update budget_tracker.transactions set transfer_id=null where id=fee_id;raise exception 'Direct unlink accepted';exception when sqlstate 'TF001' then null;end;
 begin insert into budget_tracker.transaction_items(user_id,transaction_id,kind,label,amount,position,tax_included)values(auth.uid(),fee_id,'fee','Synthetic detail',5,0,false);raise exception 'Fee items changed independently';exception when sqlstate 'TF001' then null;end;
 if has_table_privilege('authenticated','budget_tracker.transfer_fee_writes','SELECT') or has_function_privilege('authenticated','budget_tracker.check_transfer_fee(uuid,uuid)','EXECUTE') then raise exception 'Private writer exposed';end if;
 perform budget_tracker.save_payment_transfer(jsonb_build_object('operation','delete','id',f.id));
 if exists(select from budget_tracker.transactions where id=fee_id) then raise exception 'Transfer delete orphaned fee';end if;
 if (budget_tracker.dashboard_snapshot(month)->>'expenseCents')::numeric<>0 then raise exception 'Deleted fee still counted';end if;
 -- Deducted mode persists only the money received, keeping the principal balanced.
 f:=budget_tracker.save_payment_transfer(payload||'{"amount":"985.00","feeMode":"deducted"}');
 if f.amount<>985 or f.fee_amount<>15 then raise exception 'Deducted principal wrong';end if;
 snap:=budget_tracker.payment_method_snapshot();
 if not exists(select from jsonb_array_elements(snap->'methods')x where x->>'id'=src.id::text and (x->>'balance')::numeric=15)
 or not exists(select from jsonb_array_elements(snap->'methods')x where x->>'id'=dst.id::text and (x->>'balance')::numeric=985) then raise exception 'Deducted balances wrong';end if;
 begin perform budget_tracker.save_payment_transfer(payload||'{"operation":"update","feeAmount":"-1.00"}');raise exception 'Negative fee accepted';exception when invalid_parameter_value then null;end;
 begin perform budget_tracker.save_payment_transfer(payload||'{"operation":"update","amount":"9999999999.99"}');raise exception 'Combined overflow accepted';exception when invalid_parameter_value then null;end;
 begin perform budget_tracker.save_payment_transfer(payload||'{"operation":"update","feeMode":"unknown"}');raise exception 'Unknown fee mode accepted';exception when invalid_parameter_value then null;end;
 -- Explicit removal means no fee transaction, never a zero-value expense.
 perform budget_tracker.save_payment_transfer(payload||'{"operation":"update","amount":"985.00","feeAmount":"0.00"}');
 if exists(select from budget_tracker.transactions where transfer_id=f.id) then raise exception 'Zero fee expense retained';end if;
 perform budget_tracker.save_payment_transfer(payload||'{"operation":"update","amount":"985.00","feeAmount":"15.00","feeMode":"deducted"}');
 perform budget_tracker.save_payment_transfer(payload||jsonb_build_object('operation','update','amount','985.00','feeMode','deducted','date',today+1));
 snap:=budget_tracker.payment_method_snapshot();
 if not exists(select from jsonb_array_elements(snap->'methods')x where x->>'id'=src.id::text and (x->>'balance')::numeric=1015) then raise exception 'Future fee affected present balance';end if;
 perform budget_tracker.save_payment_transfer(jsonb_build_object('operation','delete','id',f.id));
 -- Credit source tracks liability without inventing a credit limit.
 card:=budget_tracker.save_payment_method(jsonb_build_object('operation','create','id',gen_random_uuid(),'method','card','paymentType','Credit card','name','Synthetic credit','openingBalance','0.00'));
 f:=budget_tracker.save_payment_transfer(payload||jsonb_build_object('sourceId',card.id));
 snap:=budget_tracker.payment_method_snapshot();
 if not exists(select from jsonb_array_elements(snap->'methods')x where x->>'id'=card.id::text and (x->>'balance')::numeric=-1015) then raise exception 'Credit fee did not increase debt';end if;
 perform budget_tracker.save_payment_method(jsonb_build_object('id',card.id,'operation','archive'));
 perform budget_tracker.save_payment_transfer(payload||jsonb_build_object('operation','update','sourceId',card.id,'note','Preserved archived fee'));
 if (select count(*) from budget_tracker.transactions where transfer_id=f.id)<>1 then raise exception 'Archived unchanged fee was replaced';end if;
 begin perform budget_tracker.save_payment_transfer(payload||jsonb_build_object('id',gen_random_uuid(),'sourceId',(select id from budget_tracker.payment_methods where user_id=auth.uid() and method='cash')));raise exception 'Unset source funded transfer and fee';exception when sqlstate 'BT002' then null;end;
 perform set_config('test.fee_transfer',f.id::text,true);
 perform set_config('test.fee_card',card.id::text,true);
 perform set_config('test.fee_source',src.id::text,true);
 perform set_config('test.fee_destination',dst.id::text,true);
end $$;
set constraints all immediate;set constraints all deferred;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000046002';
do $$begin
 begin perform budget_tracker.save_payment_transfer(jsonb_build_object('operation','delete','id',current_setting('test.fee_transfer')));raise exception 'Foreign fee transfer deleted';exception when insufficient_privilege then null;end;
 if exists(select from budget_tracker.transactions where transfer_id=current_setting('test.fee_transfer')::uuid) then raise exception 'Foreign fee visible';end if;
 begin perform budget_tracker.save_payment_transfer(jsonb_build_object('id',gen_random_uuid(),'operation','create','sourceId',current_setting('test.fee_source'),'destinationId',current_setting('test.fee_destination'),'amount','1.00','date',current_date));raise exception 'Foreign methods accepted';exception when invalid_parameter_value then null;end;
end $$;
-- Build a separate owned fee to verify actual Auth cascades, not an auth lookup fallback.
do $$declare src budget_tracker.payment_methods;dst budget_tracker.payment_methods;begin
 src:=budget_tracker.save_payment_method(jsonb_build_object('operation','create','id',gen_random_uuid(),'method','bank_account','paymentType','Checking account','name','Synthetic cascade source','openingBalance','10.00'));
 dst:=budget_tracker.save_payment_method(jsonb_build_object('operation','create','id',gen_random_uuid(),'method','wallet','paymentType','E-wallet','name','Synthetic cascade destination','openingBalance','0.00'));
 perform budget_tracker.save_payment_transfer(jsonb_build_object('operation','create','id',gen_random_uuid(),'sourceId',src.id,'destinationId',dst.id,'amount','5.00','feeAmount','1.00','feeMode','added','payload_version',2,'date',(now() at time zone 'UTC')::date));
end $$;
reset role;set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
delete from auth.users where id='00000000-0000-4000-8000-000000046002';
do $$begin if exists(select from budget_tracker.transactions where user_id='00000000-0000-4000-8000-000000046002') or exists(select from budget_tracker.payment_transfers where user_id='00000000-0000-4000-8000-000000046002')then raise exception 'Auth cascade retained fees';end if;end $$;
-- Align fee and principal at the same baseline: neither is counted twice.
update budget_tracker.payment_methods set baseline_at=clock_timestamp()+interval '1 second' where id=current_setting('test.fee_card')::uuid;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000046001';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$begin
 if not exists(select from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')x where x->>'id'=current_setting('test.fee_card') and (x->>'balance')::numeric=0)then raise exception 'Baseline double-counted fees';end if;
end $$;
reset role;set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
do $$declare job budget_tracker.financial_resets;token uuid;begin
 job:=budget_tracker.begin_financial_reset('00000000-0000-4000-8000-000000046001',gen_random_uuid());
 token:=budget_tracker.claim_financial_reset(job.request_id);
 update budget_tracker.financial_resets set settle_after=now()-interval '1 minute' where owner_id=job.owner_id;
 perform budget_tracker.complete_financial_reset(job.request_id,token);
 if exists(select from budget_tracker.transactions where user_id=job.owner_id) or exists(select from budget_tracker.payment_transfers where user_id=job.owner_id)
 or exists(select from budget_tracker.transfer_fee_writes) then raise exception 'Reset retained fee data';end if;
end $$;
set constraints all immediate;set constraints all deferred;

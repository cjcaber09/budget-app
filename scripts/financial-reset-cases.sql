insert into auth.users(id)values('00000000-0000-4000-8000-000000009961'),('00000000-0000-4000-8000-000000009962');
insert into budget_tracker.profiles(user_id,display_name,timezone,currency,appearance,avatar_path)values
 ('00000000-0000-4000-8000-000000009961','Keep this profile','Asia/Manila','PHP','dark','00000000-0000-4000-8000-000000009961/avatar.png'),
 ('00000000-0000-4000-8000-000000009962','Other owner','UTC','USD','light',null);
insert into storage.objects(bucket_id,name,metadata)values('budget-tracker-avatars','00000000-0000-4000-8000-000000009961/avatar.png','{"mimetype":"image/png","size":12}');
insert into storage.objects(bucket_id,name,metadata)values('budget-tracker-ocr','00000000-0000-4000-8000-000000009962/synthetic.txt','{"mimetype":"text/plain","size":12}');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009961';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$
declare c uuid;t budget_tracker.transactions;m budget_tracker.payment_methods;n budget_tracker.payment_methods;s budget_tracker.income_sources;r budget_tracker.recurring_rules;o budget_tracker.recurring_occurrences;expected text;day date:=(now() at time zone 'Asia/Manila')::date;
begin
 insert into budget_tracker.categories(user_id,name,color,icon)values(auth.uid(),'Custom reset category','#55816A','cart')returning id into c;
 perform budget_tracker.set_monthly_allowance(date_trunc('month',day)::date,'1000.00');
 perform budget_tracker.set_category_budget(c,date_trunc('month',day)::date,'100.00');
 m:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','wallet','paymentType','E-wallet','name','Reset wallet','openingBalance','1000.00'));
 n:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','bank_account','paymentType','Bank account','name','Reset bank','openingBalance','0.00'));
 s:=budget_tracker.save_income_source(jsonb_build_object('id',gen_random_uuid(),'operation','create','name','Reset income source'));
 t:=budget_tracker.save_transaction(jsonb_build_object('id','00000000-0000-4000-8000-000000009963','operation','create','payload_version',4,'type','income','category_id',null,'amount','20.00','note','Reset income','income_source_id',s.id,'payment_method_id',m.id,'occurred_at',now(),'transaction_date',day),'[{"kind":"item","label":"Salary","amount":"20.00","quantity":null,"unit_price":null,"tax_included":false}]');
 perform budget_tracker.reserve_transaction_attachment(t.id,'{"id":"00000000-0000-4000-8000-000000009964","name":"Reset.webp","mime":"image/webp","size":12}');
 perform budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','payload_version',4,'type','expense','category_id',c,'amount','10.00','note','Reset expense','payment_method_id',m.id,'occurred_at',now(),'transaction_date',day),'[]');
 perform budget_tracker.save_payment_transfer(jsonb_build_object('id',gen_random_uuid(),'operation','create','sourceId',m.id,'destinationId',n.id,'amount','5.00','date',day));
 select entry->>'balance' into expected from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')entry where (entry->>'id')::uuid=m.id;
 perform budget_tracker.correct_method_balance(jsonb_build_object('id',gen_random_uuid(),'methodId',m.id,'expectedBalance',expected,'targetBalance','1005.00','note','Reset correction'));
 r:=budget_tracker.save_recurring_rule(jsonb_build_object('command','save','categoryId',c,'amount','5.00','note','Reset bill','frequency','monthly','nextDueDate',day+1,'paymentMethodId',m.id));
 select * into o from budget_tracker.recurring_occurrences where rule_id=r.id order by scheduled_date limit 1;
 perform budget_tracker.pay_bill(o.id,m.id,gen_random_uuid(),'5.00',o.scheduled_date);
 if has_table_privilege('authenticated','budget_tracker.financial_resets','SELECT') or has_function_privilege('authenticated','budget_tracker.begin_financial_reset(uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','budget_tracker.complete_financial_reset(uuid,uuid)','EXECUTE') then raise exception 'Client can bypass password verification';end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009962';
select budget_tracker.save_transaction('{"id":"00000000-0000-4000-8000-000000009968","operation":"create","payload_version":4,"type":"income","category_id":null,"amount":"10.00","note":"Keep other owner data","occurred_at":"2026-10-11T12:00:00Z","transaction_date":"2026-10-11"}','[]');
select budget_tracker.payment_method_snapshot();
reset role;set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
insert into budget_tracker.ocr_scans(id,user_id,request_id,image_sha256,status,char_count)values(gen_random_uuid(),'00000000-0000-4000-8000-000000009961',gen_random_uuid(),repeat('a',64),'completed',10);
do $$declare j budget_tracker.financial_resets;begin
 j:=budget_tracker.begin_financial_reset('00000000-0000-4000-8000-000000009961','00000000-0000-4000-8000-000000009965');
 perform set_config('test.reset_token',budget_tracker.claim_financial_reset(j.request_id)::text,true);
 if budget_tracker.account_is_active(j.owner_id) then raise exception 'Reset did not pause financial activity';end if;
 if (budget_tracker.begin_financial_reset(j.owner_id,'00000000-0000-4000-8000-000000009966')).request_id<>j.request_id then raise exception 'Concurrent reset created a second job';end if;
 begin perform budget_tracker.begin_account_deletion(j.owner_id,gen_random_uuid());raise exception 'Account deletion overlapped reset';exception when insufficient_privilege then null;end;
 begin perform budget_tracker.complete_financial_reset(j.request_id,current_setting('test.reset_token')::uuid);raise exception 'Settling check bypassed';exception when sqlstate '55000' then null;end;
end $$;
update budget_tracker.financial_resets set settle_after=now()-interval '1 minute' where owner_id='00000000-0000-4000-8000-000000009961';
do $$begin
 begin perform budget_tracker.complete_financial_reset('00000000-0000-4000-8000-000000009965',current_setting('test.reset_token')::uuid);raise exception 'Live upload ignored';exception when sqlstate '55000' then null;end;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009961';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$begin
 if budget_tracker.financial_reset_status()->>'requestId'<>'00000000-0000-4000-8000-000000009965' then raise exception 'Owned reset status missing';end if;
 begin update budget_tracker.profiles set display_name='Must stay unchanged' where user_id=auth.uid();raise exception 'Writes allowed during reset';exception when insufficient_privilege then null;end;
 if budget_tracker.proof_upload_allowed('00000000-0000-4000-8000-000000009961/00000000-0000-4000-8000-000000009963/00000000-0000-4000-8000-000000009964.webp') then raise exception 'Upload allowed during reset';end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009962';
do $$begin if budget_tracker.financial_reset_status('00000000-0000-4000-8000-000000009965') is not null then raise exception 'Another owner can inspect reset';end if;end $$;
reset role;set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
update budget_tracker.account_scan_leases set expires_at=now()-interval '1 minute' where owner_id='00000000-0000-4000-8000-000000009961';
update budget_tracker.financial_resets set lease_until=now()-interval '1 minute' where request_id='00000000-0000-4000-8000-000000009965';
do $$declare old_token uuid:=current_setting('test.reset_token')::uuid;new_token uuid;begin
 new_token:=budget_tracker.claim_financial_reset('00000000-0000-4000-8000-000000009965');
 if new_token is null or new_token=old_token then raise exception 'Worker lease token was not replaced';end if;
 if budget_tracker.can_cleanup_financial_reset('00000000-0000-4000-8000-000000009965',old_token,'00000000-0000-4000-8000-000000009961') then raise exception 'Stale worker may remove files';end if;
 begin perform budget_tracker.complete_financial_reset('00000000-0000-4000-8000-000000009965',old_token);raise exception 'Stale worker completed reset';exception when sqlstate '55000' then null;end;
 perform set_config('test.reset_token',new_token::text,true);
end $$;
do $$begin
 perform budget_tracker.complete_financial_reset('00000000-0000-4000-8000-000000009965',current_setting('test.reset_token')::uuid);
 if not exists(select from auth.users where id='00000000-0000-4000-8000-000000009961') then raise exception 'Reset removed Auth';end if;
 if not exists(select from budget_tracker.profiles where user_id='00000000-0000-4000-8000-000000009961' and display_name='Keep this profile' and currency='PHP' and timezone='Asia/Manila' and appearance='dark' and avatar_path is not null) then raise exception 'Reset changed profile or preferences';end if;
 if not exists(select from storage.objects where bucket_id='budget-tracker-avatars' and name='00000000-0000-4000-8000-000000009961/avatar.png') then raise exception 'Reset removed avatar';end if;
 if (select count(*) from budget_tracker.categories where user_id='00000000-0000-4000-8000-000000009961' and is_default)<>7 or exists(select from budget_tracker.categories where user_id='00000000-0000-4000-8000-000000009961' and not is_default) then raise exception 'Default categories not restored';end if;
 if(select count(*) from budget_tracker.payment_methods where user_id='00000000-0000-4000-8000-000000009961')<>1 or not exists(select from budget_tracker.payment_methods where user_id='00000000-0000-4000-8000-000000009961' and method='cash' and opening_balance is null and baseline_at is null) then raise exception 'Fresh Cash was not restored';end if;
 if exists(select from budget_tracker.transactions where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.transaction_items where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.recurring_rules where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.recurring_occurrences where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.budgets where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.monthly_limits where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.payment_transfers where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.balance_corrections where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.income_sources where user_id='00000000-0000-4000-8000-000000009961') or exists(select from budget_tracker.transaction_attachments where user_id='00000000-0000-4000-8000-000000009961') then raise exception 'Financial records remain';end if;
 if (select count(*) from budget_tracker.ocr_scans where user_id='00000000-0000-4000-8000-000000009961')<>1 or exists(select from budget_tracker.ocr_scans where user_id='00000000-0000-4000-8000-000000009961' and status<>'deleted') then raise exception 'Scanning quota ledger reset or history visible';end if;
 if not budget_tracker.account_is_active('00000000-0000-4000-8000-000000009961') then raise exception 'Account did not resume';end if;
 if not exists(select from budget_tracker.profiles where user_id='00000000-0000-4000-8000-000000009962') or(select count(*) from budget_tracker.categories where user_id='00000000-0000-4000-8000-000000009962')<>7 then raise exception 'Another owner changed';end if;
 if not exists(select from budget_tracker.transactions where id='00000000-0000-4000-8000-000000009968') or(select count(*) from budget_tracker.payment_methods where user_id='00000000-0000-4000-8000-000000009962')<>1 or not exists(select from storage.objects where bucket_id='budget-tracker-ocr' and name='00000000-0000-4000-8000-000000009962/synthetic.txt') then raise exception 'Another owner financial data or files changed';end if;
 if budget_tracker.claim_financial_reset('00000000-0000-4000-8000-000000009965') is not null then raise exception 'Completed reset reclaimed';end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009961';set local request.jwt.claim.role='authenticated';set local role authenticated;
select budget_tracker.save_transaction('{"id":"00000000-0000-4000-8000-000000009967","operation":"create","payload_version":4,"type":"income","category_id":null,"amount":"1.00","note":"After fresh start","occurred_at":"2026-10-11T12:00:00Z","transaction_date":"2026-10-11"}','[]');
reset role;set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
select budget_tracker.complete_financial_reset('00000000-0000-4000-8000-000000009965');
do $$begin if not exists(select from budget_tracker.transactions where id='00000000-0000-4000-8000-000000009967') then raise exception 'Completed retry erased new activity';end if;end $$;

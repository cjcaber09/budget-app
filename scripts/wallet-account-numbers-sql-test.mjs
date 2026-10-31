import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
async function runCheck(project,query,result){
 if(!process.argv.includes('--local'))return runSqlCheck(project,query,result);
 const r=spawnSync('docker',['exec','-i','budget-wallet-sql','psql','-U','postgres','-d',process.env.WALLET_TEST_DATABASE||'wallet_test_0037','-v','ON_ERROR_STOP=1','-q'],{input:query,encoding:'utf8',windowsHide:true});
 if(r.status!==0)throw new Error(r.stderr);if(!r.stdout.includes(result))throw new Error('SQL result missing');console.log('PASS local wallet SQL checks.');
}

import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const local=process.argv.includes('--local');
const project=local?null:loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0037_wallet_account_numbers.sql','utf8');
const result='PASS wallet identifiers, compatibility, retries, privacy and owner isolation';
await runCheck(project,`begin;set local lock_timeout='3s';set local statement_timeout='20s';${migration}
insert into auth.users(id)values('00000000-0000-4000-8000-000000003701'),('00000000-0000-4000-8000-000000003702');
insert into budget_tracker.profiles(user_id,timezone)values('00000000-0000-4000-8000-000000003701','UTC'),('00000000-0000-4000-8000-000000003702','UTC');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000003701';set local role authenticated;
do $$declare payload jsonb;wallet budget_tracker.payment_methods;baseline timestamptz;snapshot jsonb;invalid text;
begin
payload:=jsonb_build_object('operation','create','id','00000000-0000-4000-8000-000000003703','method','wallet','name','Synthetic wallet','paymentType','E-wallet','lastFour',null,'openingBalance','100.00','walletAccountNumber','09123456789');
wallet:=budget_tracker.save_payment_method(payload);baseline:=wallet.baseline_at;
if wallet.wallet_account_number is distinct from '09123456789' then raise exception 'Leading zeros lost';end if;
if (budget_tracker.save_payment_method(payload)).id<>wallet.id then raise exception 'Exact retry failed';end if;
begin perform budget_tracker.save_payment_method(payload||jsonb_build_object('walletAccountNumber','09123456780'));raise exception 'Conflicting retry accepted';exception when unique_violation then null;end;
wallet:=budget_tracker.save_payment_method((payload-'walletAccountNumber')||jsonb_build_object('operation','update','name','Renamed wallet'));
if wallet.wallet_account_number is distinct from '09123456789' or wallet.baseline_at<>baseline then raise exception 'Old client edit erased metadata or moved baseline';end if;
snapshot:=budget_tracker.payment_method_snapshot();
if snapshot->>'transferFeeVersion' is distinct from '1' or snapshot->>'transferEntryVersion' is distinct from '1' or snapshot->>'refundVersion' is distinct from '1' then raise exception 'Existing snapshot capabilities lost';end if;
if not exists(select from jsonb_array_elements(snapshot->'methods')m where m->>'id'=wallet.id::text and (m->>'balance')::numeric=100) then raise exception 'Wallet balance changed';end if;
if snapshot->>'walletAccountNumberVersion' is distinct from '1' or not exists(select from jsonb_array_elements(snapshot->'methods')m where m->>'id'=wallet.id::text and m->>'wallet_account_number'='09123456789') then raise exception 'Snapshot metadata/capability missing';end if;
wallet:=budget_tracker.save_payment_method(payload||jsonb_build_object('operation','update','walletAccountNumber',null));if wallet.wallet_account_number is not null then raise exception 'Explicit clear failed';end if;
wallet:=budget_tracker.save_payment_method(payload||jsonb_build_object('operation','update','walletAccountNumber','+639123456789'));if wallet.wallet_account_number is distinct from '+639123456789' then raise exception 'International identifier lost';end if;
foreach invalid in array array['1234','123456789012345678901','abc123456',chr(65297)||chr(65298)||chr(65299)||chr(65300)||chr(65301),'123 456','123-456'] loop
 begin perform budget_tracker.save_payment_method(payload||jsonb_build_object('id',gen_random_uuid(),'walletAccountNumber',invalid));raise exception 'Invalid wallet identifier accepted';exception when invalid_parameter_value then null;end;
end loop;
begin perform budget_tracker.save_payment_method(payload||jsonb_build_object('id',gen_random_uuid(),'walletAccountNumber',123456));raise exception 'Numeric identifier accepted';exception when invalid_parameter_value then null;end;
begin perform budget_tracker.save_payment_method(payload||jsonb_build_object('id',gen_random_uuid(),'method','card','paymentType','Debit card'));raise exception 'Card accepted wallet identifier';exception when invalid_parameter_value then null;end;
begin perform budget_tracker.save_payment_method(payload||jsonb_build_object('id',gen_random_uuid(),'method','card','paymentType','Debit card','walletAccountNumber',null,'lastFour','1234567890123456'));raise exception 'Card privacy weakened';exception when check_violation then null;end;
perform budget_tracker.save_payment_method(jsonb_build_object('id',wallet.id,'operation','archive'));perform budget_tracker.save_payment_method(jsonb_build_object('id',wallet.id,'operation','restore'));
select * into wallet from budget_tracker.payment_methods where id=wallet.id;if wallet.wallet_account_number is distinct from '+639123456789' then raise exception 'Archive lost identifier';end if;
perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003702',true);
if exists(select from budget_tracker.payment_methods where id=wallet.id) then raise exception 'Foreign wallet visible';end if;
begin perform budget_tracker.save_payment_method(payload||jsonb_build_object('operation','update'));raise exception 'Foreign wallet edit allowed';exception when insufficient_privilege then null;end;
if exists(select from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods')m where m->>'id'=wallet.id::text) then raise exception 'Foreign wallet snapshot leak';end if;
end $$;
reset role;
do $$begin if has_function_privilege('anon','budget_tracker.save_payment_method(jsonb)','execute') then raise exception 'Anonymous write access';end if;end $$;
rollback;select '${result}' as result;`,result);

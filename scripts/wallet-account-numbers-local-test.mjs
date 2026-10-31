// Uses only the named network-isolated disposable container; never reads hosted credentials.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const database='wallet_test_'+Date.now();
function sql(query,db=database){const r=spawnSync('docker',['exec','-i','budget-wallet-sql','psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-q'],{input:query,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);}
sql('create database '+database+';','postgres');
try {
sql(`do $$begin
 if not exists(select from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated;end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role;end if;
end $$;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid()to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
create function storage.foldername(text)returns text[] language sql as $$select string_to_array($1,'/')$$;`);
const migrations=['0001_categories','0002_budgets','0003_tenant_scoped_category_fk','0004_transactions','0005_recurring_rules','0006_seed_default_categories','0007_transaction_type','0012_transaction_items','0013_payment_receipts','0014_item_cascade_cleanup','0015_profile_monthly_limits','0016_recurring_occurrences','0017_dashboard_snapshot','0018_phone_notifications','0019_payment_methods'];
for(const m of migrations)sql('begin;'+readFileSync('supabase/migrations/'+m+'.sql','utf8')+'commit;');
sql(`create table budget_tracker.refunds(id uuid primary key,user_id uuid,method_id uuid);
do $$declare d text;begin
 d:=pg_get_functiondef('budget_tracker.save_payment_method(jsonb)'::regprocedure);
 execute replace(d,'c.method_id=existing.id)) and coalesce','c.method_id=existing.id) or exists(select from budget_tracker.refunds r where r.user_id=owner_id and r.method_id=existing.id)) and coalesce');
 d:=pg_get_functiondef('budget_tracker.payment_method_snapshot()'::regprocedure);
 d:=replace(d,'''owner'',auth.uid(),','''owner'',auth.uid(),''transferFeeVersion'',1,''transferEntryVersion'',1,''refundVersion'',1,');
 execute replace(d,') has_activity,',' or exists(select from budget_tracker.refunds r where r.user_id=m.user_id and r.method_id=m.id)) has_activity,');
end $$;`);
const result=spawnSync(process.execPath,['scripts/wallet-account-numbers-sql-test.mjs','--local'],{encoding:'utf8',windowsHide:true,env:{...process.env,WALLET_TEST_DATABASE:database}});
if(result.status!==0)throw Error(result.stderr||'Wallet SQL checks failed');console.log(result.stdout.trim());
} finally {sql('drop database '+database+';','postgres');}

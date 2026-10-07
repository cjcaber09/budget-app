// Disposable PostgreSQL only: never connects to the configured Supabase project.
import { readFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
const container = 'budget-receipt-sql';
let database = 'postgres';
function sql(source) {
  const r = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-q'], { input: source, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}
const testDatabase = `receipt_test_${Date.now()}`;
sql(`create database ${testDatabase};`);
database = testDatabase;
sql(`do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; create role authenticated; create role service_role; end if; end $$;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`);
for (const name of ['0001_categories','0002_budgets','0003_tenant_scoped_category_fk','0004_transactions','0005_recurring_rules','0007_transaction_type','0012_transaction_items']) {
  sql(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'));
}
console.log(sql(readFileSync('supabase/tests/receipt-items.sql', 'utf8')).split('\n').filter(line => line.includes('PASS')).map(line => line.trim()).join('\n'));
if (process.argv.includes('--payments') || process.argv.includes('--analytics')) {
  sql(readFileSync('supabase/migrations/0013_payment_receipts.sql','utf8'));
  sql(readFileSync('supabase/migrations/0014_item_cascade_cleanup.sql','utf8'));
  console.log(sql(readFileSync('supabase/tests/payment-receipts.sql','utf8')).split('\n').filter(line => line.includes('PASS')).map(line => line.trim()).join('\n'));
}
if (process.argv.includes('--analytics')) {
  sql(`create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
  for(const name of ['0015_profile_monthly_limits','0016_recurring_occurrences','0017_dashboard_snapshot'])sql('begin;\n'+readFileSync(`supabase/migrations/${name}.sql`,'utf8')+'\ncommit;');
  console.log(sql(readFileSync('supabase/tests/spending-guidance.sql','utf8')).split('\n').filter(line=>line.includes('PASS')).map(line=>line.trim()).join('\n'));
}
// Two connections contend for the same parent. The last save must be whole, never mixed.
function concurrent(amount, delay) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-q'], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('exit', code => code ? reject(new Error(stderr)) : resolve());
    child.stdin.end(`begin; set local role authenticated; set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
      select budget_tracker.save_transaction('{"payload_version":2,"operation":"update","id":"00000000-0000-4000-8000-000000000010","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"${amount}.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}',
      '[{"kind":"item","label":"Concurrent ${amount}","amount":"${amount}.00","quantity":null,"unit_price":null,"tax_included":false}]');
      select pg_sleep(${delay}); commit;`);
  });
}
await Promise.all([concurrent(20, 0.3), concurrent(30, 0)]);
sql(`do $$ begin if (select count(*) from budget_tracker.transaction_items where transaction_id='00000000-0000-4000-8000-000000000010') <> 1
  or (select t.amount <> i.amount from budget_tracker.transactions t join budget_tracker.transaction_items i on i.transaction_id=t.id where t.id='00000000-0000-4000-8000-000000000010') then raise exception 'Concurrent saves mixed rows'; end if; end $$;`);
console.log('PASS concurrent atomic replacement');
if(process.argv.includes('--analytics')) {
 sql(`set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
 select budget_tracker.save_recurring_rule(jsonb_build_object('categoryId','00000000-0000-4000-8000-000000000003','amount','20.00','note','Concurrent catch-up bill','frequency','monthly','nextDueDate',(now() at time zone 'Asia/Manila')::date));`);
 const run=()=>new Promise((resolve,reject)=>{const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-q'],{windowsHide:true});let error='';child.stderr.on('data',c=>error+=c);child.on('error',reject);child.on('exit',code=>code?reject(Error(error)):resolve());child.stdin.end(`set role authenticated;set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';select budget_tracker.prepare_dashboard(date_trunc('month',now() at time zone 'Asia/Manila')::date);`);});
 await Promise.all([run(),run()]);
 sql(`do $$begin if(select count(*) from budget_tracker.transactions where note='Concurrent catch-up bill')<>1 then raise exception 'Concurrent catch-up duplicated bill';end if;end$$;`);
 console.log('PASS concurrent catch-up records one expense');
}
if (process.argv.includes('--payments') || process.argv.includes('--analytics')) {
  sql(`do $$ begin if not exists(select from pg_roles where rolname='receipt_auth_admin') then create role receipt_auth_admin; end if; end $$;
    grant usage on schema auth to receipt_auth_admin;
    grant select,delete on auth.users to receipt_auth_admin;
    begin; set local role receipt_auth_admin;
    delete from auth.users where id='00000000-0000-4000-8000-000000000001'; commit;
    do $$ begin if exists(select from budget_tracker.transaction_items where user_id='00000000-0000-4000-8000-000000000001') then raise exception 'Cascade items remained'; end if; end $$;`);
  console.log('PASS restricted auth-role deletion cascades itemized transactions');
}

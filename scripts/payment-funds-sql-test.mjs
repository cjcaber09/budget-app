import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0026_payment_funds_guard.sql','utf8');
await runSqlCheck(loadLinkedProject(),'begin;\n'+migration+'\n'+readFileSync('scripts/payment-funds-cases.sql','utf8')+"\nrollback;select 'PASS payment funds' as result;",'PASS payment funds');

import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migrations=process.argv.includes('--deployed')?'':['0030_financial_reset.sql','0031_confirmed_bill_payments.sql'].map(name=>readFileSync('supabase/migrations/'+name,'utf8')).join('\n');
const cases=['confirmed-bills-cases.sql','financial-reset-cases.sql','mvp-exports-account-cases.sql'].map(name=>readFileSync('scripts/'+name,'utf8')).join('\n');
await runSqlCheck(project,'begin;\n'+migrations+'\n'+cases+"\nrollback;select 'PASS confirmed bills and safeguards' as result;",'PASS confirmed bills and safeguards');

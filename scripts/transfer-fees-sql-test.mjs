import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0032_transfer_fees.sql','utf8');
const cases=['transfer-fees-cases.sql','financial-reset-cases.sql','mvp-exports-account-cases.sql'].map(name=>readFileSync('scripts/'+name,'utf8')).join('\n');
await runSqlCheck(project,'begin;\n'+migration+'\n'+cases+"\nrollback;select 'PASS transfer fees and safeguards' as result;",'PASS transfer fees and safeguards');

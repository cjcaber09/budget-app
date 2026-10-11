import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0030_financial_reset.sql','utf8');
const query='begin;\n'+migration+'\n'+readFileSync('scripts/financial-reset-cases.sql','utf8')+'\n'+readFileSync('scripts/mvp-exports-account-cases.sql','utf8')+"\nrollback;select 'PASS financial reset and MVP safeguards' as result;";
await runSqlCheck(project,query,'PASS financial reset and MVP safeguards');


import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0029_transaction_attachments.sql','utf8').replace(/^\uFEFF/,'');
const query='begin;\n'+migration+'\n'+readFileSync('scripts/transaction-attachments-cases.sql','utf8')+"\nrollback;select 'PASS attachments' as result;";
await runSqlCheck(project,query,'PASS attachments');

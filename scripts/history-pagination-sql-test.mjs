import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0025_transaction_history_pages.sql','utf8');
await runSqlCheck(loadLinkedProject(),'begin;\n'+migration+'\n'+readFileSync('scripts/history-pagination-cases.sql','utf8')+"\nrollback;select 'PASS history pagination' as result;",'PASS history pagination');

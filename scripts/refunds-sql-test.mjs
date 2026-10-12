import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0034_linked_refunds.sql','utf8');
const cases=readFileSync('scripts/refunds-cases.sql','utf8');
await runSqlCheck(project,'begin;\n'+migration+'\n'+cases+"\nrollback;select 'PASS linked refund safeguards' as result;",'PASS linked refund safeguards');

import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0033_cash_help_initialization.sql','utf8');
const cases=readFileSync('scripts/cash-help-cases.sql','utf8');
await runSqlCheck(project,'begin;\n'+migration+'\n'+cases+"\nrollback;select 'PASS Cash help safeguards' as result;",'PASS Cash help safeguards');

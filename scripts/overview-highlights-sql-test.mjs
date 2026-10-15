// Stage the read-only RPC and synthetic fixtures inside one rolled-back transaction.
import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0036_overview_highlights.sql','utf8');
await runSqlCheck(loadLinkedProject(),'begin;\n'+migration+'\n'+readFileSync('scripts/overview-highlights-cases.sql','utf8')+"\nrollback;select 'PASS overview highlights' result;",'PASS overview highlights');

import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migrations=process.argv.includes('--deployed')?'':['0021_income_sources.sql','0022_reports_expansion.sql'].map(name=>readFileSync('supabase/migrations/'+name,'utf8')).join('\n');
const query='begin;\n'+migrations+'\n'+readFileSync('scripts/reports-expansion-cases.sql','utf8')+"\nrollback;select 'PASS reports expansion' as result;";
await runSqlCheck(project,query,'PASS reports expansion');

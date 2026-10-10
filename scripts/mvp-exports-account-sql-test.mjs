import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migrations=process.argv.includes('--deployed')?'':['0023_csv_exports.sql','0024_account_deletion.sql'].map(name=>readFileSync('supabase/migrations/'+name,'utf8')).join('\n');
const query='begin;\n'+migrations+'\n'+readFileSync('scripts/mvp-exports-account-cases.sql','utf8')+"\nrollback;select 'PASS MVP exports and deletion' as result;";
await runSqlCheck(project,query,'PASS MVP exports and deletion');

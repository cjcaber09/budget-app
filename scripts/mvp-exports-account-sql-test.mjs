import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migrations=process.argv.includes('--deployed')?'':['0023_csv_exports.sql','0024_account_deletion.sql'].map(name=>readFileSync('supabase/migrations/'+name,'utf8')).join('\n');
const query='begin;\n'+migrations+'\n'+readFileSync('scripts/mvp-exports-account-cases.sql','utf8')+"\nrollback;select 'PASS MVP exports and deletion' as result;";
if(process.argv.includes('--diagnose')){
 const response=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${project.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();console.log(response.status,Array.isArray(result)?result.map(r=>r.result).filter(Boolean):String(result.message??'SQL failed').slice(0,600));
}else await runSqlCheck(project,query,'PASS MVP exports and deletion');

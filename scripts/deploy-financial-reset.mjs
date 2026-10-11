import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject(),migration=readFileSync('supabase/migrations/0030_financial_reset.sql','utf8');
const [state]=await queryDatabase(project,"select exists(select from supabase_migrations.schema_migrations where version='0030') as deployed");
if(!process.argv.includes('--apply'))console.log(state.deployed?'Financial reset migration deployed.':'Financial reset migration pending. No changes applied.');
else{
 if(!state.deployed){const literal="'"+migration.replaceAll("'","''")+"'";await queryDatabase(project,`begin;${migration}\ninsert into supabase_migrations.schema_migrations(version,name,statements)values('0030','financial_reset',array[${literal}]);commit;`);}
 const cli=createRequire(import.meta.url).resolve('supabase/dist/supabase.js');
 const r=spawnSync(process.execPath,[cli,'functions','deploy','delete-account','--use-api','--no-verify-jwt','--project-ref',project.ref],{env:{...process.env,SUPABASE_ACCESS_TOKEN:project.accessToken},stdio:'inherit',shell:false,windowsHide:true});
 if(r.error||r.status!==0)throw new Error('Financial reset worker deployment failed.');console.log('Financial reset migration and worker deployed.');
}

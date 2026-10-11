import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=readFileSync('supabase/migrations/0029_transaction_attachments.sql','utf8').replace(/^\uFEFF/,'');
const [state]=await queryDatabase(project,"select exists(select from supabase_migrations.schema_migrations where version='0029') as deployed");
if(!process.argv.includes('--apply'))console.log(state.deployed?'Attachment migration deployed.':'Attachment migration pending.');
else{
 if(!state.deployed){const literal="'"+migration.replaceAll("'","''")+"'";await queryDatabase(project,`begin;${migration}\ninsert into supabase_migrations.schema_migrations(version,name,statements)values('0029','transaction_attachments',array[${literal}]);commit;`);}
 const cli=createRequire(import.meta.url).resolve('supabase/dist/supabase.js');
 const deployed=spawnSync(process.execPath,[cli,'functions','deploy','delete-account','--use-api','--no-verify-jwt','--project-ref',project.ref],{env:{...process.env,SUPABASE_ACCESS_TOKEN:project.accessToken},stdio:'inherit',shell:false,windowsHide:true});
 if(deployed.error||deployed.status!==0)throw new Error('Attachment cleanup deployment failed.');
 console.log('Attachment migration and private cleanup worker deployed.');
}

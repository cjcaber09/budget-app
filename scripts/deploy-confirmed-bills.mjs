import {readFileSync} from 'node:fs';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const [state]=await queryDatabase(project,"select exists(select from supabase_migrations.schema_migrations where version='0030') as reset_deployed,exists(select from supabase_migrations.schema_migrations where version='0031') as deployed");
if(!process.argv.includes('--apply'))console.log(state.deployed?'Confirmed bills migration deployed.':'Confirmed bills migration pending. No changes applied.');
else{
 if(!state.reset_deployed)throw new Error('Deploy the staged finance-reset migration and worker first.');
 if(!state.deployed){
  const migration=readFileSync('supabase/migrations/0031_confirmed_bill_payments.sql','utf8'),literal="'"+migration.replaceAll("'","''")+"'";
  await queryDatabase(project,`begin;${migration}\ninsert into supabase_migrations.schema_migrations(version,name,statements)values('0031','confirmed_bill_payments',array[${literal}]);commit;`);
 }
 console.log('Confirmed bills migration deployed.');
}

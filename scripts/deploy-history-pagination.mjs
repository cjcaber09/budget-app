import {readFileSync} from 'node:fs';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';

// Deploy this reviewed migration alone; later local migrations may still be drafts.
const project=loadLinkedProject();
const migration=readFileSync('supabase/migrations/0025_transaction_history_pages.sql','utf8');
const [state]=await queryDatabase(project,`select exists(select from supabase_migrations.schema_migrations where version='0025') as deployed`);
if(state?.deployed){
 console.log('History migration is already deployed.');
}else if(!process.argv.includes('--apply')){
 console.log('History migration is pending. Use --apply to deploy only 0025.');
}else{
 const literal="'"+migration.replaceAll("'","''")+"'";
 await queryDatabase(project,`begin;
  ${migration}
  insert into supabase_migrations.schema_migrations(version,name,statements)
  values('0025','transaction_history_pages',array[${literal}]);
  commit;`);
 console.log('Deployed history migration 0025.');
}

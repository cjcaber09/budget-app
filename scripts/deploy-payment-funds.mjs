import {readFileSync} from 'node:fs';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=readFileSync('supabase/migrations/0026_payment_funds_guard.sql','utf8');
const [state]=await queryDatabase(project,"select exists(select from supabase_migrations.schema_migrations where version='0026') as deployed");
if(state.deployed)console.log('Payment funds migration already deployed.');
else if(!process.argv.includes('--apply'))console.log('Payment funds migration pending.');
else{
 const literal="'"+migration.replaceAll("'","''")+"'";
 await queryDatabase(project,`begin;${migration}
 insert into supabase_migrations.schema_migrations(version,name,statements) values('0026','payment_funds_guard',array[${literal}]);commit;`);
 console.log('Deployed payment funds migration 0026.');
}

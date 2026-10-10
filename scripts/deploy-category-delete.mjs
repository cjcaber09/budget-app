import {readFileSync} from 'node:fs';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=readFileSync('supabase/migrations/0028_category_delete_guard.sql','utf8');
const [state]=await queryDatabase(project,"select exists(select from supabase_migrations.schema_migrations where version='0028') as deployed");
if(state.deployed) console.log('Category deletion guard already deployed.');
else if(!process.argv.includes('--apply')) console.log('Category deletion guard pending.');
else {
 const literal="'"+migration.replaceAll("'","''")+"'";
 await queryDatabase(project,`begin;${migration}
 insert into supabase_migrations.schema_migrations(version,name,statements) values('0028','category_delete_guard',array[${literal}]);commit;`);
 console.log('Deployed category deletion guard.');
}

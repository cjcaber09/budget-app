import {readFileSync} from 'node:fs';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0040_activity_balance_history.sql','utf8');
const query='begin;\n'+migration+'\n'+readFileSync('supabase/tests/activity-balance-history.sql','utf8')+'\nrollback;';
try{const rows=await queryDatabase(project,query);const result=rows.find(row=>typeof row.result==='string'&&row.result.startsWith('PASS exact Cash'));if(!result)throw Error('SQL assertions did not complete');console.log(result.result+' (synthetic data rolled back).');}
catch(error){console.error('FAIL balance-history SQL checks; remote content withheld.');process.exitCode=1;}

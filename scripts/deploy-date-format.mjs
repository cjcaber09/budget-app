import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {loadLinkedProject} from './lib/supabase-project.mjs';
const project=loadLinkedProject(),cli=createRequire(import.meta.url).resolve('supabase/dist/supabase.js');
for(const args of [process.argv.includes('--apply')?['db','push','--yes']:['db','push','--dry-run'],['migration','list']]){
 const result=spawnSync(process.execPath,[cli,...args],{env:{...process.env,SUPABASE_ACCESS_TOKEN:project.accessToken},stdio:'inherit',windowsHide:true});
 if(result.error||result.status!==0)throw new Error('Date-format migration deployment failed.');
}

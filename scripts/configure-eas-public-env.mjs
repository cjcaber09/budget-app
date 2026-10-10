import {loadEnvFile} from 'node:process';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// Run with the resolved eas-cli/bin/run path. Never print values or CLI output.
loadEnvFile();
const cli=process.argv[2];
if(!cli||!existsSync(cli))throw new Error('Provide the installed EAS CLI entry point.');
const config=JSON.parse(readFileSync('app.json','utf8')).expo;
if(config.extra?.eas?.projectId!=='f2dfc717-2d0f-4e31-8279-e4ac485d010f'||config.owner!=='ceejaycabs')throw new Error('Unexpected Expo project.');
const url=new URL(process.env.EXPO_PUBLIC_SUPABASE_URL);
if(url.hostname!==readFileSync('supabase/.temp/project-ref','utf8').trim()+'.supabase.co')throw new Error('Supabase project differs from the linked project.');
for(const name of ['EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_ANON_KEY']){
 const value=process.env[name];if(!value)throw new Error('Required public app configuration is missing.');
 const result=spawnSync(process.execPath,[cli,'env:set','--name',name,'--value',value,'--visibility','sensitive','--environment','preview','--scope','project','--non-interactive'],{encoding:'utf8',windowsHide:true});
 if(result.error||result.status!==0)throw new Error('EAS public configuration failed; response contents were not logged.');
 console.log('Configured '+name+' for preview.');
}

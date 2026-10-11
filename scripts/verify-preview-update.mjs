import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('app.json','utf8')).expo;
const response=await fetch(config.updates.url,{headers:{
 'expo-platform':'android','expo-runtime-version':config.version,'expo-channel-name':'preview',
 'expo-protocol-version':'1',accept:'multipart/mixed,application/expo+json,application/json',
},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error('Update manifest request failed with HTTP '+response.status+'.');
const contentType=response.headers.get('content-type')??'';
const body=await response.text();
let manifest;
if(contentType.includes('multipart/mixed')){
 const boundary=contentType.match(/boundary="?([^";]+)/)?.[1];
 if(!boundary)throw new Error('Update response boundary missing.');
 const part=body.split('--'+boundary).find(value=>/name="manifest"/.test(value));
 if(!part)throw new Error('Update manifest part missing.');
 manifest=JSON.parse(part.slice(part.indexOf('\r\n\r\n')+4).trim());
}else manifest=JSON.parse(body);
if(manifest.runtimeVersion!==config.version||!manifest.launchAsset?.url||typeof manifest.id!=='string'||(process.argv[2]&&manifest.id!==process.argv[2]))throw new Error('Preview update does not match the expected runtime/update.');
console.log('PASS preview update: correct Android runtime and published update.');

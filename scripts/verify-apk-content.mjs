import {readFileSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {inflateRawSync} from 'node:zlib';

loadEnvFile();
const apk=readFileSync(process.argv[2]);
const end=apk.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
if(end<0)throw new Error('APK ZIP directory missing.');
let offset=apk.readUInt32LE(end+16);const entries=new Map();
while(apk.readUInt32LE(offset)===0x02014b50){
 const nameLength=apk.readUInt16LE(offset+28),extra=apk.readUInt16LE(offset+30),comment=apk.readUInt16LE(offset+32);
 const name=apk.subarray(offset+46,offset+46+nameLength).toString('utf8');
 entries.set(name,{method:apk.readUInt16LE(offset+10),size:apk.readUInt32LE(offset+20),local:apk.readUInt32LE(offset+42)});
 offset+=46+nameLength+extra+comment;
}
function extract(name){
 const entry=entries.get(name);if(!entry)throw new Error('Expected APK content is missing.');
 const start=entry.local+30+apk.readUInt16LE(entry.local+26)+apk.readUInt16LE(entry.local+28);
 const data=apk.subarray(start,start+entry.size);
 if(entry.method===0)return data;
 if(entry.method===8)return inflateRawSync(data);
 throw new Error('Unsupported APK ZIP compression.');
}
const bundle=extract('assets/index.android.bundle');
if(bundle.length<1000000)throw new Error('APK JavaScript bundle is unexpectedly small.');
for(const name of ['EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_ANON_KEY']){
 if(!process.env[name]||!bundle.includes(Buffer.from(process.env[name])))throw new Error('Public app configuration is missing from the bundle.');
}
for(const name of ['EXPO_SUPABASE_ACCESS_TOKEN','GOOGLE_GEMINI_API','GOOGLE_VISION_API']){
 if(process.env[name]&&bundle.includes(Buffer.from(process.env[name])))throw new Error('Private configuration appeared in the app bundle.');
}
for(const abi of ['arm64-v8a','x86_64'])if(!entries.has(`lib/${abi}/libhermes.so`))throw new Error('Required APK architecture is missing.');
console.log('PASS APK content: embedded bundle, public app configuration, both ABIs, no private provider/management credentials.');

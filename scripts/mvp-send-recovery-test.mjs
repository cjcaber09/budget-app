import {loadLinkedProject} from './lib/supabase-project.mjs';
loadLinkedProject();
const index=process.argv.indexOf('--email'),email=process.argv[index+1];
if(index<0||!email||!email.includes('@'))throw new Error('Supply an explicitly approved test email.');
const response=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/recover`,{method:'POST',headers:{apikey:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email}),signal:AbortSignal.timeout(20000)});
if(!response.ok){const body=await response.json().catch(()=>({}));console.log('Recovery request failed:',response.status,body.code??'delivery_unavailable');process.exitCode=1;}
else console.log('Recovery request accepted. Confirm receipt in the approved mailbox; no password was changed.');

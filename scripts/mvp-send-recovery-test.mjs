import {loadLinkedProject} from './lib/supabase-project.mjs';
loadLinkedProject();
const index=process.argv.indexOf('--email'),email=process.argv[index+1];
if(index<0||!email||!email.includes('@'))throw new Error('Supply an explicitly approved test email.');
const response=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/recover`,{method:'POST',headers:{apikey:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email}),signal:AbortSignal.timeout(20000)});
if(!response.ok){console.error('Recovery request failed. Check SMTP configuration and rate limits; remote response content was not logged.');process.exitCode=1;}
else console.log('Recovery request accepted. Confirm receipt in the approved mailbox; no password was changed.');

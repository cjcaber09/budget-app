import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const headers={Authorization:`Bearer ${project.accessToken}`};
const auth=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/config/auth`,{headers}).then(r=>r.ok?r.json():Promise.reject(new Error('Auth configuration unavailable')));
if(auth.smtp_host!=='smtp.gmail.com'||!auth.smtp_admin_email||!auth.smtp_pass)throw new Error('Gmail SMTP must be configured before rollout.');
if(auth.mailer_otp_length!==Number(process.env.EXPO_PUBLIC_AUTH_OTP_LENGTH??8))throw new Error('App OTP length differs from hosted Auth configuration.');
const signing=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/config/auth/signing-keys`,{headers}).then(r=>r.ok?r.json():Promise.reject(new Error('Signing configuration unavailable')));
if(!signing.keys?.some(k=>['ES256','RS256'].includes(k.algorithm)&&k.status==='in_use')&&!process.env.ACCOUNT_DELETION_JWT_SECRET)throw new Error('Deletion status requires asymmetric signing or a server-only legacy signing secret.');
const config=await queryDatabase(project,"select name,decrypted_secret from vault.decrypted_secrets where name in ('budget_tracker_ocr_function_url','budget_tracker_ocr_webhook_secret');");
const webhook=config.find(r=>r.name==='budget_tracker_ocr_webhook_secret')?.decrypted_secret;
const endpoint=config.find(r=>r.name==='budget_tracker_ocr_function_url')?.decrypted_secret;
if(!webhook||endpoint!==`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ocr`)throw new Error('Deletion worker Vault configuration is missing or mismatched.');
const cli=createRequire(import.meta.url).resolve('supabase/dist/supabase.js');
const env={...process.env,SUPABASE_ACCESS_TOKEN:project.accessToken};
function command(args){const r=spawnSync(process.execPath,[cli,...args],{env,stdio:'inherit',shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error('Deployment command failed.');}
if(!process.argv.includes('--apply')){command(['db','push','--dry-run']);console.log('Gmail, recovery length, signing and private worker configuration verified.');}
else{
 const secrets=[{name:'OCR_WEBHOOK_SECRET',value:webhook},...(process.env.ACCOUNT_DELETION_JWT_SECRET?[{name:'ACCOUNT_DELETION_JWT_SECRET',value:process.env.ACCOUNT_DELETION_JWT_SECRET}]:[])];
 const configured=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/secrets`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(secrets)});
 if(!configured.ok)throw new Error('Worker secret configuration failed.');
 command(['db','push','--yes']);
 command(['functions','deploy','ocr','--use-api','--no-verify-jwt','--project-ref',project.ref]);
 command(['functions','deploy','delete-account','--use-api','--no-verify-jwt','--project-ref',project.ref]);
 command(['migration','list']);
 console.log('MVP exports and account function deployed. Recovery template is configured separately.');
}

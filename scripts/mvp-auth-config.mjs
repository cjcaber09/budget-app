import {loadLinkedProject} from './lib/supabase-project.mjs';
import {readFileSync} from 'node:fs';
import {authDiagnostics} from './lib/auth-diagnostics.mjs';
const project=loadLinkedProject();
const response=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/config/auth`,{headers:{Authorization:`Bearer ${project.accessToken}`},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error('Could not read hosted auth configuration.');
const config=await response.json();
console.log(JSON.stringify(authDiagnostics(config)));
if(process.argv.includes('--apply-template')){
 const subject='Your Budget Tracker password reset code';
 const content=readFileSync('supabase/templates/recovery-code.html','utf8');
 const result=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/config/auth`,{method:'PATCH',headers:{Authorization:`Bearer ${project.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({mailer_subjects_recovery:subject,mailer_templates_recovery_content:content}),signal:AbortSignal.timeout(15000)});
 if(!result.ok)throw new Error('Recovery email template update failed.');
 console.log('Recovery code template configured. SMTP credentials were not changed.');
}

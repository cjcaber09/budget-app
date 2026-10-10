import {loadLinkedProject} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
for(const suffix of ['/config/auth/signing-keys','/api-keys/legacy','/config']){
 const r=await fetch(`https://api.supabase.com/v1/projects/${project.ref}${suffix}`,{headers:{Authorization:`Bearer ${project.accessToken}`},signal:AbortSignal.timeout(15000)});
 const v=await r.json().catch(()=>null);
 console.log(suffix,r.status,Array.isArray(v?.keys)?v.keys.map(k=>({algorithm:k.algorithm,status:k.status})):v?Object.keys(v):[]);
}

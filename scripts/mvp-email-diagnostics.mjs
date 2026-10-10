import {loadLinkedProject} from './lib/supabase-project.mjs';
const project=loadLinkedProject();
const sql="select event_message, log_attributes['error'] as error from logs where source='auth_logs' and (event_message ilike '%recovery%' or log_attributes['error'] ilike '%smtp%' or log_attributes['error'] ilike '%535%') order by timestamp desc limit 30";
const endpoint=new URL(`https://api.supabase.com/v1/projects/${project.ref}/analytics/endpoints/logs`);
endpoint.searchParams.set('sql',sql);endpoint.searchParams.set('iso_timestamp_start',new Date(Date.now()-1800000).toISOString());endpoint.searchParams.set('iso_timestamp_end',new Date().toISOString());
const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${project.accessToken}`},signal:AbortSignal.timeout(20000)});
const data=await response.json();
if(!response.ok)console.log('Email diagnostic logs unavailable:',response.status);
else{
 const text=JSON.stringify(data);
 console.log(JSON.stringify({authenticationRejected:/535|BadCredentials|Username and Password not accepted/i.test(text),appPasswordRequired:/Application.specific password|AppPassword|5\.7\.9/i.test(text),senderRejected:/sender.*reject|5\.7\.1/i.test(text),connectionFailure:/timeout|connection refused|dial tcp/i.test(text),recoveryErrorPresent:/Error sending recovery email|recovery/i.test(text)}));
}

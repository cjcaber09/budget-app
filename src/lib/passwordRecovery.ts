import {createClient} from '@supabase/supabase-js';
import {createRequestId} from '../domain/ocr';

export function createRecoveryClient() {
 return createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{storageKey:`budget-tracker:recovery:${createRequestId()}`,persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 });
}
export function recoveryError(error:{code?:string}|null) {
 if(error?.code==='over_email_send_rate_limit'||error?.code==='over_request_rate_limit')return 'Too many requests. Wait a few minutes and try again.';
 if(error?.code==='otp_expired')return 'That code is invalid or expired. Request a new code and try again.';
 if(error?.code==='email_address_not_authorized'||error?.code==='unexpected_failure')return 'Email delivery is unavailable. Please try again later.';
 return 'Could not complete this step. Check your connection and try again.';
}
export function passwordPolicyError(error:{code?:string;message?:string}) {
 if(error.code==='same_password')return 'Choose a different new password.';
 if(error.code==='weak_password'||error.code==='validation_failed'||error.code==='password_policy_violation'){
  const message=error.message??'';
  // Only provider password-rule text, never arbitrary transport responses.
  if(/^Password (should|must|needs|requires)/i.test(message)&&message.length<=250)return message;
  return 'Choose a stronger password. Use upper- and lowercase letters, a number and a symbol, and avoid common passwords.';
 }
 if(error.code==='reauthentication_needed')return 'Your recovery session expired. Return to sign in and request a new reset code.';
 return recoveryError(error);
}

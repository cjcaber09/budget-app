import {useEffect,useRef,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {AuthFrame} from '../../src/components/AuthFrame';
import {MotionPressable} from '../../src/components/MotionPressable';
import {useFormStyles} from '../../src/styles/forms';
import {useColors} from '../../src/styles/theme';
import {createRecoveryClient,recoveryError,passwordPolicyError} from '../../src/lib/passwordRecovery';

export default function ForgotPasswordScreen(){
 const params=useLocalSearchParams<{email?:string}>(),router=useRouter(),form=useFormStyles(),colors=useColors();
 const [email,setEmail]=useState(typeof params.email==='string'?params.email:''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [stage,setStage]=useState<'email'|'code'|'password'|'done'>('email'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[until,setUntil]=useState(0),[clock,setClock]=useState(()=>Date.now());
 const client=useRef<ReturnType<typeof createRecoveryClient>|null>(null),generation=useRef(0),alive=useRef(true);
 const otpLength=Number(process.env.EXPO_PUBLIC_AUTH_OTP_LENGTH??8);
 function resetClient(){generation.current++;const old=client.current;client.current=null;if(old)void old.auth.signOut({scope:'local'}).catch(()=>{});}
 useEffect(()=>{alive.current=true;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>{alive.current=false;clearInterval(timer);resetClient();};},[]);
 const current=(attempt:number)=>alive.current&&attempt===generation.current;
 function back(){resetClient();setCode('');setPassword('');setConfirm('');router.replace('/sign-in');}
 async function send(){
  if(busy||Date.now()<until)return;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError('Enter a valid email address.');return;}
  if(!client.current)client.current=createRecoveryClient();const attempt=generation.current,recovery=client.current;
  setBusy(true);setError('');
  try{
   const result=await recovery.auth.resetPasswordForEmail(email.trim());if(!current(attempt))return;
   if(result.error){setError(recoveryError(result.error));return;}
   setStage('code');setCode('');setUntil(Date.now()+60000);setMessage('If an account exists for this email, we’ve sent a reset code. Check your inbox and spam folder.');
  }catch{if(current(attempt))setError('Could not request a code. Check your connection and try again.');}finally{if(current(attempt))setBusy(false);}
 }
 async function verify(){
  if(busy||!client.current)return;const length=otpLength;
  if(!new RegExp(`^\\d{${length}}$`).test(code.trim())){setError(`Enter the ${length}-digit code from your email.`);return;}
  const attempt=generation.current,recovery=client.current;setBusy(true);setError('');
  try{const result=await recovery.auth.verifyOtp({email:email.trim(),token:code.trim(),type:'recovery'});if(!current(attempt)){await recovery.auth.signOut({scope:'local'}).catch(()=>{});return;}
   if(result.error||!result.data.session){setError(result.error?recoveryError(result.error):'Request a new code and try again.');return;}
   setCode('');setStage('password');setMessage('Email verified. Choose your new password.');
  }catch{if(current(attempt))setError('Could not verify the code. Please retry.');}finally{if(current(attempt))setBusy(false);}
 }
 async function save(){
  if(busy||!client.current)return;if(password.length<8||password!==confirm){setError('Enter matching passwords of at least 8 characters.');return;}
  const attempt=generation.current,recovery=client.current;setBusy(true);setError('');
  try{
   const result=await recovery.auth.updateUser({password});if(!current(attempt))return;
   if(result.error){setError(passwordPolicyError(result.error));return;}
   // Save success before revocation: a later network error must not undo the message.
   setPassword('');setConfirm('');setStage('done');setMessage('Password updated. Sign in with your new password.');
   try{const revoked=await recovery.auth.signOut({scope:'global'});if(current(attempt)&&revoked.error)setMessage('Password updated. Sign in with your new password. Other sessions could not be signed out.');}
   catch{if(current(attempt))setMessage('Password updated. Sign in with your new password. Other sessions could not be signed out.');}
   finally{await recovery.auth.signOut({scope:'local'}).catch(()=>{});client.current=null;}
  }catch{if(current(attempt))setError('Could not save the password. Please retry.');}finally{if(current(attempt))setBusy(false);}
 }
 return <AuthFrame><View>
  <Text accessibilityRole="header" style={form.title}>{stage==='done'?'Password updated':stage==='password'?'Choose a new password':stage==='code'?'Check your email':'Reset your password'}</Text>
  <Text style={form.subtitle}>{message||'We’ll email a verification code so you can reset your password here.'}</Text>
  {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
  {stage==='email'&&<><Text style={form.label}>Email</Text><TextInput accessibilityLabel="Recovery email" style={form.input} placeholder="you@example.com" placeholderTextColor={colors.subtle} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!busy}/><MotionPressable style={form.button} disabled={busy} onPress={()=>void send()}><Text style={form.buttonText}>{busy?'Sending…':'Send reset code'}</Text></MotionPressable></>}
  {stage==='code'&&<><Text style={form.label}>Verification code</Text><Text style={form.subtitle}>Enter the {otpLength}-digit code from your email.</Text><TextInput accessibilityLabel="Recovery code" style={form.input} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" value={code} onChangeText={setCode} editable={!busy}/><MotionPressable style={form.button} disabled={busy} onPress={()=>void verify()}><Text style={form.buttonText}>{busy?'Verifying…':'Verify code'}</Text></MotionPressable><MotionPressable style={form.secondaryButton} disabled={busy||clock<until} onPress={()=>void send()}><Text style={form.chipTextSelected}>{clock<until?`Resend in ${Math.ceil((until-clock)/1000)}s`:'Resend code'}</Text></MotionPressable><MotionPressable style={form.secondaryButton} disabled={busy} onPress={()=>{resetClient();setStage('email');setCode('');setUntil(0);setMessage('');setError('');}}><Text style={form.chipTextSelected}>Change email</Text></MotionPressable></>}
  {stage==='password'&&<><Text style={form.label}>New password</Text><Text style={form.subtitle}>At least 8 characters.</Text><TextInput accessibilityLabel="New recovery password" style={form.input} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} editable={!busy}/><Text style={form.label}>Confirm new password</Text><TextInput accessibilityLabel="Confirm recovery password" style={form.input} secureTextEntry autoComplete="new-password" value={confirm} onChangeText={setConfirm} editable={!busy}/><MotionPressable style={form.button} disabled={busy} onPress={()=>void save()}><Text style={form.buttonText}>{busy?'Saving…':'Save new password'}</Text></MotionPressable></>}
  <MotionPressable style={form.secondaryButton} onPress={back}><Text style={form.chipTextSelected}>Back to sign in</Text></MotionPressable>
 </View></AuthFrame>;
}

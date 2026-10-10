import {useState,useEffect,useRef} from 'react';
import {Text,TextInput,View,ActivityIndicator} from 'react-native';
import {useRouter} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {deletionRequest,DeletionError} from '../lib/accountDeletion';
import {resetClientState} from '../lib/resetClientState';
import {useAccountDeletionStore} from '../stores/useAccountDeletionStore';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useToastStore} from '../stores/useToastStore';
import {useSession} from '../hooks/useSession';
import {createRequestId} from '../domain/ocr';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {usePageLayout} from '../styles/pageLayout';
import {ActionSheet} from './ActionSheet';
import {MotionPressable} from './MotionPressable';

export function AccountDeletionSettings(){
 const owner=usePreferencesStore(s=>s.profile?.user_id);
 return <AccountDeletionSettingsContent key={owner} owner={owner}/>;
}
function AccountDeletionSettingsContent({owner}:{owner?:string}){
 const form=useFormStyles(),router=useRouter();
 const [open,setOpen]=useState(false),[password,setPassword]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function start(){
  if(!owner||busy||!password||!ack)return;setBusy(true);setError('');
  const operation={owner,requestId:createRequestId(),accepted:false};
  useAccountDeletionStore.setState({starting:true});
  try{
   // Persist the retry identity first; never persist the password.
   await useAccountDeletionStore.getState().set(operation);
   const result=await deletionRequest(operation,'delete',password);
   if(result==='completed')await useAccountDeletionStore.getState().set({...operation,accepted:true});
   if(alive.current){setPassword('');setOpen(false);}
  }catch(e){
   if(e instanceof DeletionError&&['password_not_accepted','invalid_request','unauthorized'].includes(e.code)){
    await useAccountDeletionStore.getState().set(null);
    if(alive.current)setError(e.code==='password_not_accepted'?'Your current password was not accepted. Try again.':'Sign in again before deleting your account.');
   }else if(alive.current){setPassword('');setOpen(false);}
  }finally{useAccountDeletionStore.setState({starting:false});if(alive.current)setBusy(false);}
 }
 return <>
  <MotionPressable style={form.secondaryButton} onPress={()=>{setOpen(true);setAck(false);setError('');}}><Text style={form.secondaryText}>Delete account</Text></MotionPressable>
  <ActionSheet title="Permanently delete account" visible={open} onClose={()=>{setOpen(false);setPassword('');}} busy={busy}>
   <Text style={form.subtitle}>Your transactions, budgets, bills, payment methods, profile, avatar and scan history will be permanently removed. This cannot be undone. Cleanup can remove files before the account deletion finishes.</Text>
   <MotionPressable style={form.secondaryButton} disabled={busy} onPress={()=>{setOpen(false);setPassword('');router.push('/reports');}}><Text style={form.chipTextSelected}>Go to Reports to export</Text></MotionPressable>
   <Text style={form.label}>Current password</Text><TextInput accessibilityLabel="Deletion current password" style={form.input} secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} editable={!busy}/>
   <MotionPressable style={[form.chip,ack&&form.chipSelected]} disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked:ack}} onPress={()=>setAck(!ack)}><Text style={form.chipTextSelected}>I understand this permanently deletes my account.</Text></MotionPressable>
   {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
   <MotionPressable accessibilityLabel="Confirm permanent account deletion" style={form.button} disabled={busy||!password||!ack} onPress={()=>void start()}><Text style={form.buttonText}>{busy?'Verifying…':'Permanently delete account'}</Text></MotionPressable>
  </ActionSheet>
 </>;
}

export function AccountDeletionBoundary(){
 const {session}=useSession(),store=useAccountDeletionStore(),queryClient=useQueryClient(),form=useFormStyles(),page=usePageLayout({safeTop:true}),colors=useColors(),router=useRouter();
 const [message,setMessage]=useState('Checking your deletion request…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0),alive=useRef(true),running=useRef(false);
 useEffect(()=>{alive.current=true;void store.load().catch(()=>setError('Could not restore deletion status. Please restart the app.'));return()=>{alive.current=false;};},[]); // eslint-disable-line react-hooks/exhaustive-deps
 const operation=store.pending,matching=operation&&session?.user.id===operation.owner;
 useEffect(()=>{
  if(!store.hydrated||!session||operation)return;
  let cancelled=false;
  void supabase.rpc('account_deletion_status').then(({data,error})=>{
   if(!cancelled&&!error&&data?.owner===session.user.id&&typeof data.requestId==='string')void useAccountDeletionStore.getState().set({owner:data.owner,requestId:data.requestId,accepted:true});
  });
  return()=>{cancelled=true;};
 },[store.hydrated,session?.user.id,operation]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  if(!operation||!matching||store.starting||running.current)return;
  let cancelled=false;const run=async()=>{
   running.current=true;setBusy(true);setError('');
   try{
    const result=await deletionRequest(operation,'status');if(cancelled)return;
    if(result==='completed'){
     await supabase.auth.signOut({scope:'local'});resetClientState(queryClient);await useAccountDeletionStore.getState().set(null);
     useToastStore.getState().showToast('Account deleted.');router.replace('/sign-in');
    }else setMessage('Your account deletion is in progress. Financial activity is paused while files and records are removed. You can close the app; cleanup will continue.');
   }catch(e){if(!cancelled){
    if(e instanceof DeletionError&&e.code==='operation_not_found'&&!operation.accepted){await useAccountDeletionStore.getState().set(null);useToastStore.getState().showToast('Deletion was not started. You can retry in Settings.');}
    else setError(e instanceof DeletionError&&e.code==='unauthorized'?'Your session expired. Deletion completion could not be confirmed. Sign in to check again.':'Could not confirm deletion status. Check your connection and retry.');
   }}finally{running.current=false;if(alive.current&&!cancelled)setBusy(false);}
  };void run();return()=>{cancelled=true;};
 },[operation?.requestId,matching,store.starting,tick,queryClient,router]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!matching||error)return;const timer=setInterval(()=>setTick(n=>n+1),10000);return()=>clearInterval(timer);},[matching,error]);
 if(!operation||!matching||store.starting)return null;
 return <View style={[page.screen,{position:'absolute',top:0,bottom:0,left:0,right:0,justifyContent:'center',padding:24}]} accessibilityViewIsModal>
  <View style={page.card}>
   <Text accessibilityRole="header" style={form.title}>Account deletion</Text>
   <Text style={form.subtitle}>{matching?message:'Sign in to check your pending deletion request. Completion has not been confirmed.'}</Text>
   {busy&&<ActivityIndicator color={colors.primary}/>}
   {!!error&&<Text style={form.error} accessibilityRole="alert">{error}</Text>}
   {matching&&<MotionPressable style={form.button} disabled={busy} onPress={()=>{setError('');setTick(n=>n+1);}}><Text style={form.buttonText}>Check deletion status</Text></MotionPressable>}
   {error.includes('session expired')&&<MotionPressable style={form.secondaryButton} onPress={()=>{void supabase.auth.signOut({scope:'local'});router.replace('/sign-in');}}><Text style={form.chipTextSelected}>Return to sign in</Text></MotionPressable>}
  </View>
 </View>;
}

export function PendingDeletionNotice(){
 const pending=useAccountDeletionStore(s=>s.pending),form=useFormStyles();
 if(!pending)return null;
 return <View><Text accessibilityRole="alert" style={form.subtitle}>An earlier account deletion has not been confirmed on this device. Sign in to check its status if the account is still available. A failed sign-in does not confirm deletion.</Text></View>;
}

import {accountOperationActive} from '../lib/accountOperation';
import {CheckboxField} from './CheckboxField';
import {OperationProgress} from './OperationProgress';
import {useSerialOperationPoll} from '../hooks/useSerialOperationPoll';
import {PasswordInput} from './PasswordInput';
import {useState,useEffect,useRef} from 'react';
import {Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {deletionRequest,DeletionError} from '../lib/accountDeletion';
import {resetClientState} from '../lib/resetClientState';
import {useAccountDeletionStore,type PendingDeletion} from '../stores/useAccountDeletionStore';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useToastStore} from '../stores/useToastStore';
import {useSession} from '../hooks/useSession';
import {createRequestId} from '../domain/ocr';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {usePageLayout} from '../styles/pageLayout';
import {ActionSheet} from './ActionSheet';
import {MotionPressable} from './MotionPressable';
import {Trash2} from 'lucide-react-native';
import {useHelpBlocker} from '../stores/useHelpStore';

export function AccountDeletionSettings(){
 const owner=usePreferencesStore(s=>s.profile?.user_id);
 return <AccountDeletionSettingsContent key={owner} owner={owner}/>;
}
function AccountDeletionSettingsContent({owner}:{owner?:string}){
 const form=useFormStyles(),router=useRouter(),colors=useColors();
 const [open,setOpen]=useState(false),[password,setPassword]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useHelpBlocker('account-deletion',open);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function handleStartError(e:unknown){
  if(e instanceof DeletionError&&['password_not_accepted','invalid_request','unauthorized'].includes(e.code)){
   await useAccountDeletionStore.getState().set(null);
   if(alive.current)setError(e.code==='password_not_accepted'?'Your current password was not accepted. Try again.':'Sign in again before deleting your account.');
   return;
  }
  if(alive.current){setPassword('');setOpen(false);}
 }
 async function start(){
  if(!owner||accountOperationActive(owner)||busy||!password||!ack){return;}
  setBusy(true);setError('');
  const operation={owner,requestId:createRequestId(),accepted:false};
  useAccountDeletionStore.setState({starting:true});
  try{
   // Persist the retry identity first; never persist the password.
   await useAccountDeletionStore.getState().set(operation);
   const result=await deletionRequest(operation,'delete',password);
   if(result==='completed')await useAccountDeletionStore.getState().set({...operation,accepted:true});
   if(alive.current){setPassword('');setOpen(false);}
  }catch(e){await handleStartError(e);}
  finally{useAccountDeletionStore.setState({starting:false});if(alive.current)setBusy(false);}
 }
 return <>
  <MotionPressable accessibilityLabel="Delete account" disabled={!owner||busy} style={[form.secondaryButton,{flexDirection:'row',justifyContent:'center',gap:8}]} onPress={()=>{setOpen(true);setPassword('');setAck(false);setError('');}}><Trash2 size={18} color={colors.danger}/><Text style={[form.secondaryText,{color:colors.danger}]}>Delete account</Text></MotionPressable>
  <ActionSheet title="Permanently delete account" visible={open} onClose={()=>{setOpen(false);setPassword('');setAck(false);}} busy={busy} allowAccountOperation={busy}>
   <Text style={form.subtitle}>Your transactions, budgets, bills, payment methods, profile, avatar and scan history will be permanently removed. This cannot be undone. Cleanup can remove files before the account deletion finishes.</Text>
   <MotionPressable style={form.secondaryButton} disabled={busy} onPress={()=>{setOpen(false);setPassword('');router.push('/reports');}}><Text style={form.chipTextSelected}>Go to Reports to export</Text></MotionPressable>
   <Text style={form.label}>Current password</Text><PasswordInput accessibilityLabel="Deletion current password" style={form.input} autoComplete="current-password" value={password} onChangeText={setPassword} editable={!busy}/>
   <CheckboxField label="I understand this permanently deletes my account." checked={ack} onChange={setAck} disabled={busy}/>
   {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
 {busy&&<OperationProgress label="Verifying and starting cleanup"/>}
   <MotionPressable accessibilityLabel="Confirm permanent account deletion" style={form.button} disabled={busy||!password||!ack} onPress={()=>void start()}><Text style={form.buttonText}>{busy?'Verifying…':'Permanently delete account'}</Text></MotionPressable>
  </ActionSheet>
 </>;
}

export function AccountDeletionBoundary(){
 const {session}=useSession(),store=useAccountDeletionStore(),queryClient=useQueryClient(),form=useFormStyles(),page=usePageLayout({safeTop:true}),router=useRouter();
 const profileOwner=usePreferencesStore(state=>state.profile?.user_id);
 const [message,setMessage]=useState('Checking your deletion request…'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{void useAccountDeletionStore.getState().load().catch(()=>setError('Could not restore deletion status. Please restart the app.'));},[]);
 const operation=store.pending,matching=!!operation&&session?.user.id===operation.owner&&profileOwner===operation.owner;
 useSerialOperationPoll(store.hydrated&&!!session&&!operation,'discover-deletion:'+session?.user.id,async current=>{
  try{
   const {data,error}=await supabase.rpc('account_deletion_status');
   if(current()&&!error&&data?.owner===session!.user.id&&typeof data.requestId==='string')await useAccountDeletionStore.getState().set({owner:data.owner,requestId:data.requestId,accepted:true});
  }catch{/* Retry discovery on resume without declaring deletion complete. */}
  return false;
 });
 async function finishDeletion(pending:PendingDeletion){
  await supabase.auth.signOut({scope:'local'});
  const activeOwner=usePreferencesStore.getState().profile?.user_id;
  if(activeOwner&&activeOwner!==pending.owner)return;
  resetClientState(queryClient);
  if(useAccountDeletionStore.getState().pending?.requestId===pending.requestId)await useAccountDeletionStore.getState().set(null);
  useToastStore.getState().showToast('Account deleted.');router.replace('/sign-in');
 }
 async function handleStatusError(e:unknown,pending:PendingDeletion){
  if(e instanceof DeletionError&&e.code==='operation_not_found'&&!pending.accepted){
   await useAccountDeletionStore.getState().set(null);
   useToastStore.getState().showToast('Deletion was not started. You can retry in Settings.');
   return;
  }
  setError(e instanceof DeletionError&&e.code==='unauthorized'?'Your session expired. Deletion completion could not be confirmed. Sign in to check again.':'Could not confirm deletion status. Check your connection and retry.');
 }
 const retry=useSerialOperationPoll(matching&&!store.starting,operation?operation.owner+':'+operation.requestId:'none',async current=>{
  if(!operation)return false;
  const owned=()=>current()&&usePreferencesStore.getState().profile?.user_id===operation.owner&&useAccountDeletionStore.getState().pending?.requestId===operation.requestId;
  setBusy(true);setError('');
  try{
   const result=await deletionRequest(operation,'status');if(!owned())return false;
   if(result!=='completed'){
    setMessage('Your account deletion is in progress. Financial activity is paused while files and records are removed. You can close the app; cleanup will continue.');
    return true;
   }
   await finishDeletion(operation);
  }catch(e){if(owned())await handleStatusError(e,operation);}
  finally{if(current())setBusy(false);}
  return false;
 });
 if(!operation||!matching||store.starting)return null;
 return <View style={[page.screen,{position:'absolute',top:0,bottom:0,left:0,right:0,justifyContent:'center',padding:24,zIndex:1000,elevation:24}]} accessibilityViewIsModal><View style={page.card}>
 <Text accessibilityRole="header" style={form.title}>Account deletion</Text><Text style={form.subtitle}>{message}</Text>
 <OperationProgress label="Deleting account" paused={!!error}/>
 {!!error&&<Text style={form.error} accessibilityRole="alert">{error}</Text>}
 <MotionPressable style={form.button} disabled={busy} onPress={retry}><Text style={form.buttonText}>Check deletion status</Text></MotionPressable>
 {error.includes('session expired')&&<MotionPressable style={form.secondaryButton} onPress={()=>{void supabase.auth.signOut({scope:'local'});router.replace('/sign-in');}}><Text style={form.chipTextSelected}>Return to sign in</Text></MotionPressable>}
 </View></View>;
}

export function PendingDeletionNotice(){
 const pending=useAccountDeletionStore(s=>s.pending),form=useFormStyles();
 if(!pending)return null;
 return <View><Text accessibilityRole="alert" style={form.subtitle}>An earlier account deletion has not been confirmed on this device. Sign in to check its status if the account is still available. A failed sign-in does not confirm deletion.</Text></View>;
}

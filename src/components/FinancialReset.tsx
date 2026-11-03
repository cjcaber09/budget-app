import {accountOperationActive} from '../lib/accountOperation';
import {CheckboxField} from './CheckboxField';
import {OperationProgress} from './OperationProgress';
import {useSerialOperationPoll} from '../hooks/useSerialOperationPoll';
import {PasswordInput} from './PasswordInput';
import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {RotateCcw} from 'lucide-react-native';
import {useRouter} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFinancialResetStore} from '../stores/useFinancialResetStore';
import {useSession} from '../hooks/useSession';
import {supabase} from '../lib/supabase';
import {financialResetRequest,FinancialResetError} from '../lib/financialReset';
import {resetFinancialClientState} from '../lib/resetFinancialClientState';
import {createRequestId} from '../domain/ocr';
import {isUuid} from '../../supabase/functions/ocr/shared';
import {useToastStore} from '../stores/useToastStore';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {usePageLayout} from '../styles/pageLayout';
import {ActionSheet} from './ActionSheet';
import {MotionPressable} from './MotionPressable';
import {useHelpBlocker} from '../stores/useHelpStore';

export function FinancialResetSettings(){
 const owner=usePreferencesStore(s=>s.profile?.user_id);return <ResetSettings key={owner} owner={owner}/>;
}
function ResetSettings({owner}:Readonly<{owner?:string}>){
 const starting=useFinancialResetStore(s=>s.starting);
 const form=useFormStyles(),colors=useColors(),router=useRouter();
 const [open,setOpen]=useState(false),[password,setPassword]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useHelpBlocker('financial-reset',open);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const close=()=>{if(!busy){setOpen(false);setPassword('');setAck(false);}};
 async function start(){
  if(!owner||accountOperationActive(owner)||busy||starting||!password||!ack)return;setBusy(true);setError('');useFinancialResetStore.setState({starting:true});
  const operation={owner,requestId:createRequestId(),accepted:false};
  try{
   await useFinancialResetStore.getState().set(operation);await financialResetRequest(operation,'reset',password);
   if(alive.current){setPassword('');setOpen(false);}
  }catch(e){
   if(e instanceof FinancialResetError&&['password_not_accepted','invalid_request','unauthorized'].includes(e.code)){
    if(useFinancialResetStore.getState().pending?.requestId===operation.requestId)await useFinancialResetStore.getState().set(null);
    if(alive.current)setError(e.code==='password_not_accepted'?'Your current password was not accepted. Try again.':e.code==='invalid_request'?'Record reset is not available yet. No reset was started.':'Sign in again before clearing records.');
   }else if(alive.current){setPassword('');setOpen(false);}
  }finally{useFinancialResetStore.setState({starting:false});if(alive.current)setBusy(false);}
 }
 return <>
 <MotionPressable accessibilityLabel="Clear all finance records" disabled={!owner||starting} style={[form.secondaryButton,{flexDirection:'row',justifyContent:'center',gap:8}]} onPress={()=>{setOpen(true);setError('');setAck(false);}}><RotateCcw size={18} color={colors.danger}/><Text style={[form.secondaryText,{color:colors.danger}]}>Clear records</Text></MotionPressable>
 <ActionSheet visible={open} title="Clear all finance records" busy={busy} allowAccountOperation={busy} onClose={close}>
 <Text style={form.subtitle}>This permanently removes transactions, budgets, bills, scans, receipts, categories, sources and payment methods. Default categories and Cash are restored with no balance. Your account, profile and preferences stay. This cannot be undone. Scanning limits stay the same.</Text>
 <MotionPressable style={form.secondaryButton} disabled={busy} onPress={()=>{close();router.push('/reports');}}><Text style={form.chipTextSelected}>Export in Reports first</Text></MotionPressable>
 <Text style={form.label}>Current password</Text><PasswordInput accessibilityLabel="Reset current password" style={form.input} autoComplete="current-password" value={password} onChangeText={setPassword} editable={!busy}/>
 <CheckboxField label="I understand these records will be permanently deleted." checked={ack} onChange={setAck} disabled={busy}/>
 {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
 {busy&&<OperationProgress label="Verifying and starting cleanup"/>}
 <MotionPressable accessibilityLabel="Confirm clearing all records" disabled={busy||!password||!ack} style={form.button} onPress={()=>void start()}><Text style={form.buttonText}>{busy?'Verifying…':'Clear all records'}</Text></MotionPressable>
 </ActionSheet></>;
}

export function FinancialResetBoundary(){
 const {session}=useSession(),store=useFinancialResetStore(),client=useQueryClient(),router=useRouter(),form=useFormStyles(),page=usePageLayout({safeTop:true});
 const profileOwner=usePreferencesStore(s=>s.profile?.user_id);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[completedRequest,setCompletedRequest]=useState<string|null>(null);
 const operation=store.pending,matching=!!operation&&session?.user.id===operation.owner&&profileOwner===operation.owner;
 const key=operation?operation.owner+':'+operation.requestId:'none',completed=completedRequest===key;
 useEffect(()=>{void useFinancialResetStore.getState().load().catch(()=>setError('Could not restore reset status. Restart the app to retry.'));},[]);
 useSerialOperationPoll(store.hydrated&&!!session&&!operation,'discover-reset:'+session?.user.id,async current=>{
  try{
   const {data,error}=await supabase.rpc('financial_reset_status');
   if(current()&&!error&&data?.owner===session!.user.id&&isUuid(data.requestId)&&['pending','completed'].includes(data.state)&&useFinancialResetStore.getState().handled[data.owner]!==data.requestId)await useFinancialResetStore.getState().set({owner:data.owner,requestId:data.requestId,accepted:true});
  }catch{/* Discovery retries on resume; an active operation owns its error UI. */}
  return false;
 });
 const retry=useSerialOperationPoll(matching&&!store.starting,key,async current=>{
  if(!operation)return false;
  const owned=()=>current()&&usePreferencesStore.getState().profile?.user_id===operation.owner&&useFinancialResetStore.getState().pending?.requestId===operation.requestId;
  setBusy(true);setError('');let confirmed=completed;
  try{
   const result=await financialResetRequest(operation,'reset-status');if(!owned())return false;
   if(result!=='completed')return true;
   confirmed=true;setCompletedRequest(key);
   await resetFinancialClientState(client,operation.owner);if(!owned())return false;
   await useFinancialResetStore.getState().complete(operation.owner,operation.requestId);
   if(usePreferencesStore.getState().profile?.user_id===operation.owner){router.replace('/');useFinancialResetStore.setState(state=>({epoch:state.epoch+1}));useToastStore.getState().showToast('Records cleared. Your account is unchanged.');}
  }catch(e){if(owned()){
   if(e instanceof FinancialResetError&&e.code==='operation_not_found'&&!operation.accepted){await useFinancialResetStore.getState().set(null);useToastStore.getState().showToast('Reset was not started. You can retry in Profile.');}
   else setError(confirmed?'Records are cleared. Could not refresh this device. Retry.':e instanceof FinancialResetError&&e.code==='unauthorized'?'Your session expired. Sign in to confirm reset status.':'Could not confirm the reset. Check your connection and retry.');
  }}finally{if(current())setBusy(false);}
  return false;
 });
 if(!operation||!matching||store.starting)return null;
 return <View testID="financial-reset-overlay" style={[page.screen,{position:'absolute',top:0,bottom:0,left:0,right:0,justifyContent:'center',padding:24,zIndex:1000,elevation:24}]} accessibilityViewIsModal><View style={page.card}>
 <Text accessibilityRole="header" style={form.title}>{completed?'Records cleared':'Clearing records'}</Text><Text style={form.subtitle}>{completed?'Your records are cleared on the server. Refresh this device before continuing.':'Finance activity is paused while receipts and records are removed. Your account, profile and preferences stay. You can close the app; cleanup will continue.'}</Text>
 <OperationProgress label={completed?'Refreshing this device':'Clearing records'} paused={!!error}/>
 {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
 <MotionPressable style={form.button} disabled={busy} onPress={retry}><Text style={form.buttonText}>Check reset status</Text></MotionPressable>
 {error.includes('session expired')&&<MotionPressable style={form.secondaryButton} onPress={()=>{void supabase.auth.signOut({scope:'local'});router.replace('/sign-in');}}><Text style={form.chipTextSelected}>Return to sign in</Text></MotionPressable>}
 </View></View>;
}

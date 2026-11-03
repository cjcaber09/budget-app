import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Linking,Platform,ScrollView,Text,View} from 'react-native';
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder,useAudioRecorderState} from 'expo-audio';
import {useFocusEffect,useRouter} from 'expo-router';
import {Mic,Square} from 'lucide-react-native';
import {useColors} from '../styles/theme';
import {useFormStyles} from '../styles/forms';
import {usePageLayout} from '../styles/pageLayout';
import {MotionPressable} from './MotionPressable';
import {FormActions} from './FormActions';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useConnectivityStore} from '../stores/useConnectivityStore';
import {useAppLockStore} from '../stores/useAppLockStore';
import {useUpdateBlocker} from '../stores/useUpdateSafetyStore';
import {useVoiceEntryStore,type VoiceEntryContext} from '../stores/useVoiceEntryStore';
import {handoffGeneration,runNativeHandoff} from '../lib/nativeHandoff';
import {transactionDraftGeneration} from '../lib/transactionDraftStorage';
import {callVoice,cleanupVoiceFiles,removeVoiceFile,voiceContextActive,type VoiceFailure} from '../lib/voiceEntry';
import {createRequestId} from '../domain/ocr';
import {localDateKey} from '../domain/transactionDates';
import {validateVoiceProposal,type VoiceProposal} from '../../supabase/functions/voice-entry/shared';
import {useCategories} from '../hooks/useCategories';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {useIncomeSources} from '../hooks/useIncomeSources';

import {useAccountOperation} from '../hooks/useAccountOperation';
import {accountOperationActive} from '../lib/accountOperation';

export function VoiceEntry(){return Platform.OS==='android'?<AndroidVoiceEntry/>:<Text>Voice entry is available in the Android app. Use Manual Entry here.</Text>;}
function AndroidVoiceEntry(){
 const recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,numberOfChannels:1,bitRate:64000});
 const status=useAudioRecorderState(recorder,100);
 const form=useFormStyles(),layout=usePageLayout(),colors=useColors(),router=useRouter();
 const profile=usePreferencesStore(s=>s.profile),online=useConnectivityStore(s=>s.online);
 const paused=useAccountOperation();
 const lock=useAppLockStore(s=>s.enabled&&(s.locked||s.obscured));
 const categories=useCategories(),methods=usePaymentMethods(),sources=useIncomeSources();
 const [phase,setPhase]=useState<'ready'|'preparing'|'recording'|'processing'|'review'>('ready');
 const [error,setError]=useState(''),[denied,setDenied]=useState(false),[retryAt,setRetryAt]=useState(0),[clock,setClock]=useState(Date.now());
 const [proposal,setProposal]=useState<VoiceProposal|null>(null);
 const [clean,setClean]=useState(false);
 const context=useRef<VoiceEntryContext|null>(null),controller=useRef<AbortController|null>(null),busy=useRef(false),valid=useRef(true),recording=useRef(false);
 const sequence=useRef(0);
 useUpdateBlocker(phase!=='ready');
 const cancel=useCallback(async()=>{
  valid.current=false;controller.current?.abort();
  sequence.current++;
  const uri=recorder.uri;
  if(recording.current){recording.current=false;await recorder.stop().catch(()=>{});}
  await removeVoiceFile(uri).catch(()=>{});
  if(valid.current)return;
  setProposal(null);setPhase('ready');busy.current=false;
 },[recorder]);
 useEffect(()=>{void cleanupVoiceFiles().then(()=>setClean(true)).catch(()=>setError('Could not remove an old recording. Close Voice and retry before recording.'));const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useFocusEffect(useCallback(()=>{valid.current=true;return()=>{void cancel();};},[cancel]));
 useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active'&&recording.current){void cancel();setError('Recording stopped when you left the app. Start again when ready.');}});return()=>listener.remove();},[cancel]);
 useEffect(()=>{if(paused)void cancel();},[paused,cancel]);
 useEffect(()=>{if(lock&&phase!=='preparing'){void cancel();}},[lock,cancel,phase]);
 useEffect(()=>{if(phase==='recording'&&status.durationMillis>=19500)void stop();});
 function showFailure(issue:unknown){const failure=issue as VoiceFailure;setError(failure?.message||'Voice entry failed. Try again.');if(failure.retryAfterSeconds)setRetryAt(Date.now()+failure.retryAfterSeconds*1000);setPhase('ready');}
 async function start(){
  if(accountOperationActive())return;
  if(busy.current||!clean||online!==true||!profile||Date.now()<retryAt)return;
  busy.current=true;valid.current=true;setError('');setDenied(false);setPhase('preparing');
  const visitSequence=++sequence.current;
  const generation=handoffGeneration(),draftGeneration=transactionDraftGeneration(profile.user_id);
  const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),15000);
  try{
   await callVoice(undefined,undefined,abort.signal);
   clearTimeout(timer);
   if(!valid.current||visitSequence!==sequence.current||generation!==handoffGeneration()||draftGeneration!==transactionDraftGeneration(profile.user_id))return;
   const permission=await runNativeHandoff('microphone',()=>AudioModule.requestRecordingPermissionsAsync());
   if(!permission.granted){setDenied(!permission.canAskAgain);throw new Error('Microphone permission is needed. Allow access or use Manual Entry.');}
   const now=new Date();
   const captured:VoiceEntryContext={owner:profile.user_id,visit:createRequestId(),startedAt:now.toISOString(),day:localDateKey(now,profile.timezone),timezone:profile.timezone,currency:profile.currency,generation:handoffGeneration(),draftGeneration:transactionDraftGeneration(profile.user_id)};
   if(!valid.current||visitSequence!==sequence.current||AppState.currentState!=='active'||!voiceContextActive(captured))throw new Error('Return to the unlocked app, then tap Start recording again.');
   context.current=captured;
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:false,allowsBackgroundRecording:false});
   await recorder.prepareToRecordAsync();
   if(!valid.current||visitSequence!==sequence.current||!voiceContextActive(captured)){await removeVoiceFile(recorder.uri);return;}
   recording.current=true;recorder.record({forDuration:20});setPhase('recording');
  }catch(issue){if(valid.current&&visitSequence===sequence.current)showFailure(issue);}finally{clearTimeout(timer);if(visitSequence===sequence.current){controller.current=null;busy.current=false;}}
 }
 async function stop(){
  if(busy.current||!recording.current)return;
  busy.current=true;recording.current=false;setPhase('processing');
  const visitSequence=sequence.current,uri=recorder.uri;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   await recorder.stop();const captured=context.current;
   if(!captured||!recorder.uri||!valid.current||!voiceContextActive(captured))throw new Error('This entry session changed. Record again.');
   const abort=new AbortController();controller.current=abort;timer=setTimeout(()=>abort.abort(),30000);
   const result=await callVoice(captured,recorder.uri,abort.signal);
   if(!valid.current||visitSequence!==sequence.current||!voiceContextActive(captured))return;
   if(!categories.data||!methods.methods||!sources.data)throw new Error('Could not refresh your choices. Use Manual Entry or record again.');
   if(result?.proposalVersion!==undefined&&result.proposalVersion!==2||result?.proposalVersion===undefined&&result?.proposal?.purchases?.length)throw new Error('Unsupported voice response. Record again or use Manual Entry.');
   const parsed=validateVoiceProposal(result?.proposal,{categories:categories.data.filter(c=>c.user_id===captured.owner),methods:methods.methods.filter(m=>m.user_id===captured.owner&&!m.archived),sources:sources.data.filter(s=>s.user_id===captured.owner&&!s.archived)},captured.day,captured.currency,result?.proposalVersion===2?2:1);
   setProposal(parsed);setPhase('review');
  }catch(issue){if(valid.current&&visitSequence===sequence.current)showFailure(issue);}finally{if(timer)clearTimeout(timer);await removeVoiceFile(uri).catch(()=>{});if(visitSequence===sequence.current){controller.current=null;busy.current=false;}}
 }
 function review(){
  const captured=context.current;if(!proposal||proposal.intent!=='entry'||!captured||!voiceContextActive(captured))return;
  useVoiceEntryStore.getState().set({context:captured,proposal});
  router.replace({pathname:'/transaction/new',params:{visit:captured.visit}});
 }
 const manualEntry=()=>{void cancel().then(()=>{if(!accountOperationActive())router.replace({pathname:'/transaction/new',params:{visit:createRequestId()}});});};
 const wait=Math.max(0,Math.ceil((retryAt-clock)/1000));
 if(paused)return null;
 return <ScrollView style={layout.screen} contentContainerStyle={layout.scrollContent}><View style={[layout.card,{gap:20}]}>
  <Mic size={36} color={colors.primary}/><Text style={form.title}>Speak an entry</Text>
  <Text style={form.subtitle}>One income or expense, in English, Tagalog or Taglish. List up to 20 purchases with prices in one recording: “Rice 100, eggs 60, milk 80, paid using GCash.” Compatible purchases become items in one expense.</Text>
  <Text style={form.subtitle}>Google processes your recording. Free-tier submissions may improve Google products. Audio is temporary; review the details before saving.</Text>
  {error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
  {wait>0&&<Text accessibilityLiveRegion="polite" style={form.subtitle}>Try again in {wait} seconds.</Text>}
  {denied&&<MotionPressable style={form.secondaryButton} onPress={()=>void Linking.openSettings()}><Text style={form.chipTextSelected}>Open phone settings</Text></MotionPressable>}
  {phase==='ready'&&<MotionPressable disabled={!clean||online!==true||wait>0} style={form.button} onPress={()=>void start()}><Text style={form.buttonText}>{online===true?'Start recording':'Internet connection required'}</Text></MotionPressable>}
  {phase==='preparing'&&<Text accessibilityLiveRegion="polite" style={form.subtitle}>Checking availability and microphone…</Text>}
  {phase==='recording'&&<><Text accessibilityLiveRegion="polite" style={form.title}>{Math.min(20,Math.floor(status.durationMillis/1000))} / 20 seconds</Text><MotionPressable style={form.button} onPress={()=>void stop()}><Square size={18} color={colors.onPrimary}/><Text style={form.buttonText}>Stop and process</Text></MotionPressable></>}
  {phase==='processing'&&<Text accessibilityLiveRegion="polite" style={form.subtitle}>Transcribing and preparing your entry…</Text>}
  {proposal&&<><Text style={form.label}>What we heard</Text><Text selectable style={form.subtitle}>{proposal.transcript||'No clear speech detected.'}</Text>{proposal.intent==='entry'?<><Text style={form.subtitle}>Review and correct every field before saving.</Text>{proposal.unresolved.map((warning,index)=><Text key={index} style={form.subtitle}>{warning}</Text>)}<MotionPressable style={form.button} onPress={review}><Text style={form.buttonText}>Review entry</Text></MotionPressable></>:<Text style={form.error}>{proposal.groupingIssue==='unsupported_adjustment'?'This includes a discount, refund or adjustment. Use Manual Entry to include every amount.':proposal.groupingIssue==='too_many_purchases'?'Voice supports up to 20 purchases. Record a shorter list or use Manual Entry.':proposal.intent==='multiple'?'These purchases need separate transactions. Record purchases with the same date, currency and payment account together.':proposal.intent==='transfer'?'This is a transfer or balance operation. Use Manual Entry.':'The transaction or shared details are unclear. Record again or use Manual Entry.'}</Text>}
   <FormActions primaryVariant="secondary" marginTop={0}
    secondary={{label:'Record again',onPress:()=>{setProposal(null);setPhase('ready');}}}
    primary={{label:'Manual Entry',onPress:manualEntry}}/></>}
  {!proposal&&<MotionPressable style={form.secondaryButton} onPress={manualEntry}><Text style={form.chipTextSelected}>Manual Entry</Text></MotionPressable>}
  <MotionPressable style={form.secondaryButton} onPress={()=>{void cancel().then(()=>router.back());}}><Text style={form.chipTextSelected}>Cancel</Text></MotionPressable>
 </View></ScrollView>;
}

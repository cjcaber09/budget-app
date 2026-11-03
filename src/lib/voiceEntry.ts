import * as FileSystem from 'expo-file-system/legacy';
import {supabase} from './supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useAppLockStore} from '../stores/useAppLockStore';
import {handoffGeneration} from './nativeHandoff';
import {transactionDraftGeneration} from './transactionDraftStorage';
import type {VoiceEntryContext} from '../stores/useVoiceEntryStore';
import {VOICE_MAX_BYTES} from '../../supabase/functions/voice-entry/shared';

export function voiceContextActive(context:VoiceEntryContext){
 const profile=usePreferencesStore.getState().profile,lock=useAppLockStore.getState();
 return profile?.user_id===context.owner&&profile.currency===context.currency&&profile.timezone===context.timezone&&handoffGeneration()===context.generation&&transactionDraftGeneration(context.owner)===context.draftGeneration&&!(lock.enabled&&(lock.locked||lock.obscured));
}
let cleanupWork:Promise<void>|null=null;
export function cleanupVoiceFiles():Promise<void>{
 if(!cleanupWork)cleanupWork=removeAbandonedVoiceFiles().finally(()=>{cleanupWork=null;});
 return cleanupWork;
}
async function removeAbandonedVoiceFiles(){
 const directory=FileSystem.cacheDirectory+'Audio/';
 const info=await FileSystem.getInfoAsync(directory);if(!info.exists)return;
 const files=await FileSystem.readDirectoryAsync(directory);
 await Promise.all(files.filter(name=>/^recording-[0-9a-f-]+\.m4a$/i.test(name)).map(name=>FileSystem.deleteAsync(directory+name,{idempotent:true})));
}
export async function removeVoiceFile(uri:string|null){
 if(uri&&FileSystem.cacheDirectory&&uri.startsWith(FileSystem.cacheDirectory)&&uri.endsWith('.m4a'))await FileSystem.deleteAsync(uri,{idempotent:true});
}
export interface VoiceFailure extends Error {retryAfterSeconds?:number}
export async function callVoice(context?:VoiceEntryContext,uri?:string,signal?:AbortSignal){
 let body:Record<string,unknown>|undefined;
 if(context&&uri){
  if(!voiceContextActive(context))throw new Error('This entry session changed. Start again.');
  const file=await FileSystem.getInfoAsync(uri);if(!file.exists||file.size>VOICE_MAX_BYTES)throw new Error('Recording is unavailable or too large. Record again.');
  body={proposalVersion:2,requestId:context.visit,audioBase64:await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64}),day:context.day,timezone:context.timezone,currency:context.currency};
 }
 const response=await supabase.functions.invoke('voice-entry',{method:body?'POST':'GET',body,signal});
 if(response.error){
  const details=await response.error.context?.json?.().catch(()=>null);
  const messages:Record<string,string>={voice_unavailable:'Voice entry is temporarily unavailable. Use Manual Entry.',profile_changed:'Your currency or timezone changed. Start a new recording.',already_attempted:'This recording was already attempted. Record again or enter manually.',too_many_choices:'Too many choices for voice processing. Use Manual Entry.',entry_session_changed:'Your financial data changed. Start again.',unauthorized:'Sign in again before using Voice.'};
  const seconds=Number(details?.retryAfterSeconds);
  const issue:VoiceFailure=new Error(seconds>0?'Voice limit reached. Wait before recording again.':messages[details?.error]??'Could not process voice. Record again or enter manually.');
  if(Number.isFinite(seconds)&&seconds>0)issue.retryAfterSeconds=seconds;
  throw issue;
 }
 return response.data;
}

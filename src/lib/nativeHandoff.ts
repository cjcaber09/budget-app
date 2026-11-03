import {AppState,Platform} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {encryptedStorage} from './encryptedStorage';
import {useAppLockStore} from '../stores/useAppLockStore';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {createRequestId} from '../domain/ocr';
import {useRecoveredPickerStore} from '../stores/useRecoveredPickerStore';

export const HANDOFF_TIMEOUT=120_000;
const MARKER='budget-tracker:native-handoff:v1';
export type HandoffPurpose='receipt-camera'|'receipt-upload'|'avatar'|'microphone'|'notification-permission';
export interface HandoffMarker {owner:string;purpose:HandoffPurpose;visit:string;startedAt:number}
let generation=0;
let opening=false;
const invalidationListeners=new Set<()=>void>();
let state=AppState.currentState;
let active:{marker:HandoffMarker;deadline:number;settled:boolean;timer:ReturnType<typeof setTimeout>}|null=null;
function clearGuard(){if(active)clearTimeout(active.timer);active=null;}
export function handoffGeneration(){return generation;}
export function invalidateNativeHandoffs(){generation++;clearGuard();invalidationListeners.forEach(fn=>fn());useRecoveredPickerStore.getState().setAvatar(null);void encryptedStorage.removeItem(MARKER).catch(()=>{});}
// Called even when app lock is disabled, so picker callback/event ordering agrees.
export function observeHandoffState(next:string):'guarded'|'expired'|'ordinary'{
 state=next as typeof state;
 if(!active)return 'ordinary';
 const valid=active.marker.owner===usePreferencesStore.getState().profile?.user_id&&Date.now()<active.deadline&&!useAppLockStore.getState().locked;
 if(!valid){clearGuard();return 'expired';}
 if(next==='active'&&active.settled)clearGuard();
 return 'guarded';
}
export async function runNativeHandoff<T>(purpose:HandoffPurpose,action:()=>Promise<T>):Promise<T>{
 if(Platform.OS==='web')return action();
 const lock=useAppLockStore.getState(),owner=usePreferencesStore.getState().profile?.user_id;
 if(active||opening||!owner||AppState.currentState!=='active'||lock.enabled&&(!lock.loaded||lock.locked||lock.obscured))throw new Error('Unlock the app before opening this action.');
 opening=true;
 try{
 const attempt=generation;
 const marker:HandoffMarker={owner,purpose,visit:createRequestId(),startedAt:Date.now()};
 if(purpose!=='microphone'&&purpose!=='notification-permission')await encryptedStorage.setItem(MARKER,JSON.stringify(marker));
 const currentLock=useAppLockStore.getState();
 if(attempt!==generation||usePreferencesStore.getState().profile?.user_id!==owner||AppState.currentState!=='active'||currentLock.enabled&&(currentLock.locked||currentLock.obscured))throw new Error('The entry session changed. Try again.');
 const token={marker,deadline:Date.now()+HANDOFF_TIMEOUT,settled:false,timer:setTimeout(()=>{
  if(active!==token)return;clearGuard();if(useAppLockStore.getState().enabled)useAppLockStore.setState({locked:true});
 },HANDOFF_TIMEOUT)};
 active=token;state=AppState.currentState;
 try{return await action();}
 finally{
  if(active===token){token.settled=true;if(state==='active')clearGuard();}
  // The marker is retained until its result has actually been accepted by its owner.
 }
 }finally{opening=false;}
}
export async function clearHandoffMarker(){await encryptedStorage.removeItem(MARKER);}
export async function waitForHandoffReturn(owner:string,attempt:number){
 const ready=()=>AppState.currentState==='active'&&!(useAppLockStore.getState().enabled&&(useAppLockStore.getState().locked||useAppLockStore.getState().obscured));
 if(attempt!==generation||usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('The entry session changed.');
 if(ready())return;
 await new Promise<void>((resolve,reject)=>{
  const cleanup: (()=>void)[]=[];
  const finish=(error?:Error)=>{cleanup.forEach(fn=>fn());if(error)reject(error);else resolve();};
  const check=()=>{if(attempt!==generation||usePreferencesStore.getState().profile?.user_id!==owner)finish(new Error('The entry session changed.'));else if(ready())finish();};
  invalidationListeners.add(check);cleanup.push(()=>{invalidationListeners.delete(check);});
  const listener=AppState.addEventListener('change',check);cleanup.push(()=>listener.remove());
  cleanup.push(useAppLockStore.subscribe(check),usePreferencesStore.subscribe(check));
  const timer=setTimeout(()=>finish(new Error('Choose the image again.')),900000);cleanup.push(()=>clearTimeout(timer));check();
 });
}
export async function recoverNativeHandoff():Promise<{marker:HandoffMarker;result:ImagePicker.ImagePickerResult}|null>{
 if(Platform.OS!=='android'||active||opening)return null;
 opening=true;
 try{
 const attempt=generation;
 const raw=await encryptedStorage.getItem(MARKER);
 if(!raw)return null;
 const marker=JSON.parse(raw) as HandoffMarker;
 const result=await ImagePicker.getPendingResultAsync();
 const age=Date.now()-marker.startedAt;
 await clearHandoffMarker();
 if(attempt!==generation||marker.owner!==usePreferencesStore.getState().profile?.user_id||age<0||age>900_000||!['receipt-camera','receipt-upload','avatar'].includes(marker.purpose)||!result||'code' in result||result.canceled)return null;
 return {marker,result};
 }finally{opening=false;}
}

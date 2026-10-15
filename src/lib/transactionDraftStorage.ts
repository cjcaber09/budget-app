import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {decodeEntryDraft,type EntryDraft} from '../domain/transferDraft';
import {useFinancialResetStore} from '../stores/useFinancialResetStore';
import {useAccountDeletionStore} from '../stores/useAccountDeletionStore';

const prefix='budget-tracker:transaction-draft:v1:';
const generations=new Map<string,number>();
let queue:Promise<unknown>=Promise.resolve();
function serialized<T>(task:()=>Promise<T>):Promise<T>{const next=queue.catch(()=>{}).then(task);queue=next;return next;}
// Wait for the existing serialized writes before a deliberate app restart.
export async function settleTransactionDraftWrites():Promise<void> {
 let observed:Promise<unknown>;
 do {observed=queue;await observed;} while(observed!==queue);
}
const available=()=>Platform.OS!=='web'||typeof window!=='undefined';
export async function loadTransactionDraft(owner:string):Promise<EntryDraft|null> {
 return serialized(async()=>{if(!available())return null;const raw=await AsyncStorage.getItem(prefix+owner);return raw?decodeEntryDraft(raw,owner):null;});
}
export function transactionDraftGeneration(owner:string){return generations.get(owner)??0;}
export async function saveTransactionDraft(draft:EntryDraft,generation=transactionDraftGeneration(draft.owner)):Promise<void> {
 const raw=JSON.stringify(decodeEntryDraft(JSON.stringify(draft),draft.owner));
 return serialized(async()=>{const reset=useFinancialResetStore.getState(),deletion=useAccountDeletionStore.getState();if(!available()||(generations.get(draft.owner)??0)!==generation||usePreferencesStore.getState().profile?.user_id!==draft.owner||reset.starting||reset.pending?.owner===draft.owner||deletion.starting||deletion.pending?.owner===draft.owner)throw new Error('Draft session is no longer active.');await AsyncStorage.setItem(prefix+draft.owner,raw);});
}
export async function clearTransactionDraft(owner:string,id?:string):Promise<void> {
 if(!id)generations.set(owner,(generations.get(owner)??0)+1);
 return serialized(async()=>{if(!available())return;if(id){const raw=await AsyncStorage.getItem(prefix+owner);if(raw){try{if(JSON.parse(raw).id!==id)return;}catch{/* Discard unreadable local data. */}}generations.set(owner,(generations.get(owner)??0)+1);}await AsyncStorage.removeItem(prefix+owner);});
}

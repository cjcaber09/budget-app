import {encryptedStorage} from './encryptedStorage';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useReminderFreshnessStore,type ReminderFreshness} from '../stores/useReminderFreshnessStore';
const prefix='budget-tracker:reminder-freshness:v1:';
const generations=new Map<string,number>();
export async function loadReminderFreshness(owner:string){
  const generation=generations.get(owner)??0;
  const raw=await encryptedStorage.getItem(prefix+owner);if(!raw)return;
  const s=JSON.parse(raw) as ReminderFreshness;
  if(s.owner!==owner||typeof s.timezone!=='string'||!Number.isFinite(Date.parse(s.syncedAt))||!['enabled','disabled','permission-denied'].includes(s.mode)||!Array.isArray(s.scheduledAt)||s.scheduledAt.length>48||s.scheduledAt.some(t=>typeof t!=='string'||!Number.isFinite(Date.parse(t))))throw new Error('Reminder status could not be read.');
  if(usePreferencesStore.getState().profile?.user_id!==owner||generation!==(generations.get(owner)??0))return;
  const current=useReminderFreshnessStore.getState().snapshot;
  if(!current||current.owner!==owner||current.syncedAt<s.syncedAt)useReminderFreshnessStore.setState({owner,snapshot:s});
}
export async function saveReminderFreshness(snapshot:ReminderFreshness){
  const generation=generations.get(snapshot.owner)??0;
  if(usePreferencesStore.getState().profile?.user_id!==snapshot.owner)return;
  await encryptedStorage.setItem(prefix+snapshot.owner,JSON.stringify(snapshot));
  if(generation!==(generations.get(snapshot.owner)??0)||usePreferencesStore.getState().profile?.user_id!==snapshot.owner)return;
  useReminderFreshnessStore.setState({owner:snapshot.owner,snapshot,syncing:false,error:''});
}
export async function clearReminderFreshness(owner:string){
  generations.set(owner,(generations.get(owner)??0)+1);
  useReminderFreshnessStore.setState({owner:null,snapshot:null,syncing:false,error:''});
  await encryptedStorage.removeItem(prefix+owner);
}

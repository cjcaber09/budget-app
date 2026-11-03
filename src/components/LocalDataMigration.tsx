import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {loadTransactionDraft} from '../lib/transactionDraftStorage';
import {loadOfflineDraftChoices} from '../lib/offlineDraftChoicesStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {encryptedStorage} from '../lib/encryptedStorage';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFormStyles} from '../styles/forms';
import {MotionPressable} from './MotionPressable';
export function LocalDataMigration(){
 const owner=usePreferencesStore(s=>s.profile?.user_id),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),form=useFormStyles();
 useEffect(()=>{if(!owner){ return; }let active=true;void (async()=>{
   const keys=await AsyncStorage.getAllKeys();
   const managed=keys.filter(key=>key.startsWith('budget-tracker:transaction-draft:v1:')||key.startsWith('budget-tracker:draft-choices:v1:'));
   await Promise.all(managed.map(key=>encryptedStorage.getItem(key)));
   await Promise.all([loadTransactionDraft(owner),loadOfflineDraftChoices(owner)]);
 })().then(()=>{if(active){ setFailed(false); }}).catch(()=>{if(active){ setFailed(true); }});return()=>{active=false;};},[owner,retry]);
 if(!owner||!failed){ return null; }
 return <View style={{padding:16}}><Text accessibilityRole="alert" style={form.error}>Local data could not be secured or read. Existing data was kept. Retry before editing a draft.</Text><MotionPressable style={form.secondaryButton} onPress={()=>setRetry(n=>n+1)}><Text style={form.chipTextSelected}>Retry local data</Text></MotionPressable></View>;
}

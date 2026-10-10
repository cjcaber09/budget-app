import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PendingDeletion {owner:string;requestId:string;accepted:boolean}
const key='budget-tracker:pending-account-deletion';
interface State {pending:PendingDeletion|null;hydrated:boolean;starting:boolean;set:(pending:PendingDeletion|null)=>Promise<void>;load:()=>Promise<void>}
export const useAccountDeletionStore=create<State>((set,get)=>({pending:null,hydrated:false,starting:false,
 set:async pending=>{set({pending});if(pending)await AsyncStorage.setItem(key,JSON.stringify(pending));else await AsyncStorage.removeItem(key);},
 load:async()=>{
  if(get().hydrated)return;
  try{const value=await AsyncStorage.getItem(key);if(value){const parsed=JSON.parse(value);if(typeof parsed.owner==='string'&&typeof parsed.requestId==='string'&&typeof parsed.accepted==='boolean')set({pending:parsed});}}
  finally{set({hydrated:true});}
 },
}));

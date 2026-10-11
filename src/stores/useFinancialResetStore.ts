import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {isUuid} from '../../supabase/functions/ocr/shared';
export interface PendingReset {owner:string;requestId:string;accepted:boolean}
const key='budget-tracker:financial-reset';
interface State {pending:PendingReset|null;handled:Record<string,string>;hydrated:boolean;starting:boolean;epoch:number;set:(operation:PendingReset|null)=>Promise<void>;complete:(owner:string,id:string)=>Promise<void>;load:()=>Promise<void>}
export const useFinancialResetStore=create<State>((set,get)=>({pending:null,handled:{},hydrated:false,starting:false,epoch:0,
 set:async pending=>{set({pending});await AsyncStorage.setItem(key,JSON.stringify({pending,handled:get().handled}));},
 complete:async(owner,id)=>{const handled={...get().handled,[owner]:id};const pending=get().pending;const remaining=pending?.owner===owner&&pending.requestId===id?null:pending;await AsyncStorage.setItem(key,JSON.stringify({pending:remaining,handled}));const latest=get().pending;set({handled:{...get().handled,[owner]:id},pending:latest?.owner===owner&&latest.requestId===id?null:latest});},
 load:async()=>{if(get().hydrated)return;try{
  const value=await AsyncStorage.getItem(key);if(value){const parsed=JSON.parse(value);const pending=parsed.pending;const handled=Object.fromEntries(Object.entries(parsed.handled??{}).filter(([owner,id])=>isUuid(owner)&&isUuid(id)));
   set({handled:handled as Record<string,string>,pending:pending&&isUuid(pending.owner)&&isUuid(pending.requestId)&&typeof pending.accepted==='boolean'?pending:null});}
 }finally{set({hydrated:true});}},
}));

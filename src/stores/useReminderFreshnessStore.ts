import {create} from 'zustand';
export interface ReminderFreshness {owner:string;timezone:string;syncedAt:string;scheduledAt:string[];mode:'enabled'|'disabled'|'permission-denied'}
export const useReminderFreshnessStore=create<{owner:string|null;snapshot:ReminderFreshness|null;syncing:boolean;error:string}>(()=>({owner:null,snapshot:null,syncing:false,error:''}));

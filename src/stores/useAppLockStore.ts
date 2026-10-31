import {create} from 'zustand';
export const useAppLockStore=create<{loaded:boolean;enabled:boolean;locked:boolean;obscured:boolean;busy:boolean;error:string}>(()=>({loaded:false,enabled:false,locked:true,obscured:false,busy:false,error:''}));

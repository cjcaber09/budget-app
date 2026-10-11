import {create} from 'zustand';
import {useEffect} from 'react';

interface HelpState {
  owner:string|null; visible:boolean; dismissed:boolean; blockers:string[];
  open:()=>void; close:()=>void; reset:(owner?:string|null)=>void;
  block:(key:string,active:boolean)=>void;
}
export const useHelpStore=create<HelpState>(set=>({
  owner:null,visible:false,dismissed:false,blockers:[],
  open:()=>set({visible:true}),close:()=>set({visible:false,dismissed:true}),
  reset:(owner=null)=>set(s=>({owner,visible:false,dismissed:false,blockers:owner?s.blockers:[]})),
  block:(key,active)=>set(s=>({blockers:active?[...s.blockers.filter(k=>k!==key),key]:s.blockers.filter(k=>k!==key)})),
}));
// Keep help behind a native sheet until its closing animation has finished.
export function useHelpBlocker(key:string,active:boolean) {
  useEffect(()=>{
    if(active){useHelpStore.getState().block(key,true);return;}
    const timer=setTimeout(()=>useHelpStore.getState().block(key,false),1000);
    return()=>clearTimeout(timer);
  },[key,active]);
  useEffect(()=>()=>useHelpStore.getState().block(key,false),[key]);
}

import {useCallback,useEffect,useRef} from 'react';
import {AppState} from 'react-native';

/** A task returns true to poll again; it owns status/error presentation. */
export function useSerialOperationPoll(enabled:boolean,key:string,task:(current:()=>boolean)=>Promise<boolean>) {
  const latest=useRef(task),trigger=useRef<(()=>void)|null>(null);
  useEffect(()=>{latest.current=task;});
  useEffect(()=>{
    if(!enabled)return;
    let disposed=false,running=false,timer:ReturnType<typeof setTimeout>|undefined;
    const current=()=>!disposed;
    const check=async()=>{
      if(disposed||running)return;
      clearTimeout(timer);running=true;let repeat=false;
      try{repeat=await latest.current(current);}
      finally{running=false;if(!disposed&&repeat)timer=setTimeout(()=>void check(),10000);}
    };
    const request=()=>{void check();};
    trigger.current=request;request();
    const listener=AppState.addEventListener('change',state=>{if(state==='active')request();});
    return()=>{disposed=true;clearTimeout(timer);listener.remove();if(trigger.current===request)trigger.current=null;};
  },[enabled,key]);
  return useCallback(()=>trigger.current?.(),[]);
}

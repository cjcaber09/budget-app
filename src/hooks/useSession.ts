import { useCallback,useEffect, useRef,useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,setError]=useState<string|null>(null);
  const generation=useRef(0);
  const invalidate=useCallback(()=>{generation.current++;},[]);
  const loadSession=useCallback(async()=>{
    const attempt=++generation.current;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{
      const result=await Promise.race([supabase.auth.getSession(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('Session loading timed out. Try again.')),12000);})]);
      if(attempt!==generation.current)return;
      if(result.error)throw result.error;
      setSession(result.data.session);
    }catch(e){if(attempt===generation.current)setError(e instanceof Error?e.message:'Could not load your session. Try again.');}
    finally{if(timeout)clearTimeout(timeout);if(attempt===generation.current)setLoading(false);}
  },[]);
  const refresh=useCallback(()=>{setLoading(true);setError(null);return loadSession();},[loadSession]);

  useEffect(() => {
    let active=true;
    void Promise.resolve().then(()=>{if(active)void loadSession();});

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      invalidate();setError(null);setLoading(false);
      setSession(newSession);
    });

    return () => {active=false;invalidate();listener.subscription.unsubscribe();};
  }, [loadSession,invalidate]);

  return { session, loading,error,refresh };
}

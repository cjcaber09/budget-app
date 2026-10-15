import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {localDateKey} from '../domain/transactionDates';
import {reportingMonthSupported} from '../domain/reports';
import {decodeOverviewHighlights} from '../domain/overviewHighlights';
export function useOverviewHighlights(month:string){
 const profile=usePreferencesStore(s=>s.profile),[clock,setClock]=useState(()=>Date.now());
 const today=localDateKey(new Date(clock),profile?.timezone),supported=reportingMonthSupported(month,today);
 const query=useQuery({queryKey:['overviewHighlights',profile?.user_id,month,profile?.timezone,today],enabled:!!profile&&supported,refetchOnMount:'always',meta:{shouldNotify:()=>false},
  queryFn:async({signal})=>{
   const r=await supabase.rpc('overview_highlights',{p_month:month}).abortSignal(signal);
   if(r.error)throw new Error('Could not load highlights. Retry.');
   return decodeOverviewHighlights(r.data,{owner:profile!.user_id,month,timezone:profile!.timezone,today});
  }});
 const refetch=query.refetch;
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);const listener=AppState.addEventListener('change',state=>{if(state==='active'){setClock(Date.now());if(supported)void refetch();}});return()=>{clearInterval(timer);listener.remove();};},[refetch,supported]);
 return {...query,today,supported};
}

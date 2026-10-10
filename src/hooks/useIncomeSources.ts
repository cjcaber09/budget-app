import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {isUuid} from '../../supabase/functions/ocr/shared';
import {invalidateReports} from '../lib/reportCache';
export interface IncomeSource {id:string;user_id:string;name:string;archived:boolean}
export interface SaveIncomeSource {id:string;operation:'create'|'rename'|'archive'|'restore';name?:string}
export function useIncomeSources() {
 const owner=usePreferencesStore(s=>s.profile?.user_id);
 return useQuery({queryKey:['incomeSources',owner],enabled:!!owner,queryFn:async({signal}):Promise<IncomeSource[]>=>{
  const values:IncomeSource[]=[];for(let start=0;;start+=1000){const r=await supabase.from('income_sources').select('id,user_id,name,archived').eq('user_id',owner!).order('name').order('id').range(start,start+999).abortSignal(signal);if(r.error)throw new Error('Could not load income sources. Your selection is still here; retry.');if(!Array.isArray(r.data)||r.data.some(s=>s.user_id!==owner||!isUuid(s.id)||typeof s.name!=='string'||typeof s.archived!=='boolean'))throw new Error('Income source data could not be read. Retry to refresh.');values.push(...r.data);if(r.data.length<1000)return values;}
 }});
}
export function useSaveIncomeSource() {
 const client=useQueryClient();
 return useMutation({meta:{shouldNotify:()=>false},mutationFn:async(input:SaveIncomeSource)=>{
  const owner=usePreferencesStore.getState().profile?.user_id;if(!owner)throw new Error('Sign in again.');
  if(!isUuid(input.id)||((input.operation==='create'||input.operation==='rename')&&(!input.name?.trim()||input.name.trim().length>80)))throw new Error('Enter a source name of 1 to 80 characters.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try {
   const r=await supabase.rpc('save_income_source',{p_source:{...input,...(input.name===undefined?{}:{name:input.name.trim()})}}).abortSignal(controller.signal);
   if(r.error)throw new Error(r.error.code==='23505'?'This source was already created with different details. Retry the original name, then rename it.':'Could not save this source. Your draft is still here; retry.');
   const saved=r.data as IncomeSource;if(saved?.user_id!==owner||!isUuid(saved.id))throw new Error('The source response was incomplete. Retry the same draft.');
   return saved;
  } finally {clearTimeout(timer);}
 },onSuccess:s=>{if(s.user_id!==usePreferencesStore.getState().profile?.user_id)return;void client.invalidateQueries({queryKey:['incomeSources']});invalidateReports(client);}});
}

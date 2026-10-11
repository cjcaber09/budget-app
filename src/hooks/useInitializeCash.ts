import {useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {centsToDecimal,decimalToCents,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';
import {invalidateReports} from '../lib/reportCache';

export function useInitializeCash() {
  const client=useQueryClient();
  return useMutation({meta:{shouldNotify:()=>false},mutationFn:async(input:{methodId:string;amount:string})=>{
    const owner=usePreferencesStore.getState().profile?.user_id;
    const cents=/^\d+(?:\.\d{0,2})?$/.test(input.amount)?decimalToCents(input.amount):null;
    if(!owner)throw new Error('Sign in again.');
    if(cents===null||cents<0||cents>MAX_MONEY_CENTS)throw new Error('Enter a Cash amount of zero or more, with up to two decimal places.');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
    try {
      const {data,error}=await supabase.rpc('initialize_cash_balance',{p_method_id:input.methodId,p_amount:centsToDecimal(cents)}).abortSignal(controller.signal);
      if(error)throw new Error(error.code==='PGRST202'?'Cash setup is not available yet. Your draft is kept.': 'Could not confirm Cash setup. Refresh Cash before retrying.');
      if(data?.owner!==owner||data.methodId!==input.methodId||!['initialized','already_initialized'].includes(data.state)||usePreferencesStore.getState().profile?.user_id!==owner)
        throw new Error('Could not confirm Cash setup. Refresh Cash before retrying.');
      return data as {owner:string;methodId:string;state:'initialized'|'already_initialized'};
    } finally {clearTimeout(timer);}
  },onSuccess:result=>{
    if(usePreferencesStore.getState().profile?.user_id!==result.owner)return;
    invalidateReports(client);
    for(const queryKey of [['paymentMethods'],['dashboard'],['recurringRules']])void client.invalidateQueries({queryKey});
  }});
}

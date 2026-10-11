import {invalidateReports} from '../lib/reportCache';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {centsToDecimal,decimalToCents,MAX_MONEY_CENTS,isCalendarDate} from '../../supabase/functions/ocr/shared';
import {validatePaymentMethod,type PaymentMethod,type PaymentMethodValues,type PaymentTransfer,type BalanceCorrection} from '../domain/paymentMethods';
import {localDateKey} from '../domain/transactionDates';
import {transferEnteredAmount,transferAmounts,type TransferFeeMode} from '../domain/transferFees';

async function bounded<T>(task:(signal:AbortSignal)=>PromiseLike<T>):Promise<T> {
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try {return await Promise.race([Promise.resolve(task(controller.signal)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('The request timed out. Your draft is still here; try again.'));},12000);})]);}
  finally {if(timer)clearTimeout(timer);}
}
export function usePaymentMethods() {
  const profile=usePreferencesStore(s=>s.profile);
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const day=localDateKey(new Date(clock),profile?.timezone);
  const query=useQuery({queryKey:['paymentMethods',profile?.user_id,profile?.timezone,day],enabled:!!profile?.user_id,refetchInterval:60000,queryFn:async({signal})=>{
    const result=await supabase.rpc('payment_method_snapshot').abortSignal(signal);if(result.error)throw new Error('Could not load payment methods. Retry to refresh balances.');
    return result.data as {owner:string;timezone:string;transferFeeVersion?:number;methods:PaymentMethod[];transfers:PaymentTransfer[];corrections:BalanceCorrection[]};
  }});
  const valid=query.data?.owner===profile?.user_id&&query.data?.timezone===profile?.timezone;
  const refetch=query.refetch;
  useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state==='active'&&profile?.user_id){setClock(Date.now());void refetch();}});return()=>listener.remove();},[profile?.user_id,refetch]);
  return {...query,feeSupported:valid&&query.data?.transferFeeVersion===1,methods:valid?query.data?.methods:undefined,transfers:valid?query.data?.transfers:undefined,corrections:valid?query.data?.corrections:undefined};
}
type SaveInput=({operation:'create'|'update'}&PaymentMethodValues)|{operation:'archive'|'restore';id:string;reassignBills?:boolean;replacementMethodId?:string|null};
export function useSavePaymentMethod() {
  const client=useQueryClient();
  return useMutation({mutationFn:async(input:SaveInput)=>{
    const owner=usePreferencesStore.getState().profile?.user_id;if(!owner)throw new Error('Sign in to save a payment method.');
    let payload:Record<string,unknown>={...input};
    if(input.operation==='create'||input.operation==='update'){
      const error=validatePaymentMethod(input);if(error)throw new Error(error);
      payload={...input,name:input.name.trim(),paymentType:input.paymentType.trim(),openingBalance:centsToDecimal(decimalToCents(input.openingBalance)!),lastFour:input.lastFour||null};
    }
    const result=await bounded(signal=>supabase.rpc('save_payment_method',{p_method:payload}).abortSignal(signal));
    if(result.error)throw new Error(result.error.code==='22023'?result.error.message:'Could not save this payment method. Check the fields and retry; your draft is still here.');
    const method=result.data as PaymentMethod;
    if(!method?.id||method.user_id!==owner)throw new Error('The save response was incomplete. Retry this same draft.');
    return method;
  },onSuccess:method=>{if(usePreferencesStore.getState().profile?.user_id===method.user_id){invalidateReports(client);void client.invalidateQueries({queryKey:['paymentMethods']});void client.invalidateQueries({queryKey:['recurringRules']});void client.invalidateQueries({queryKey:['recurringRule']});void client.invalidateQueries({queryKey:['dashboard']});}}});
}
export function useSavePaymentTransfer() {
  const client=useQueryClient();return useMutation({mutationFn:async(input:{id:string;operation:'create'|'update'|'delete';sourceId?:string;destinationId?:string;amount?:string;feeAmount?:string;feeMode?:TransferFeeMode;date?:string;note?:string|null})=>{
    const owner=usePreferencesStore.getState().profile?.user_id;if(!owner)throw new Error('Sign in again.');
    const amount=input.amount===undefined?null:/^\d+(?:\.\d{0,2})?$/.test(input.amount)?decimalToCents(input.amount):null;
    if(input.operation!=='delete'&&(amount===null||amount<=0||amount>MAX_MONEY_CENTS||input.sourceId===input.destinationId||!input.date||!isCalendarDate(input.date)))throw new Error('Choose two different methods, a valid date and a positive amount.');
    const fee=input.feeAmount===undefined?undefined:decimalToCents(input.feeAmount);
    const supportsFees=client.getQueriesData<{owner:string;timezone:string;transferFeeVersion?:number}>({queryKey:['paymentMethods']}).some(([,data])=>data?.owner===owner&&data.timezone===usePreferencesStore.getState().profile?.timezone&&data.transferFeeVersion===1);
    if(input.operation!=='delete'&&fee!==undefined){
      if(fee===null||fee<0||!transferAmounts(transferEnteredAmount(input.amount!,input.feeAmount,input.feeMode),input.feeAmount!,input.feeMode??'added'))throw new Error('Enter a valid transfer fee.');
      if(fee>0&&!supportsFees)throw new Error('Transfer fees are not available yet. Refresh payment methods and retry.');
    }
    const payload={...input,payload_version:2,amount:amount===null?undefined:centsToDecimal(amount),...(fee===undefined?{}:{feeAmount:centsToDecimal(fee!)})};
    const rpcName=supportsFees?'save_payment_transfer_with_fee':'save_payment_transfer';
    const result=await bounded(signal=>supabase.rpc(rpcName,{p_transfer:payload}).abortSignal(signal));
    if(result.error?.code==='PGRST202'&&supportsFees)throw new Error('Transfer fees are unavailable. Refresh payment methods and retry; your draft is still here.');
    if(result.error)throw new Error(result.error.code==='BT001'?'Insufficient balance for the transfer and fee. Choose another source method.':result.error.code==='BT002'?'Set the source balance before transferring.':result.error.code==='23505'?'This transfer was saved with different details. Reopen it before editing.':'Could not save the transfer. Your draft is still here; retry.');
    if(input.operation!=='delete'&&(!result.data||result.data.id!==input.id||result.data.user_id!==owner||(fee!==undefined&&decimalToCents(result.data.fee_amount??'0')!==fee)||(fee!==undefined&&fee!>0&&input.feeMode!==undefined&&result.data.fee_mode!==input.feeMode)))throw new Error('The transfer response was incomplete. Retry this same draft.');
    return owner;
  },onSuccess:owner=>{if(usePreferencesStore.getState().profile?.user_id===owner){invalidateReports(client);for(const queryKey of [['paymentMethods'],['transactions'],['monthlyTotals'],['dashboard'],['categories'],['transaction'],['transactionItems']])void client.invalidateQueries({queryKey});}}});
}
export function useCorrectMethodBalance() {
  const client=useQueryClient();return useMutation({mutationFn:async(input:{id:string;methodId:string;targetBalance:string;expectedBalance:string;note:string|null;creditBalance?:boolean})=>{
    const owner=usePreferencesStore.getState().profile?.user_id;if(!owner)throw new Error('Sign in again.');
    const amount=/^-?\d+(?:\.\d{0,2})?$/.test(input.targetBalance)?decimalToCents(input.targetBalance):null;if(amount===null||Math.abs(amount)>MAX_MONEY_CENTS)throw new Error('Enter a valid target balance with up to two decimal places.');
    const result=await bounded(signal=>supabase.rpc('correct_method_balance',{p_correction:{...input,targetBalance:centsToDecimal(amount)}}).abortSignal(signal));
    if(result.error)throw new Error(result.error.code==='40001'?'Balance changed. Refresh balances and retry; your correction is still here.':'Could not correct this balance. Check the fields and retry.');return owner;
  },onSuccess:owner=>{if(usePreferencesStore.getState().profile?.user_id===owner){invalidateReports(client);void client.invalidateQueries({queryKey:['paymentMethods']});}}});
}

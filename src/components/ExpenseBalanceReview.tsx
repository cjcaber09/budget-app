import {useEffect,useRef,useState} from 'react';
import {Keyboard,View,Text} from 'react-native';
import {supabase} from '../lib/supabase';
import {decodeReportSnapshot} from '../domain/reports';
import {localDateKey} from '../domain/transactionDates';
import {expenseBudgetWarning,type BudgetExpense} from '../domain/expenseBudget';
import {Check,ArrowLeftRight,SlidersHorizontal} from 'lucide-react-native';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {expenseFundsWarning} from '../domain/expenseFunds';
import {PaymentMethodDialog} from './PaymentMethodPicker';
import {MotionPressable} from './MotionPressable';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import type {Transaction} from '../types/database';

export function useExpenseBalanceReview<T extends BudgetExpense & {paymentMethodId?:string|null;occurrenceId?:string}>(previous?:Transaction) {
 const query=usePaymentMethods(),profile=usePreferencesStore(s=>s.profile);
 const [checking,setChecking]=useState(false);
 const [pending,setPending]=useState<{input:T;proceed:()=>void;message:string;funds:boolean;owner?:string;timezone?:string}|null>(null);
 const [dialog,setDialog]=useState<'pick'|'details'|null>(null);
 const alive=useRef(true),running=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function review(input:T,proceed:()=>void){
  if(running.current)return;
  if(input.type!=='expense'){proceed();return;}
  Keyboard.dismiss();
  setChecking(true);
  running.current=true;
  const owner=profile?.user_id;
  try{
   const result=await query.refetch();
   if(!alive.current||usePreferencesStore.getState().profile?.user_id!==owner)return;
   const methods=!result.isError&&result.data?.owner===owner&&result.data?.timezone===profile?.timezone?result.data?.methods:undefined;
   const funds=input.occurrenceId?null:expenseFundsWarning(input,methods,previous,profile?.timezone);
   let budget:string|null=null;
   if(input.categoryId&&input.transactionDate){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
     const month=input.transactionDate.slice(0,7)+'-01';
     const result=await supabase.rpc('reporting_snapshot',{p_month:month}).abortSignal(controller.signal);
     if(result.error)throw result.error;
     const snapshot=decodeReportSnapshot(result.data,{owner:owner!,month,timezone:profile!.timezone,today:localDateKey(new Date(),profile!.timezone)});
     if(!snapshot.categories.data)throw new Error('Budget totals unavailable.');
     budget=expenseBudgetWarning(input,snapshot.categories.data,previous,profile?.timezone,profile?.currency);
    }catch{budget='The category budget could not be checked. Retry by returning to the expense, or record anyway without a budget check.';}
    finally{clearTimeout(timer);}
   }
   if(!alive.current||usePreferencesStore.getState().profile?.user_id!==owner||usePreferencesStore.getState().profile?.timezone!==profile?.timezone)return;
   const message=[budget,funds].filter(Boolean).join('\n\n');
   if(message)setPending({input,proceed,message,funds:!!funds,owner,timezone:profile?.timezone});else proceed();
  }finally{running.current=false;if(alive.current)setChecking(false);}
 }
 const selected=query.methods?.find(m=>pending?.input.paymentMethodId?m.id===pending.input.paymentMethodId:m.method==='cash');
 function Controls({busy=false}:{busy?:boolean}){
  const form=useFormStyles(),colors=useColors();
  if(!pending)return null;
  return <View>
   <Text accessibilityRole="alert" style={form.subtitle}>{pending.message}</Text>
   {pending.funds&&<><MotionPressable style={[form.secondaryButton,{flexDirection:'row',gap:8}]} disabled={busy} onPress={()=>{setPending(null);setDialog('pick');}}>
    <ArrowLeftRight size={18} color={colors.primary}/><Text style={form.chipTextSelected}>Change method</Text>
   </MotionPressable>
   <MotionPressable style={[form.secondaryButton,{flexDirection:'row',gap:8}]} disabled={busy||!selected} onPress={()=>setDialog('details')}>
    <SlidersHorizontal size={18} color={colors.primary}/><Text style={form.chipTextSelected}>{selected?.balance===null?'Set balance':'Correct balance'}</Text>
   </MotionPressable></>}
   <MotionPressable style={[form.button,{flexDirection:'row',gap:8}]} disabled={busy} onPress={()=>{
    if(usePreferencesStore.getState().profile?.user_id!==pending.owner||usePreferencesStore.getState().profile?.timezone!==pending.timezone){setPending(null);return;}
    pending.proceed();
   }}>
    <Check size={18} color={colors.onPrimary}/><Text style={form.buttonText}>Record anyway</Text>
   </MotionPressable>
   <MotionPressable style={form.secondaryButton} disabled={busy} onPress={()=>setPending(null)}><Text style={form.chipTextSelected}>Back to expense</Text></MotionPressable>
  </View>;
 }
 return {review,checking,pending,Controls,dialog,selected,closeDialog:()=>{setDialog(null);setPending(null);}};
}

// Reuse the method details sheet for corrections without navigating away from the draft.
export function ExpenseReviewMethodDialog({review,onSelect}:{review:Pick<ReturnType<typeof useExpenseBalanceReview>,'dialog'|'selected'|'closeDialog'>;onSelect:(id:string|null)=>void}) {
 return review.dialog?<PaymentMethodDialog picker={review.dialog==='pick'} initial={review.dialog==='details'?review.selected:undefined}
  onSelect={onSelect} onClose={review.closeDialog}/>:null;
}

import {useState} from 'react';
import {View,Text} from 'react-native';
import {Check,ArrowLeftRight,SlidersHorizontal} from 'lucide-react-native';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {expenseFundsWarning} from '../domain/expenseFunds';
import {PaymentMethodDialog} from './PaymentMethodPicker';
import {MotionPressable} from './MotionPressable';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import type {Transaction} from '../types/database';

export function useExpenseBalanceReview<T extends {type:string;amount:number;paymentMethodId?:string|null;occurrenceId?:string}>(previous?:Transaction) {
 const query=usePaymentMethods(),profile=usePreferencesStore(s=>s.profile);
 const [checking,setChecking]=useState(false);
 const [pending,setPending]=useState<{input:T;proceed:()=>void;message:string;owner?:string}|null>(null);
 const [dialog,setDialog]=useState<'pick'|'details'|null>(null);
 async function review(input:T,proceed:()=>void){
  if(checking)return;
  if(input.type!=='expense'||input.occurrenceId){proceed();return;}
  setChecking(true);
  const owner=profile?.user_id;
  try{
   const result=await query.refetch();
   if(usePreferencesStore.getState().profile?.user_id!==owner)return;
   const methods=!result.isError&&result.data?.owner===owner&&result.data?.timezone===profile?.timezone?result.data?.methods:undefined;
   const message=expenseFundsWarning(input,methods,previous,profile?.timezone);
   if(message)setPending({input,proceed,message,owner});else proceed();
  }finally{setChecking(false);}
 }
 const selected=query.methods?.find(m=>pending?.input.paymentMethodId?m.id===pending.input.paymentMethodId:m.method==='cash');
 function Controls({busy=false}:{busy?:boolean}){
  const form=useFormStyles(),colors=useColors();
  if(!pending)return null;
  return <View>
   <Text accessibilityRole="alert" style={form.subtitle}>{pending.message}</Text>
   <MotionPressable style={[form.secondaryButton,{flexDirection:'row',gap:8}]} disabled={busy} onPress={()=>{setPending(null);setDialog('pick');}}>
    <ArrowLeftRight size={18} color={colors.primary}/><Text style={form.chipTextSelected}>Change method</Text>
   </MotionPressable>
   <MotionPressable style={[form.secondaryButton,{flexDirection:'row',gap:8}]} disabled={busy||!selected} onPress={()=>setDialog('details')}>
    <SlidersHorizontal size={18} color={colors.primary}/><Text style={form.chipTextSelected}>{selected?.balance===null?'Set balance':'Correct balance'}</Text>
   </MotionPressable>
   <MotionPressable style={[form.button,{flexDirection:'row',gap:8}]} disabled={busy} onPress={()=>{
    if(usePreferencesStore.getState().profile?.user_id!==pending.owner){setPending(null);return;}
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

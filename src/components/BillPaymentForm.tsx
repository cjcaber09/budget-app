import {useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Save,Pencil} from 'lucide-react-native';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {createRequestId} from '../domain/ocr';
import {decimalToCents,centsToDecimal,isUuid,isCalendarDate} from '../../supabase/functions/ocr/shared';
import {useMoney} from '../domain/money';
import {invalidateReports} from '../lib/reportCache';
import {usePageLayout} from '../styles/pageLayout';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {PaymentMethodPicker} from './PaymentMethodPicker';
import {QueryState} from './QueryState';
import {MotionPressable} from './MotionPressable';
import {useProofDraft,ProofPicker,AttachmentRetry} from './TransactionAttachments';
import type {BillOccurrence} from '../domain/spendingGuidance';
import {localDateKey} from '../domain/transactionDates';
import {TransactionDateField} from './TransactionDateField';

export function BillPaymentForm({occurrenceId}:Readonly<{occurrenceId:string}>){
 const owner=usePreferencesStore(s=>s.profile?.user_id),layout=usePageLayout();
 const query=useQuery({queryKey:['billPayment',owner,occurrenceId],enabled:!!owner&&isUuid(occurrenceId),refetchOnMount:'always',queryFn:async()=>{
  const r=await supabase.from('recurring_occurrences').select('*').eq('user_id',owner!).eq('id',occurrenceId).single();
  if(r.error||!r.data)throw new Error('Could not load this bill.');return r.data as BillOccurrence;
 }});
 return <ScrollView style={layout.screen} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={layout.scrollContent}><View style={layout.card}>
 <QueryState loading={query.isPending&&isUuid(occurrenceId)} error={query.isError||!isUuid(occurrenceId)} retry={()=>void query.refetch()}>
 {query.data&&<PayBill key={`${owner}:${occurrenceId}`} bill={query.data}/>}</QueryState></View></ScrollView>;
}
function PayBill({bill}:Readonly<{bill:BillOccurrence}>){
 const [snapshot]=useState(bill),[id]=useState(createRequestId),[method,setMethod]=useState<string|null>(bill.payment_method_id??null);
 const [owner]=useState(()=>usePreferencesStore.getState().profile?.user_id);
 const [paymentDate,setPaymentDate]=useState(()=>localDateKey(new Date()));
 const [editingDate,setEditingDate]=useState(false);
 const form=useFormStyles(),colors=useColors(),money=useMoney(),client=useQueryClient(),router=useRouter(),proof=useProofDraft();
 const payment=useMutation({meta:{shouldNotify:()=>false},mutationFn:async()=>{
  if(!owner||usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('Sign in again.');
  const cents=decimalToCents(snapshot.amount);if(cents===null||cents<=0)throw new Error('Refresh this bill before paying.');
  if(!isCalendarDate(paymentDate)||paymentDate>localDateKey(new Date()))throw new Error('Choose a payment date on or before today.');
  const r=await supabase.rpc('pay_bill',{p_occurrence:snapshot.id,p_payment_method:method,p_transaction_id:id,p_expected_amount:centsToDecimal(cents),p_expected_date:snapshot.scheduled_date,p_payment_date:paymentDate});
  if(r.error)throw new Error(r.error.code==='BT001'?'Insufficient balance. Choose another payment method.':r.error.code==='BT002'?'Set this method’s balance before paying.':r.error.code==='40001'?'This bill changed. Go back and reopen it.':r.error.code==='23505'?'This payment was already saved with different details. Go back and reopen it.':'Could not record payment. Your draft is still here.');
  if(r.data?.transaction?.id!==id)throw new Error('Could not confirm payment. Retry this draft.');
  invalidateReports(client);for(const key of ['dashboard','transactions','paymentMethods','monthlyTotals','phoneReminders'])void client.invalidateQueries({queryKey:[key]});
 },onSuccess:()=>{if(usePreferencesStore.getState().profile?.user_id===owner)void proof.upload(id).then(ok=>{if(ok)router.back();});}});
 if(proof.savedId)return <AttachmentRetry draft={proof} onDone={()=>router.back()}/>;
 if(snapshot.state!=='outstanding'&&snapshot.state!=='replacement')return <Text accessibilityRole="alert" style={form.error}>This bill is no longer awaiting payment. Go back to refresh.</Text>;
 return <View style={{gap:16}}><View><Text style={form.label}>{snapshot.label||'Scheduled expense'}</Text><Text style={form.subtitle}>{money(Number(snapshot.amount))} · Due {snapshot.scheduled_date}</Text></View>
 <View pointerEvents={payment.isPending||proof.busy?'none':'auto'}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={[form.subtitle,{flex:1}]}>Paid on {paymentDate}</Text><MotionPressable accessibilityLabel="Edit payment date" accessibilityState={{expanded:editingDate}} disabled={payment.isPending||proof.busy} onPress={()=>setEditingDate(!editingDate)} style={{minHeight:48,minWidth:48,alignItems:'center',justifyContent:'center'}}><Pencil size={18} color={colors.primary}/></MotionPressable></View>
  {editingDate&&<TransactionDateField label="Payment date" accessibilityLabel="Payment date" value={paymentDate} onChange={setPaymentDate}/>}
 </View>
 <View pointerEvents={payment.isPending||proof.busy?'none':'auto'}><PaymentMethodPicker value={method} onChange={setMethod}/></View>
 <ProofPicker draft={proof} disabled={payment.isPending}/>
 {payment.error&&<Text accessibilityRole="alert" style={form.error}>{payment.error.message}</Text>}
 <MotionPressable accessibilityLabel="Record bill payment" style={[form.button,{flexDirection:'row',justifyContent:'center',gap:8}]} disabled={payment.isPending||proof.busy} onPress={()=>payment.mutate()}><Save size={18} color={colors.onPrimary}/><Text style={form.buttonText}>{payment.isPending?'Saving…':'Record payment'}</Text></MotionPressable>
 </View>;
}

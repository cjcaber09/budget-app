import {useEffect,useRef,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {useLocalSearchParams} from 'expo-router';
import {RotateCcw,Trash2,Check} from 'lucide-react-native';
import {useRefunds,useSaveRefund,type RefundInput} from '../hooks/useRefunds';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useHelpBlocker} from '../stores/useHelpStore';
import {type Refund,refundCents} from '../domain/refunds';
import {useMoneyCents} from '../domain/money';
import {createRequestId} from '../domain/ocr';
import {effectiveDate,localDateKey} from '../domain/transactionDates';
import {centsToDecimal,decimalToCents,isUuid} from '../../supabase/functions/ocr/shared';
import type {Transaction} from '../types/database';
import {useFormStyles} from '../styles/forms';
import {useColors,type} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {ActionSheet} from './ActionSheet';
import {MoneyInput} from './MoneyInput';
import {TransactionDateField} from './TransactionDateField';
import {paymentMethodLabel} from '../domain/paymentMethods';
import {RefundDestination} from './RefundDestination';

function readableDate(day:string) {
 const date=new Date(day+'T12:00:00Z');
 return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
}

export function RefundsPanel({transaction}:{transaction:Transaction}) {
 const methods=usePaymentMethods(),query=useRefunds(transaction.id,!!methods.refundSupported);
 const {refundId}=useLocalSearchParams<{refundId?:string}>();
 const form=useFormStyles(),colors=useColors(),money=useMoneyCents();
 const [visit,setVisit]=useState<{key:string;refund?:Refund}|null>(null),[busy,setBusy]=useState(false);const opened=useRef(false);
 useHelpBlocker('refund',!!visit);
 useEffect(()=>{if(!opened.current&&isUuid(refundId)&&query.data){const refund=query.data.rows.find(r=>r.id===refundId);const timer=setTimeout(()=>{if(opened.current)return;opened.current=true;if(refund)setVisit({key:createRequestId(),refund});},0);return()=>clearTimeout(timer);}},[refundId,query.data]);
 if(transaction.type!=='expense'||transaction.transfer_id)return null;
 if(transaction.created_at&&query.data&&Date.parse(transaction.created_at)!==Date.parse(query.data.expenseCreatedAt))return <Text accessibilityRole="alert" style={form.error}>The original expense changed. Reopen it before refunding.</Text>;
 return <View style={{gap:12,marginTop:24}}>
  <Text accessibilityRole="header" style={{...type.heading,color:colors.text}}>Refunds</Text>
  <Text style={form.subtitle}>Refunds reduce spending when received; they do not count as income.{transaction.occurrence_id?' This bill stays marked paid.':''}</Text>
  {isUuid(refundId)&&query.data&&!query.data.rows.some(r=>r.id===refundId)&&<Text style={form.subtitle}>This refund was removed. Showing the original expense.</Text>}
  {query.data&&<><Text style={form.subtitle}>Refunded: {money(query.data.refunded)} · Remaining: {money(query.data.amount-query.data.refunded)}</Text>{query.data.rows.map(r=>{const method=methods.methods?.find(m=>m.id===r.method_id);const destination=method?paymentMethodLabel(method):'Saved payment method';return <MotionPressable key={r.id} accessibilityLabel={'Edit refund '+money(decimalToCents(r.amount)!)+', received '+readableDate(r.refund_date)+', into '+destination+(r.note?', '+r.note:'')} disabled={busy} style={[form.secondaryButton,{marginTop:0}]} onPress={()=>setVisit({key:createRequestId(),refund:r})}><Text style={form.chipTextSelected}>{money(decimalToCents(r.amount)!)} · {readableDate(r.refund_date)}</Text><Text style={form.subtitle}>{destination}{r.note?' · '+r.note:''}</Text></MotionPressable>;})}</>}
  {!!query.data?.refunded&&<Text style={form.subtitle}>Remove refunds before deleting this expense or changing it to income.</Text>}
  {query.isError&&<><Text accessibilityRole="alert" style={form.error}>{query.error.message}</Text><MotionPressable style={form.secondaryButton} onPress={()=>void query.refetch()}><Text style={form.chipTextSelected}>Retry refunds</Text></MotionPressable></>}
  {query.data&&<MotionPressable accessibilityLabel="Refresh refunds" disabled={query.isFetching||busy} onPress={()=>void query.refetch()} style={{minHeight:44,justifyContent:'center',alignSelf:'flex-start'}}><Text style={form.chipTextSelected}>{query.isFetching?'Refreshing…':'Refresh refunds'}</Text></MotionPressable>}
  {methods.isError&&<MotionPressable style={form.secondaryButton} onPress={()=>void methods.refetch()}><Text style={form.chipTextSelected}>Could not check refunds. Retry payment methods</Text></MotionPressable>}
  {!methods.refundSupported&&!methods.isPending&&!methods.isError&&<Text style={form.subtitle}>Refunds are not available yet.</Text>}
  <MotionPressable accessibilityLabel={query.data&&query.data.refunded>=query.data.amount?'Fully refunded':'Record refund'} disabled={!query.data||query.isFetching||query.isError||methods.isError||methods.isFetching||query.data.refunded>=query.data.amount} style={[form.secondaryButton,{marginTop:0,flexDirection:'row',gap:8,justifyContent:'center'}]} onPress={()=>setVisit({key:createRequestId()})}><RotateCcw size={18} color={colors.primary}/><Text style={form.chipTextSelected}>{query.data&&query.data.refunded>=query.data.amount?'Fully refunded':'Record refund'}</Text></MotionPressable>
  <ActionSheet visible={!!visit} title={visit?.refund?'Edit refund':'Record refund'} onClose={()=>{if(!busy){setVisit(null);void query.refetch();}}} busy={busy}>{visit&&query.data&&<RefundForm key={visit.key} transaction={transaction} initial={visit.refund} refunded={query.data.refunded} purchase={query.data.amount} expenseCreatedAt={transaction.created_at??query.data.expenseCreatedAt} onBusy={setBusy} onSaved={()=>{setBusy(false);setVisit(null);}}/>}</ActionSheet>
 </View>;
}
function RefundForm({transaction,initial,refunded,purchase,expenseCreatedAt,onBusy,onSaved}:{transaction:Transaction;initial?:Refund;refunded:number;purchase:number;expenseCreatedAt:string;onBusy:(busy:boolean)=>void;onSaved:()=>void}) {
 const methods=usePaymentMethods(),save=useSaveRefund(),form=useFormStyles(),colors=useColors(),money=useMoneyCents();
 const timezone=usePreferencesStore(s=>s.profile?.timezone),owner=usePreferencesStore(s=>s.profile?.user_id);
 const [id]=useState(()=>initial?.id??createRequestId());
 const [amount,setAmount]=useState(initial?.amount??centsToDecimal(purchase-refunded)),[date,setDate]=useState(initial?.refund_date??localDateKey(new Date(),timezone));
 const [method,setMethod]=useState(initial?.method_id??(methods.methods?.find(m=>m.id===transaction.payment_method_id&&!m.archived)?.id??methods.methods?.find(m=>m.method==='cash')?.id??''));
 const [note,setNote]=useState(initial?.note??''),[error,setError]=useState(''),[remove,setRemove]=useState(false);
 const running=useRef(false),alive=useRef(true),pending=useRef<RefundInput|null>(null);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[onBusy]);
 const maximum=purchase-refunded+(initial?decimalToCents(initial.amount)!:0);
 async function submit(deleting=false) {
  if(running.current)return;
  const exactRetry=pending.current?.operation==='create'&&pending.current.methodId===method&&pending.current.date===date&&pending.current.note?.trim()===note.trim()&&refundCents(pending.current.amount??'')===refundCents(amount);
  if(!deleting){const cents=refundCents(amount);if(cents===null||!exactRetry&&cents>maximum){setError('Enter a positive refund no greater than '+money(maximum)+'.');return;}if(!exactRetry&&date!==initial?.refund_date&&(date<effectiveDate(transaction)||date>localDateKey(new Date(),timezone))){setError('Choose a received date from the purchase date through today.');return;}if(methods.isFetching||methods.isError||!methods.methods?.some(m=>m.id===method&&(!m.archived||m.id===initial?.method_id||exactRetry))){setError('Refresh payment methods and choose where the refund was received.');return;}}
  running.current=true;onBusy(true);setError('');
  const payload:RefundInput={id,expenseId:transaction.id,expenseCreatedAt,operation:deleting?'delete':initial?'update':'create',expectedVersion:initial?.version,...(deleting?{}:{amount,methodId:method,date,note})};pending.current=payload;
  try {await save.mutateAsync(payload);if(alive.current&&usePreferencesStore.getState().profile?.user_id===owner)onSaved();}
  catch(issue){if(alive.current)setError(issue instanceof Error?issue.message:'Could not confirm the refund. Keep this draft and retry.');}
  finally{running.current=false;if(alive.current)onBusy(false);}
 }
 if(remove)return <View><Text style={form.subtitle}>Remove this {money(decimalToCents(initial!.amount)!)} refund? Spending and the credited balance will be recalculated. The original purchase and bill payment stay.</Text>{error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}<MotionPressable accessibilityLabel="Confirm removing refund" style={[form.button,{flexDirection:'row',gap:8}]} disabled={save.isPending} onPress={()=>void submit(true)}><Trash2 size={18} color={colors.onPrimary}/><Text style={form.buttonText}>Remove refund</Text></MotionPressable><MotionPressable style={form.secondaryButton} disabled={save.isPending} onPress={()=>setRemove(false)}><Text style={form.chipTextSelected}>Keep refund</Text></MotionPressable></View>;
 return <View>
  <View style={{gap:6,marginBottom:12}}>
   <Text style={form.label}>Original purchase</Text>
   <Text style={form.subtitle}>{transaction.note?.trim()||'Expense'} · {readableDate(effectiveDate(transaction))}</Text>
   <Text style={form.subtitle}>Purchase: {money(purchase)} · Refunded: {money(refunded)}</Text>
   <Text style={form.subtitle}>Remaining refundable: {money(purchase-refunded)}</Text>
  </View>
  <Text style={form.subtitle}>Record money you have already received back. Maximum: {money(maximum)}.</Text>
  <Text style={form.label}>Refund amount</Text><MoneyInput accessibilityLabel="Refund amount" value={amount} onChangeText={value=>{setAmount(value);setError('');}} style={form.input} editable={!save.isPending}/>
  <TransactionDateField label="Received date" accessibilityLabel="Refund received date" value={date} onChange={setDate}/>
  <RefundDestination label="Received into" methods={methods.methods??[]} value={method} onChange={setMethod} disabled={save.isPending||methods.isFetching||methods.isError}/>
  {methods.isError&&<MotionPressable style={form.secondaryButton} onPress={()=>void methods.refetch()}><Text style={form.chipTextSelected}>Retry payment methods</Text></MotionPressable>}
  <Text style={form.label}>Note (optional)</Text><TextInput accessibilityLabel="Refund note" value={note} onChangeText={setNote} style={form.input} maxLength={500} editable={!save.isPending}/>
  {error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
  <MotionPressable style={[form.button,{flexDirection:'row',gap:8}]} disabled={save.isPending||methods.isFetching||methods.isError} onPress={()=>void submit()}><Check size={18} color={colors.onPrimary}/><Text style={form.buttonText}>{save.isPending?'Saving…':initial?'Save refund':'Record refund'}</Text></MotionPressable>
  {initial&&<MotionPressable style={[form.secondaryButton,{flexDirection:'row',gap:8}]} disabled={save.isPending} onPress={()=>setRemove(true)}><Trash2 size={18} color={colors.danger}/><Text style={form.secondaryText}>Remove refund</Text></MotionPressable>}
 </View>;
}

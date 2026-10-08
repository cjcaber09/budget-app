import {useEffect,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {TransactionDateField} from './TransactionDateField';
import {createRequestId} from '../domain/ocr';
import {localDateKey} from '../domain/transactionDates';
import {decimalToCents,MAX_MONEY_CENTS,isCalendarDate} from '../../supabase/functions/ocr/shared';
import {isCreditCard,paymentMethodLabel,type PaymentMethod,type PaymentTransfer} from '../domain/paymentMethods';
import {useCorrectMethodBalance,useSavePaymentTransfer} from '../hooks/usePaymentMethods';
import {formatMoney} from '../domain/money';
export function MethodChoices({label,methods,value,onChange,disabled=false,excluded}:{label:string;methods:PaymentMethod[];value:string;onChange:(id:string)=>void;disabled?:boolean;excluded?:string}) {
  const form=useFormStyles();return <View><Text style={form.label}>{label}</Text><View style={form.optionRow}>{methods.filter(m=>!m.archived||m.id===value).map(m=><MotionPressable key={m.id} accessibilityState={{selected:m.id===value}} disabled={disabled||m.id===excluded} style={[form.chip,m.id===value&&form.chipSelected]} onPress={()=>onChange(m.id)}><Text style={m.id===value?form.chipTextSelected:form.chipText}>{m.method==='cash'?'Cash':paymentMethodLabel(m)}{m.archived?' · Archived':''}</Text></MotionPressable>)}</View></View>;
}
export function TransferForm({methods,initial,onClose,onBusyChange}:{methods:PaymentMethod[];initial?:PaymentTransfer;onClose:()=>void;onBusyChange?:(busy:boolean)=>void}) {
  const form=useFormStyles();const colors=useColors();const save=useSavePaymentTransfer();
  useEffect(()=>{onBusyChange?.(save.isPending);},[save.isPending,onBusyChange]);
  const [id]=useState(()=>initial?.id??createRequestId());const [source,setSource]=useState(initial?.source_id??methods.find(m=>m.method==='cash')?.id??'');const [destination,setDestination]=useState(initial?.destination_id??'');
  const [amount,setAmount]=useState(initial?.amount??'');const [date,setDate]=useState(initial?.transfer_date??localDateKey(new Date()));const [note,setNote]=useState(initial?.note??'');const [error,setError]=useState('');const [deleting,setDeleting]=useState(false);
  const submit=()=>{const cents=/^\d+(?:\.\d{0,2})?$/.test(amount)?decimalToCents(amount):null;if(!source||!destination||source===destination||cents===null||cents<=0||cents>MAX_MONEY_CENTS||!isCalendarDate(date)){setError('Choose two different methods, a valid date and a positive amount.');return;}setError('');save.mutate({id,operation:initial?'update':'create',sourceId:source,destinationId:destination,amount,date,note:note.trim()||null},{onSuccess:onClose});};
  if(deleting)return <View><Text style={form.label}>Delete this recorded transfer?</Text><Text style={form.subtitle}>Both tracked balances will be recalculated. Budget totals stay unchanged.</Text>{save.error&&<Text style={form.error}>{save.error.message}</Text>}<MotionPressable style={form.button} disabled={save.isPending} onPress={()=>save.mutate({id,operation:'delete'},{onSuccess:onClose})}><Text style={form.buttonText}>Confirm delete transfer</Text></MotionPressable><MotionPressable style={form.secondaryButton} disabled={save.isPending} onPress={()=>setDeleting(false)}><Text style={form.chipTextSelected}>Keep transfer</Text></MotionPressable></View>;
  return <View><Text style={form.subtitle}>Record money moving between your methods. It changes tracked balances without adding budget income or expenses. Credit-card payments belong here.</Text>
    <MethodChoices label="From" methods={methods} value={source} excluded={destination} disabled={save.isPending} onChange={setSource}/><MethodChoices label="To" methods={methods} value={destination} excluded={source} disabled={save.isPending} onChange={setDestination}/>
    <Text style={form.label}>Transfer amount</Text><TextInput accessibilityLabel="Transfer amount" editable={!save.isPending} keyboardType="decimal-pad" style={form.input} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.subtle}/>
    <TransactionDateField label="Transfer date" accessibilityLabel="Transfer date" value={date} onChange={day=>{if(!save.isPending)setDate(day);}} hint="Future transfers change balances on their financial date."/>
    <Text style={form.label}>Note (optional)</Text><TextInput accessibilityLabel="Transfer note" style={form.input} editable={!save.isPending} maxLength={200} value={note} onChangeText={setNote}/>
    {!!(error||save.error)&&<Text accessibilityRole="alert" style={form.error}>{error||save.error?.message}</Text>}
    <MotionPressable style={form.button} disabled={save.isPending} onPress={submit}><Text style={form.buttonText}>{save.isPending?'Saving…':initial?'Save transfer changes':'Record transfer'}</Text></MotionPressable>
    <MotionPressable style={form.secondaryButton} disabled={save.isPending} onPress={onClose}><Text style={form.chipTextSelected}>Cancel</Text></MotionPressable>
    {initial&&<MotionPressable style={form.secondaryButton} disabled={save.isPending} onPress={()=>setDeleting(true)}><Text style={form.secondaryText}>Delete transfer</Text></MotionPressable>}
  </View>;
}
export function BalanceCorrectionForm({method,onClose,refresh,loading,unavailable=false,onBusyChange}:{method:PaymentMethod;onClose:()=>void;refresh:()=>void;loading:boolean;unavailable?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const form=useFormStyles();const colors=useColors();const correct=useCorrectMethodBalance();const [id]=useState(createRequestId);const [amount,setAmount]=useState('');const [note,setNote]=useState('');const [creditBalance,setCreditBalance]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{onBusyChange?.(correct.isPending);},[correct.isPending,onBusyChange]);
  const credit=isCreditCard(method);const current=decimalToCents(method.balance??'');
  const submit=()=>{const target=/^-?\d+(?:\.\d{0,2})?$/.test(amount)?decimalToCents(amount):null;if(method.balance===null||target===null||Math.abs(target)>MAX_MONEY_CENTS||(credit&&target<0)){setError('Enter a valid target balance. Credit-card amounts must be zero or positive.');return;}setError('');correct.mutate({id,methodId:method.id,targetBalance:amount,expectedBalance:method.balance,note:note.trim()||null,creditBalance},{onSuccess:onClose});};
  return <View><Text style={form.subtitle}>This records a balance correction without creating budget income or expenses. Your original initial balance remains unchanged.</Text>
    {unavailable&&<Text accessibilityRole="alert" style={form.error}>Balances could not refresh. Choose Refresh balances to retry; your correction draft is still here.</Text>}
    <Text style={form.label}>Current tracked balance</Text><Text style={form.subtitle}>{current===null?'Not available':credit?current>0?`Credit balance: ${formatMoney(current/100)}`:`Amount owed: ${formatMoney(-current/100)}`:formatMoney(current/100)}</Text>
    {credit&&<View style={form.optionRow}>{[['Amount owed',false],['Credit balance',true]].map(([label,value])=><MotionPressable key={String(label)} style={[form.chip,creditBalance===value&&form.chipSelected]} disabled={correct.isPending} onPress={()=>setCreditBalance(value as boolean)}><Text style={creditBalance===value?form.chipTextSelected:form.chipText}>{label}</Text></MotionPressable>)}</View>}
    <Text style={form.label}>{credit?(creditBalance?'New credit balance':'New amount owed'):'New current balance'}</Text><TextInput accessibilityLabel="Target balance" style={form.input} editable={!correct.isPending} keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.subtle}/>
    <Text style={form.label}>Correction note (optional)</Text><TextInput accessibilityLabel="Correction note" editable={!correct.isPending} style={form.input} maxLength={200} value={note} onChangeText={setNote}/>
    {!!(error||correct.error)&&<Text accessibilityRole="alert" style={form.error}>{error||correct.error?.message}</Text>}
    <MotionPressable style={form.button} disabled={correct.isPending||loading||unavailable} onPress={submit}><Text style={form.buttonText}>{correct.isPending?'Saving…':'Confirm balance correction'}</Text></MotionPressable>
    <MotionPressable style={form.secondaryButton} disabled={correct.isPending||loading} onPress={refresh}><Text style={form.chipTextSelected}>{loading?'Refreshing…':'Refresh balances'}</Text></MotionPressable>
    <MotionPressable style={form.secondaryButton} disabled={correct.isPending} onPress={onClose}><Text style={form.chipTextSelected}>Cancel</Text></MotionPressable>
  </View>;
}

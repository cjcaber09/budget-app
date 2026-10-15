import {TransferEntryForm} from './TransferEntryForm';
import {useTransferEntry} from '../hooks/useTransferEntry';
import {QueryState} from './QueryState';
import { MoneyInput } from './MoneyInput';
import {useEffect,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {createRequestId} from '../domain/ocr';
import {decimalToCents,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';
import {isCreditCard,paymentMethodLabel,type PaymentMethod,type PaymentTransfer} from '../domain/paymentMethods';
import {useCorrectMethodBalance} from '../hooks/usePaymentMethods';
import {useMoney} from '../domain/money';
export function MethodChoices({label,methods,value,onChange,disabled=false,excluded}:{label:string;methods:PaymentMethod[];value:string;onChange:(id:string)=>void;disabled?:boolean;excluded?:string}) {
  const form=useFormStyles();return <View><Text style={form.label}>{label}</Text><View style={form.optionRow}>{methods.filter(m=>!m.archived||m.id===value).map(m=><MotionPressable key={m.id} accessibilityState={{selected:m.id===value}} disabled={disabled||m.id===excluded} style={[form.chip,m.id===value&&form.chipSelected]} onPress={()=>onChange(m.id)}><Text style={m.id===value?form.chipTextSelected:form.chipText}>{m.method==='cash'?'Cash':paymentMethodLabel(m)}{m.archived?' · Archived':''}</Text></MotionPressable>)}</View></View>;
}
export function TransferForm({methods,initial,sourceId,onClose,onBusyChange,onSaved}:{methods:PaymentMethod[];initial?:PaymentTransfer;sourceId?:string;onClose:()=>void;onBusyChange?:(busy:boolean)=>void;feeSupported?:boolean;onSaved?:()=>void}) {
 if(initial)return <CurrentTransferForm methods={methods} initial={initial} onClose={onClose} onBusyChange={onBusyChange} onSaved={onSaved}/>;
 return <TransferEntryForm methods={methods} initial={initial} initialFields={sourceId?{sourceId}:undefined} onClose={onClose} onBusyChange={onBusyChange} onSaved={onSaved}/>;
}
function CurrentTransferForm({initial,...props}:{initial:PaymentTransfer;methods:PaymentMethod[];onClose:()=>void;onBusyChange?:(busy:boolean)=>void;onSaved?:()=>void}){
 const query=useTransferEntry(initial.id),form=useFormStyles();
 const [snapshot,setSnapshot]=useState<PaymentTransfer|null>(null);
 if(!snapshot&&query.isSuccess&&!query.isFetching&&query.data.transfer)setSnapshot(query.data.transfer);
 return snapshot?<TransferEntryForm initial={snapshot} {...props}/>:<QueryState loading={query.isPending||query.isFetching} error={query.isError} retry={()=>void query.refetch()}>{query.isSuccess&&<Text style={form.subtitle}>This transfer is no longer available.</Text>}</QueryState>;
}
export function BalanceCorrectionForm({method,onClose,refresh,loading,unavailable=false,onBusyChange}:{method:PaymentMethod;onClose:()=>void;refresh:()=>void;loading:boolean;unavailable?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const money=useMoney();const form=useFormStyles();const colors=useColors();const correct=useCorrectMethodBalance();const [id]=useState(createRequestId);const [amount,setAmount]=useState('');const [note,setNote]=useState('');const [creditBalance,setCreditBalance]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{onBusyChange?.(correct.isPending);},[correct.isPending,onBusyChange]);
  const credit=isCreditCard(method);const current=decimalToCents(method.balance??'');
  const submit=()=>{const target=/^-?\d+(?:\.\d{0,2})?$/.test(amount)?decimalToCents(amount):null;if(method.balance===null||target===null||Math.abs(target)>MAX_MONEY_CENTS||(credit&&target<0)){setError('Enter a valid target balance. Credit-card amounts must be zero or positive.');return;}setError('');correct.mutate({id,methodId:method.id,targetBalance:amount,expectedBalance:method.balance,note:note.trim()||null,creditBalance},{onSuccess:onClose});};
  return <View><Text style={form.subtitle}>This records a balance correction without creating budget income or expenses. Your original initial balance remains unchanged.</Text>
    {unavailable&&<Text accessibilityRole="alert" style={form.error}>Balances could not refresh. Choose Refresh balances to retry; your correction draft is still here.</Text>}
    <Text style={form.label}>Current tracked balance</Text><Text style={form.subtitle}>{current===null?'Not available':credit?current>0?`Credit balance: ${money(current/100)}`:`Amount owed: ${money(-current/100)}`:money(current/100)}</Text>
    {credit&&<View style={form.optionRow}>{[['Amount owed',false],['Credit balance',true]].map(([label,value])=><MotionPressable key={String(label)} style={[form.chip,creditBalance===value&&form.chipSelected]} disabled={correct.isPending} onPress={()=>setCreditBalance(value as boolean)}><Text style={creditBalance===value?form.chipTextSelected:form.chipText}>{label}</Text></MotionPressable>)}</View>}
    <Text style={form.label}>{credit?(creditBalance?'New credit balance':'New amount owed'):'New current balance'}</Text><MoneyInput accessibilityLabel="Target balance" style={form.input} editable={!correct.isPending} keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.subtle}/>
    <Text style={form.label}>Correction note (optional)</Text><TextInput accessibilityLabel="Correction note" editable={!correct.isPending} style={form.input} maxLength={200} value={note} onChangeText={setNote}/>
    {!!(error||correct.error)&&<Text accessibilityRole="alert" style={form.error}>{error||correct.error?.message}</Text>}
    <MotionPressable style={form.button} disabled={correct.isPending||loading||unavailable} onPress={submit}><Text style={form.buttonText}>{correct.isPending?'Saving…':'Confirm balance correction'}</Text></MotionPressable>
    <MotionPressable style={form.secondaryButton} disabled={correct.isPending||loading} onPress={refresh}><Text style={form.chipTextSelected}>{loading?'Refreshing…':'Refresh balances'}</Text></MotionPressable>
    <MotionPressable style={form.secondaryButton} disabled={correct.isPending} onPress={onClose}><Text style={form.chipTextSelected}>Cancel</Text></MotionPressable>
  </View>;
}

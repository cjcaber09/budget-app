import {useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {createRequestId} from '../domain/ocr';
import {CARD_PRIVACY_NOTE,validatePaymentMethod,isCreditCard,type PaymentMethod,type PaymentMethodKind,type PaymentMethodValues} from '../domain/paymentMethods';
const KINDS:[PaymentMethodKind,string][]=[['card','Card'],['bank_account','Bank account'],['wallet','E-wallet'],['other','Other']];
const DEFAULT_TYPES={cash:'Cash',card:'Debit card',bank_account:'Bank account',wallet:'E-wallet',other:'Other'};
export function PaymentMethodForm({initial,submitting,error:onSaveError,onSave,onCancel}:{initial?:PaymentMethod;submitting:boolean;error?:string;onSave:(value:PaymentMethodValues)=>void;onCancel:()=>void}) {
  const form=useFormStyles();const colors=useColors();
  const [value,setValue]=useState<PaymentMethodValues>(()=>({id:initial?.id??createRequestId(),method:initial?.method??'card',paymentType:initial?.payment_type??'Debit card',name:initial?.name??'',lastFour:initial?.last_four??'',openingBalance:initial?.opening_balance==null?'':isCreditCard(initial)?String(Math.abs(Number(initial.opening_balance))):String(initial.opening_balance)}));
  const [error,setError]=useState('');const [confirmation,setConfirmation]=useState<PaymentMethodValues|null>(null);
  const credit=value.method==='card'&&value.paymentType==='Credit card';
  const patch=(next:Partial<PaymentMethodValues>)=>setValue(v=>({...v,...next}));
  const submit=()=>{if(submitting)return;const issue=validatePaymentMethod(value);if(issue){setError(issue);return;}setError('');if(initial?.opening_balance!==null&&initial?.has_activity&&Number(value.openingBalance)!==(isCreditCard(initial)?Math.abs(Number(initial.opening_balance)):Number(initial.opening_balance))){setConfirmation({...value,confirmOpening:true});return;}onSave(value);};
  if(confirmation)return <View><Text style={form.label}>Change the initial balance?</Text><Text style={form.subtitle}>This will recalculate the current balance from the original baseline. Transactions and budget totals will stay unchanged. Use a balance correction for later reconciliation.</Text>{onSaveError&&<Text accessibilityRole="alert" style={form.error}>{onSaveError}</Text>}<MotionPressable style={form.button} disabled={submitting} onPress={()=>onSave(confirmation)}><Text style={form.buttonText}>Confirm initial balance change</Text></MotionPressable><MotionPressable style={form.secondaryButton} disabled={submitting} onPress={()=>setConfirmation(null)}><Text style={form.chipTextSelected}>Back to editing</Text></MotionPressable></View>;
  return <View>
    <Text style={form.label}>Payment method</Text>
    {initial?<Text style={form.subtitle}>{DEFAULT_TYPES[value.method]}</Text>:<View style={form.optionRow}>{KINDS.map(([kind,label])=><MotionPressable key={kind} accessibilityState={{selected:value.method===kind}} disabled={submitting} style={[form.chip,value.method===kind&&form.chipSelected]} onPress={()=>patch({method:kind,paymentType:DEFAULT_TYPES[kind],lastFour:''})}><Text style={value.method===kind?form.chipTextSelected:form.chipText}>{label}</Text></MotionPressable>)}</View>}
    <Text style={form.label}>Payment type</Text><TextInput accessibilityLabel="Payment type" style={form.input} editable={!submitting&&value.method!=='cash'&&value.method!=='card'} maxLength={80} value={value.paymentType} onChangeText={paymentType=>patch({paymentType})} placeholder="Debit card" placeholderTextColor={colors.subtle}/>
    {value.method==='card'&&<View style={[form.optionRow,{marginTop:12}]}>{['Debit card','Credit card','Prepaid card'].map(label=><MotionPressable key={label} style={[form.chip,value.paymentType===label&&form.chipSelected]} disabled={submitting||!!initial} onPress={()=>patch({paymentType:label})}><Text style={value.paymentType===label?form.chipTextSelected:form.chipText}>{label}</Text></MotionPressable>)}</View>}
    <Text style={form.label}>Name / bank</Text><TextInput accessibilityLabel="Payment method name" style={form.input} editable={!submitting&&value.method!=='cash'} maxLength={100} value={value.name} onChangeText={name=>patch({name})} placeholder="Metrobank" placeholderTextColor={colors.subtle}/>
    {value.method==='card'&&<View><Text style={form.label}>Last four digits (optional)</Text><TextInput accessibilityLabel="Last four card digits" style={form.input} editable={!submitting} keyboardType="number-pad" maxLength={19} value={value.lastFour} onChangeText={lastFour=>patch({lastFour})} placeholder="8035" placeholderTextColor={colors.subtle}/><Text style={[form.subtitle,{marginTop:8}]}>{CARD_PRIVACY_NOTE}</Text></View>}
    <Text style={form.label}>{credit?'Initial amount owed (required)':'Initial balance (required)'}</Text><TextInput accessibilityLabel="Initial balance" style={form.input} editable={!submitting} keyboardType="numbers-and-punctuation" value={value.openingBalance} onChangeText={openingBalance=>patch({openingBalance})} placeholder="40300.50" placeholderTextColor={colors.subtle}/>
    <Text style={[form.subtitle,{marginTop:8}]}>The initial amount is saved first. Transactions recorded or reassigned afterward update the current balance. Future-dated transactions apply on their date.</Text>
    {credit&&<Text style={form.subtitle}>Spending increases the amount owed. Payments reduce it. An overpayment is shown as a credit balance, not available credit.</Text>}
    {!!(error||onSaveError)&&<Text accessibilityRole="alert" style={form.error}>{error||onSaveError}</Text>}
    <MotionPressable style={form.button} disabled={submitting} onPress={submit}><Text style={form.buttonText}>{submitting?'Saving…':initial?'Save payment method':'Create payment method'}</Text></MotionPressable>
    <MotionPressable style={form.secondaryButton} disabled={submitting} onPress={onCancel}><Text style={form.chipTextSelected}>Cancel</Text></MotionPressable>
  </View>;
}

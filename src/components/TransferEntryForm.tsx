import {useEffect,useRef,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {usePaymentMethods,useSavePaymentMethod} from '../hooks/usePaymentMethods';
import {useTransferCommand,transferStatus} from '../hooks/useTransferEntry';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {useMoneyCents} from '../domain/money';
import {createRequestId} from '../domain/ocr';
import {localDateKey} from '../domain/transactionDates';
import {paymentMethodLabel,type PaymentMethod,type PaymentTransfer} from '../domain/paymentMethods';
import {transferAmounts,transferEnteredAmount} from '../domain/transferFees';
import type {TransferCommand,TransferFields} from '../domain/transferEntry';
import type {TransferDraft} from '../domain/transferDraft';
import {loadTransactionDraft,saveTransactionDraft,clearTransactionDraft,transactionDraftGeneration} from '../lib/transactionDraftStorage';
import {centsToDecimal,isCalendarDate} from '../../supabase/functions/ocr/shared';
import {MotionPressable} from './MotionPressable';
import {MoneyInput} from './MoneyInput';
import {TransactionDateField} from './TransactionDateField';
import {PaymentMethodForm} from './PaymentMethodForm';
import {useProofDraft,ProofPicker,AttachmentRetry,SavedAttachments} from './TransactionAttachments';

interface Props {defaultCash?:boolean;entryContext?:{startedAt:string;day:string;timezone:string;currency:string};id?:string;initial?:PaymentTransfer;initialFields?:Partial<TransferFields>;restored?:TransferDraft;methods:PaymentMethod[];active?:boolean;persist?:boolean;proof?:ReturnType<typeof useProofDraft>;onClose:()=>void;onSaved?:()=>void;onBusyChange?:(busy:boolean)=>void;onUncertainChange?:(busy:boolean)=>void}
export function TransferEntryForm({id:entryId,initial,initialFields,restored,methods:initialMethods,defaultCash=false,active=true,persist=false,proof:externalProof,entryContext,onClose,onSaved,onBusyChange,onUncertainChange}:Props){
 const profile=usePreferencesStore(s=>s.profile),[owner]=useState(()=>profile?.user_id),form=useFormStyles(),colors=useColors(),money=useMoneyCents();
 const query=usePaymentMethods(),save=useTransferCommand(),create=useSavePaymentMethod(),localProof=useProofDraft(),proof=externalProof??localProof;
 const methods=query.methods??initialMethods;
 const [id]=useState(()=>initial?.id??restored?.id??entryId??createRequestId());
 const [context]=useState(()=>({startedAt:restored?.startedAt??entryContext?.startedAt??new Date().toISOString(),day:restored?.day??entryContext?.day??localDateKey(new Date(),profile?.timezone),timezone:restored?.timezone??entryContext?.timezone??profile?.timezone??'UTC',currency:restored?.currency??entryContext?.currency??profile?.currency??'USD'}));
 const [generation]=useState(()=>owner?transactionDraftGeneration(owner):0);
 const [fields,setFields]=useState<TransferFields>(()=>restored?.fields??{sourceId:initial?.source_id??'',destinationId:initial?.destination_id??'',amount:initial?transferEnteredAmount(initial.amount,initial.fee_amount,initial.fee_mode):'',fee:initial?.fee_amount??'',feeMode:initial?.fee_mode??'added',date:initial?.transfer_date??context.day,note:initial?.note??'',reviewRequired:false,...initialFields});
 const [pending,setPending]=useState<TransferCommand|null>(restored?.pending??null),[error,setError]=useState(''),[preparing,setPreparing]=useState(false),[deleting,setDeleting]=useState(false),[financialSaved,setFinancialSaved]=useState(false);
 const [chooser,setChooser]=useState<'sourceId'|'destinationId'|null>(null),[search,setSearch]=useState(''),[creating,setCreating]=useState(false);
 const [current,setCurrent]=useState<PaymentTransfer|null>(null);
 const [version,setVersion]=useState(initial?.version);
 const [recoveryStarted,setRecoveryStarted]=useState(persist||!!restored);
 const [cashApplied,setCashApplied]=useState(!!initial||!!restored||!!initialFields?.destinationId);
 const cash=methods.find(m=>m.method==='cash');
 if(defaultCash&&!cashApplied&&cash){if(!fields.destinationId)setFields({...fields,destinationId:cash.id});setCashApplied(true);}
 const alive=useRef(true),running=useRef(false),lastDraft=useRef('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const busy=preparing||save.isPending||proof.busy||create.isPending,locked=busy||!!pending||financialSaved;
 useEffect(()=>{onBusyChange?.(busy||!!pending);onUncertainChange?.(busy||!!pending||financialSaved);},[busy,pending,financialSaved,onBusyChange,onUncertainChange]);
 useEffect(()=>()=>{onBusyChange?.(false);onUncertainChange?.(false);},[onBusyChange,onUncertainChange]);
 const totals=transferAmounts(fields.amount,fields.fee,fields.feeMode);
 const validOwner=()=>!!owner&&usePreferencesStore.getState().profile?.user_id===owner;
 const draft=(p?:TransferCommand):TransferDraft=>({version:2,kind:'transfer',owner:owner!,id,updatedAt:new Date().toISOString(),...context,fields,...(p?{pending:p}:{})});
 useEffect(()=>{
  if(!active||!recoveryStarted||locked||!owner)return;
  const signature=JSON.stringify(fields);if(signature===lastDraft.current)return;lastDraft.current=signature;
  void saveTransactionDraft(draft(),generation).catch(()=>{if(alive.current)setError('Could not save the draft on this device. Keep this screen open and retry.');});
 // Draft writes are owner/generation guarded; avoid depending on changing function identities.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[active,recoveryStarted,locked,fields,owner,generation]);
 function change<K extends keyof TransferFields>(key:K,value:TransferFields[K]){if(!locked)setFields(f=>({...f,[key]:value}));}
 async function finish(state:'saved'|'removed'){
  setFinancialSaved(true);if(!validOwner())return;
  try{if(recoveryStarted||!initial)await clearTransactionDraft(owner!,id);if(!alive.current||!validOwner())return;
   if(state==='saved'&&!await proof.upload(id,'transfer'))return;
   if(alive.current&&validOwner()){onSaved?.();onClose();}
  }catch{if(alive.current)setError('Transfer saved. Retry finishing to clear the local draft.');}
 }
 async function send(command:TransferCommand){
  if(running.current||!validOwner())return;running.current=true;setPreparing(true);setError('');
  try{
   if(!initial){
    const existing=await loadTransactionDraft(owner!);
    if(existing&&existing.id!==id)throw new Error('Another unfinished entry is saved. Resume or discard it in Add Transaction first.');
    await saveTransactionDraft(draft(command),generation);if(alive.current)setRecoveryStarted(true);
   }
   if(!alive.current||!validOwner())return;setPending(command);const result=await save.mutateAsync(command);if(alive.current&&validOwner())await finish(result.state);
  }
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not preserve this request. Nothing new was sent.');}
  finally{running.current=false;if(alive.current)setPreparing(false);}
 }
 function submit(operation:'create'|'update'|'delete'){
  if(locked)return;
  if(operation!=='delete'&&(!totals||!fields.sourceId||!fields.destinationId||fields.sourceId===fields.destinationId||!isCalendarDate(fields.date)||fields.reviewRequired)){setError('Choose two different accounts and review the amount, fee and date.');return;}
  const command:TransferCommand={id,requestId:operation==='create'?id:createRequestId(),operation,...(initial?{expectedVersion:version}:{}),...(operation==='delete'?{}:{sourceId:fields.sourceId,destinationId:fields.destinationId,amount:centsToDecimal(totals!.received),feeAmount:centsToDecimal(totals!.fee),feeMode:totals!.fee===0?'added':fields.feeMode,date:fields.date,note:fields.note.trim()||null})};
  void send(command);
 }
 async function check(){
  if(running.current||!validOwner())return;running.current=true;setPreparing(true);
  try{const status=await transferStatus(id,owner!,pending?.requestId);if(!alive.current||!validOwner())return;
   if(status.state==='removed')await finish('removed');
   else if(status.state==='saved'&&(!initial||status.requestCommitted))await finish('saved');
   else if(status.state==='saved'){setCurrent(status.transfer);setError('This command was not confirmed. Review the saved transfer below before replacing your draft.');}
   else {if(recoveryStarted||!initial)await saveTransactionDraft(draft(),generation);setPending(null);setError('No saved transfer found. Review your draft before saving.');}
  }catch{if(alive.current)setError('Could not confirm whether it saved. Retry the same request or check again.');}
  finally{running.current=false;if(alive.current)setPreparing(false);}
 }
 if(financialSaved&&proof.savedId)return <AttachmentRetry draft={proof} onDone={onClose}/>;
 const selected=chooser?methods.find(m=>m.id===fields[chooser]):null;
 const other=chooser==='sourceId'?fields.destinationId:fields.sourceId;
 const choices=methods.filter(m=>(!m.archived||m.id===selected?.id)&&m.id!==other&&paymentMethodLabel(m).toLowerCase().includes(search.trim().toLowerCase()));
 return <View style={{gap:12}}>
  {restored&&<Text style={form.subtitle}>Recovered transfer · {context.currency} · {fields.date}. Review accounts and amounts before saving.</Text>}
  <Text style={form.subtitle}>Move money between your accounts. Only fees count as spending.</Text>
  {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
  {query.isError&&<MotionPressable onPress={()=>void query.refetch()} style={form.secondaryButton}><Text style={form.chipTextSelected}>Retry payment methods</Text></MotionPressable>}
  {query.isPending&&<Text style={form.subtitle}>Loading accounts…</Text>}
  {!query.transferEntrySupported&&!query.isPending&&!query.isError&&<Text style={form.error}>Refresh after the server update to enable transfers.</Text>}
  {pending&&!financialSaved&&<View style={{gap:12}}><Text style={form.subtitle}>Save request retained. Your fields are locked until the outcome is confirmed.</Text><MotionPressable disabled={busy} style={form.button} onPress={()=>void send(pending)}><Text style={form.buttonText}>Retry same save</Text></MotionPressable><MotionPressable disabled={busy} style={form.secondaryButton} onPress={()=>void check()}><Text style={form.chipTextSelected}>Check whether it saved</Text></MotionPressable></View>}
  {current&&<View><Text style={form.subtitle}>Saved: {current.transfer_date} · {money(Math.round(Number(current.amount)*100))} received · {current.note??''}</Text><MotionPressable disabled={busy} style={form.secondaryButton} onPress={()=>{setFields({sourceId:current.source_id,destinationId:current.destination_id,amount:transferEnteredAmount(current.amount,current.fee_amount,current.fee_mode),fee:current.fee_amount??'',feeMode:current.fee_mode??'added',date:current.transfer_date,note:current.note??'',reviewRequired:false});setVersion(current.version);setCurrent(null);setPending(null);setError('Saved values loaded. Review before saving.');}}><Text style={form.chipTextSelected}>Use saved values</Text></MotionPressable></View>}
  {(['sourceId','destinationId'] as const).map((key)=><View key={key}><Text style={form.label}>{key==='sourceId'?'From account':'To account'}</Text><MotionPressable accessibilityLabel={key==='sourceId'?'Choose from account':'Choose to account'} disabled={locked} style={form.chip} onPress={()=>{setChooser(chooser===key?null:key);setSearch('');setCreating(false);}}><Text style={form.chipText}>{methods.find(m=>m.id===fields[key])?paymentMethodLabel(methods.find(m=>m.id===fields[key])!):fields[key]?'Saved account':'Choose an account'}</Text></MotionPressable></View>)}
  {chooser&&<View style={{gap:8}}>{creating?<PaymentMethodForm submitting={create.isPending} error={create.error?.message} onCancel={()=>setCreating(false)} onSave={values=>create.mutate({...values,operation:'create'},{onSuccess:method=>{if(validOwner()){change(chooser,method.id);setCreating(false);setChooser(null);}}})}/>:<><TextInput accessibilityLabel="Search transfer accounts" style={form.input} value={search} onChangeText={setSearch} placeholder="Search accounts" placeholderTextColor={colors.subtle}/>{choices.map(m=><MotionPressable key={m.id} disabled={locked||m.archived&&m.id!==fields[chooser]} style={form.chip} onPress={()=>{change(chooser,m.id);setChooser(null);}}><Text style={form.chipText}>{paymentMethodLabel(m)}{m.archived?' · Archived':''}</Text></MotionPressable>)}{choices.length===0&&<Text style={form.subtitle}>No matching accounts.</Text>}<MotionPressable disabled={locked} style={form.secondaryButton} onPress={()=>setCreating(true)}><Text style={form.chipTextSelected}>Add payment method</Text></MotionPressable></>}</View>}
  {fields.reviewRequired&&<View><Text style={form.error}>The scan amounts or completion status need review. Clear them before entering this transfer manually.</Text><MotionPressable disabled={locked} style={form.secondaryButton} onPress={()=>setFields(f=>({...f,amount:'',fee:'',reviewRequired:false}))}><Text style={form.chipTextSelected}>Clear scan amounts and enter manually</Text></MotionPressable></View>}
  <Text style={form.label}>Transfer amount</Text><MoneyInput accessibilityLabel="Transfer amount" style={form.input} editable={!locked} value={fields.amount} onChangeText={v=>change('amount',v)} keyboardType="decimal-pad" placeholder="0.00"/>
  <Text style={form.label}>Fee (optional)</Text><MoneyInput accessibilityLabel="Transfer fee" style={form.input} editable={!locked} value={fields.fee} onChangeText={v=>change('fee',v)} keyboardType="decimal-pad" placeholder="0.00"/>
  <View style={form.optionRow}>{(['added','deducted'] as const).map(mode=><MotionPressable key={mode} disabled={locked} accessibilityState={{selected:fields.feeMode===mode}} style={[form.chip,fields.feeMode===mode&&form.chipSelected]} onPress={()=>change('feeMode',mode)}><Text style={fields.feeMode===mode?form.chipTextSelected:form.chipText}>{mode==='added'?'Added on top':'Deducted from amount'}</Text></MotionPressable>)}</View>
  {totals&&<View><Text style={form.subtitle}>Total deducted: {money(totals.deducted)}</Text><Text style={form.subtitle}>Amount received: {money(totals.received)}</Text></View>}
  <TransactionDateField label="Transfer date" accessibilityLabel="Transfer date" value={fields.date} onChange={v=>change('date',v)} hint="Future transfers change balances on their financial date."/>
  <Text style={form.label}>Note (optional)</Text><TextInput accessibilityLabel="Transfer note" style={form.input} editable={!locked} maxLength={200} value={fields.note} onChangeText={v=>change('note',v)}/>
  <ProofPicker draft={proof} disabled={locked}/>{persist&&<Text style={form.subtitle}>Draft fields stay on this device. Reattach files after restarting.</Text>}
  {initial&&<SavedAttachments transferId={id}/>}
  {!pending&&!financialSaved&&<MotionPressable disabled={locked||!query.transferEntrySupported} style={form.button} onPress={()=>submit(initial?'update':'create')}><Text style={form.buttonText}>{busy?'Saving…':initial?'Save transfer changes':'Record transfer'}</Text></MotionPressable>}
  {financialSaved&&<MotionPressable disabled={busy} style={form.button} onPress={()=>void finish('saved')}><Text style={form.buttonText}>Finish saved transfer</Text></MotionPressable>}
  <MotionPressable disabled={busy} style={form.secondaryButton} onPress={onClose}><Text style={form.chipTextSelected}>Cancel</Text></MotionPressable>
  {initial&&!pending&&!financialSaved&&<MotionPressable disabled={locked} style={form.secondaryButton} onPress={()=>setDeleting(!deleting)}><Text style={form.secondaryText}>Delete transfer</Text></MotionPressable>}
  {deleting&&!pending&&<View><Text style={form.subtitle}>Delete this transfer and its fee expense? Both tracked balances will be recalculated.</Text><MotionPressable disabled={locked} style={form.button} onPress={()=>submit('delete')}><Text style={form.buttonText}>Confirm delete transfer</Text></MotionPressable></View>}
 </View>;
}

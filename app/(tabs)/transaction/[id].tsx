import {PaymentMethodPicker,TransferDialog} from '../../../src/components/PaymentMethodPicker';
import {useProofDraft,ProofPicker,AttachmentRetry,SavedAttachments} from '../../../src/components/TransactionAttachments';
import {IncomeSourcePicker} from '../../../src/components/IncomeSources';
import { useBillCommand } from '../../../src/hooks/useDashboard';
import { createRequestId } from '../../../src/domain/ocr';
import { formatMoney,useMoneyCents } from '../../../src/domain/money';
import {usePaymentMethods} from '../../../src/hooks/usePaymentMethods';
import type { UpdateTransactionInput } from '../../../src/hooks/useTransactions';
import { useState, useRef } from 'react';
import {useExpenseBalanceReview,ExpenseReviewMethodDialog} from '../../../src/components/ExpenseBalanceReview';
import { View, ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useUpdateTransaction, useDeleteTransaction, useTransaction, useTransactionItems } from '../../../src/hooks/useTransactions';
import { useUiStore } from '../../../src/stores/useUiStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { MotionPressable } from '../../../src/components/MotionPressable';
import { ActionSheet } from '../../../src/components/ActionSheet';
import { Trash2 } from 'lucide-react-native';
import { useColors } from '../../../src/styles/theme';
import { QueryState } from '../../../src/components/QueryState';
import { useFormStyles } from '../../../src/styles/forms';
import { usePageLayout } from '../../../src/styles/pageLayout';
import { decimalToCents,isUuid, type TransactionItemInput } from '../../../supabase/functions/ocr/shared';
import type { Transaction, Category } from '../../../src/types/database';
import { effectiveDate, occurrenceForDate } from '../../../src/domain/transactionDates';

export default function EditTransactionScreen() {
  const { id, visit } = useLocalSearchParams<{ id: string; visit?: string }>();
  return <LoadTransaction key={`${id}:${visit ?? 'direct'}`} id={id} />;
}
function LoadTransaction({ id }: { id: string }) {
  const layout = usePageLayout();
  const parent = useTransaction(id);
  const items = useTransactionItems(id);
  const categories = useCategories();
  const [snapshot, setSnapshot] = useState<{ transaction: Transaction; items: TransactionItemInput[]; categories: Category[] } | null>(null);
  if (!snapshot && parent.isSuccess && items.isSuccess && categories.isSuccess && !parent.isFetching && !items.isFetching && !categories.isFetching) {
    setSnapshot({ transaction: parent.data, items: items.data, categories: categories.data });
  }
  return <ScrollView style={layout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={layout.scrollContent}>
    <View style={layout.card}>
      {parent.data?.transfer_id ? <TransferFeeDetails transaction={parent.data}/> : snapshot ? <Editor {...snapshot} /> : <QueryState error={!isUuid(id) || parent.isError || items.isError || categories.isError}
        loading={isUuid(id) && !parent.isError && !items.isError && !categories.isError}
        retry={() => { void parent.refetch(); void items.refetch(); void categories.refetch(); }}>
      </QueryState>}
    </View>
  </ScrollView>;
}
function TransferFeeDetails({transaction}:{transaction:Transaction}) {
  const query=usePaymentMethods(),styles=useFormStyles(),money=useMoneyCents(),router=useRouter();
  const [open,setOpen]=useState(false);
  const transfer=query.transfers?.find(row=>row.id===transaction.transfer_id);
  return <View><Text style={styles.title}>Transfer fee</Text><Text style={styles.subtitle}>{money(decimalToCents(transaction.amount)!)} · {effectiveDate(transaction)}</Text><Text style={styles.subtitle}>Edit or remove this fee through its transfer.</Text><QueryState loading={query.isPending} error={query.isError||(!query.isPending&&!transfer)} retry={()=>void query.refetch()}/><MotionPressable disabled={!transfer||query.isFetching} style={styles.button} onPress={()=>setOpen(true)}><Text style={styles.buttonText}>Edit transfer</Text></MotionPressable>{open&&transfer&&<TransferDialog initial={transfer} onClose={()=>setOpen(false)} onSaved={()=>router.back()}/>}</View>;
}
function Editor({ transaction, items, categories }: { transaction: Transaction; items: TransactionItemInput[]; categories: Category[] }) {
  // A mounted editor owns its initial snapshot; background query updates never overwrite a draft.
  const [snapshot] = useState(() => ({ transaction, items }));
  const router = useRouter();
  const styles = useFormStyles();
  const month = useUiStore(state => state.selectedMonth);
  const update = useUpdateTransaction(month);
  const remove = useDeleteTransaction(month);
  const billCommand=useBillCommand();
  const [confirmation,setConfirmation]=useState<UpdateTransactionInput|null>(null);
  const [destructive,setDestructive]=useState<'delete'|'replace'|null>(null);
  const colors=useColors();
  const funds=useExpenseBalanceReview<UpdateTransactionInput>(transaction);
  const methodChange=useRef<((id:string|null)=>void)|null>(null);
  const proof=useProofDraft();
  const finishSave=()=>{void proof.upload(snapshot.transaction.id).then(ok=>{if(ok)router.back();});};
  const saving = update.isPending || remove.isPending || billCommand.isPending || funds.checking || proof.busy;
  if(proof.savedId)return <AttachmentRetry draft={proof} onDone={()=>router.back()}/>;
  return <>
    {snapshot.transaction.occurrence_id&&<Text style={styles.subtitle}>Linked to a scheduled bill. Changing this expense to income skips that occurrence.</Text>}
    <funds.Controls busy={saving}/>
    <ExpenseReviewMethodDialog review={funds} onSelect={id=>methodChange.current?.(id)}/>
    <View style={confirmation||funds.pending?{display:'none'}:undefined}>
    <TransactionForm incomeSourceControl={(value,onChange)=><IncomeSourcePicker value={value} onChange={onChange}/>} paymentMethodControl={(value,onChange)=>{methodChange.current=onChange;return <PaymentMethodPicker value={value} onChange={onChange}/>;}} categories={categories}
      attachmentControl={<><SavedAttachments transactionId={snapshot.transaction.id}/><ProofPicker draft={proof} disabled={saving}/></>}
      initialValues={{ incomeSourceId:snapshot.transaction.income_source_id??null,paymentMethodId:snapshot.transaction.payment_method_id??null,type: snapshot.transaction.type, categoryId: snapshot.transaction.category_id ?? '', amount: String(snapshot.transaction.amount), note: snapshot.transaction.note ?? '', items: snapshot.items, paymentDetails:snapshot.transaction.payment_details ?? null,transactionDate:effectiveDate(snapshot.transaction) }}
      submitting={saving||funds.checking} submitLabel="Save Changes"
      onSubmit={values => {const input={ ...values, occurrenceId:snapshot.transaction.occurrence_id??undefined,id: snapshot.transaction.id, occurredAt:values.transactionDate === effectiveDate(snapshot.transaction) ? snapshot.transaction.occurred_at : occurrenceForDate(values.transactionDate,snapshot.transaction.occurred_at) };if(snapshot.transaction.occurrence_id&&values.type==='expense'&&values.amount!==snapshot.transaction.amount){setConfirmation(input);return;}void funds.review(input,()=>update.mutate(input,{onSuccess:finishSave}));}} />
    </View>
    {confirmation&&<View><Text style={styles.subtitle}>Change this linked expense from {formatMoney(snapshot.transaction.amount)} to {formatMoney(confirmation.amount)}? It will still settle the whole scheduled bill; partial payments are not supported.</Text>{update.isError&&<Text accessibilityRole="alert" style={styles.error}>Could not save this settlement. Your confirmation and draft are still here. Retry or cancel.</Text>}<MotionPressable style={styles.button} disabled={saving} onPress={()=>update.mutate({...confirmation,confirmDifference:true},{onSuccess:finishSave})}><Text style={styles.buttonText}>Confirm full settlement</Text></MotionPressable><MotionPressable style={styles.secondaryButton} disabled={saving} onPress={()=>setConfirmation(null)}><Text style={styles.chipText}>Cancel confirmation</Text></MotionPressable></View>}
    <MotionPressable style={[styles.secondaryButton,{flexDirection:'row',gap:8,justifyContent:'center'}]} disabled={saving} onPress={() => setDestructive('delete')}>
      <Trash2 size={18} color={colors.danger}/>
      <Text style={styles.secondaryText}>{snapshot.transaction.occurrence_id ? 'Delete and skip this bill' : 'Delete Transaction'}</Text>
    </MotionPressable>
    <ActionSheet visible={destructive!==null} title={destructive==='replace'?'Replace this expense?':'Delete transaction?'} busy={saving} onClose={()=>{if(!saving)setDestructive(null);}}>
      <Text style={styles.subtitle}>{formatMoney(snapshot.transaction.amount)} · {effectiveDate(snapshot.transaction)}{snapshot.transaction.note ? ` · ${snapshot.transaction.note}` : ''}</Text>
      <Text style={styles.subtitle}>This removes the transaction and any attached receipts.{destructive==='replace'?' The bill stays pending until you record or link a replacement payment.':snapshot.transaction.occurrence_id ? ' The linked bill occurrence will be skipped.' : ''} This cannot be undone.</Text>
      {(destructive==='replace'?billCommand.isError:remove.isError) && <Text accessibilityRole="alert" style={styles.error}>Could not {destructive==='replace'?'replace':'delete'} this transaction. Retry or keep it.</Text>}
      <MotionPressable accessibilityLabel={destructive==='replace'?'Confirm expense replacement':'Confirm transaction deletion'} disabled={saving} style={[styles.button,{flexDirection:'row',gap:8,justifyContent:'center'}]} onPress={()=>{
        if(destructive==='replace'&&snapshot.transaction.occurrence_id)billCommand.mutate({id:snapshot.transaction.occurrence_id,command:'replace',transactionId:snapshot.transaction.id},{onSuccess:data=>{setDestructive(null);router.replace({pathname:'/transaction/new',params:{visit:createRequestId(),occurrenceId:data.occurrence.id}});}});
        else remove.mutate(snapshot.transaction.id,{onSuccess:()=>{setDestructive(null);router.back();}});
      }}>
        <Trash2 size={18} color={colors.onPrimary}/><Text style={styles.buttonText}>{saving?'Working…':destructive==='replace'?'Remove and replace':snapshot.transaction.occurrence_id?'Delete and skip bill':'Delete transaction'}</Text>
      </MotionPressable>
      <MotionPressable disabled={saving} style={styles.secondaryButton} onPress={()=>setDestructive(null)}><Text style={styles.chipTextSelected}>Keep transaction</Text></MotionPressable>
    </ActionSheet>
    {snapshot.transaction.occurrence_id&&<MotionPressable disabled={saving} style={styles.secondaryButton} onPress={()=>setDestructive('replace')}><Text style={styles.chipText}>Replace this expense</Text></MotionPressable>}
  </>;
}

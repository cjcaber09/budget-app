import {PaymentMethodPicker} from '../../../src/components/PaymentMethodPicker';
import { useBillCommand } from '../../../src/hooks/useDashboard';
import { createRequestId } from '../../../src/domain/ocr';
import { formatMoney } from '../../../src/domain/money';
import type { UpdateTransactionInput } from '../../../src/hooks/useTransactions';
import { useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useUpdateTransaction, useDeleteTransaction, useTransaction, useTransactionItems } from '../../../src/hooks/useTransactions';
import { useUiStore } from '../../../src/stores/useUiStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { MotionPressable } from '../../../src/components/MotionPressable';
import { QueryState } from '../../../src/components/QueryState';
import { useFormStyles } from '../../../src/styles/forms';
import { usePageLayout } from '../../../src/styles/pageLayout';
import { isUuid, type TransactionItemInput } from '../../../supabase/functions/ocr/shared';
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
      {snapshot ? <Editor {...snapshot} /> : <QueryState error={!isUuid(id) || parent.isError || items.isError || categories.isError}
        loading={isUuid(id) && !parent.isError && !items.isError && !categories.isError}
        retry={() => { void parent.refetch(); void items.refetch(); void categories.refetch(); }}>
      </QueryState>}
    </View>
  </ScrollView>;
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
  const saving = update.isPending || remove.isPending || billCommand.isPending;
  return <>
    {snapshot.transaction.occurrence_id&&<Text style={styles.subtitle}>Linked to a scheduled bill. Changing this expense to income skips that occurrence.</Text>}
    <View style={confirmation?{display:'none'}:undefined}>
    <TransactionForm paymentMethodControl={(value,onChange)=><PaymentMethodPicker value={value} onChange={onChange}/>} categories={categories}
      initialValues={{ paymentMethodId:snapshot.transaction.payment_method_id??null,type: snapshot.transaction.type, categoryId: snapshot.transaction.category_id ?? '', amount: String(snapshot.transaction.amount), note: snapshot.transaction.note ?? '', items: snapshot.items, paymentDetails:snapshot.transaction.payment_details ?? null,transactionDate:effectiveDate(snapshot.transaction) }}
      submitting={saving} submitLabel="Save Changes"
      onSubmit={values => {const input={ ...values, occurrenceId:snapshot.transaction.occurrence_id??undefined,id: snapshot.transaction.id, occurredAt:values.transactionDate === effectiveDate(snapshot.transaction) ? snapshot.transaction.occurred_at : occurrenceForDate(values.transactionDate,snapshot.transaction.occurred_at) };if(snapshot.transaction.occurrence_id&&values.type==='expense'&&values.amount!==snapshot.transaction.amount){setConfirmation(input);return;}update.mutate(input,{onSuccess:()=>router.back()});}} />
    </View>
    {confirmation&&<View><Text style={styles.subtitle}>Change this linked expense from {formatMoney(snapshot.transaction.amount)} to {formatMoney(confirmation.amount)}? It will still settle the whole scheduled bill; partial payments are not supported.</Text>{update.isError&&<Text accessibilityRole="alert" style={styles.error}>Could not save this settlement. Your confirmation and draft are still here. Retry or cancel.</Text>}<MotionPressable style={styles.button} disabled={saving} onPress={()=>update.mutate({...confirmation,confirmDifference:true},{onSuccess:()=>router.back()})}><Text style={styles.buttonText}>Confirm full settlement</Text></MotionPressable><MotionPressable style={styles.secondaryButton} disabled={saving} onPress={()=>setConfirmation(null)}><Text style={styles.chipText}>Cancel confirmation</Text></MotionPressable></View>}
    <MotionPressable style={styles.secondaryButton} disabled={saving} onPress={() => remove.mutate(snapshot.transaction.id, { onSuccess: () => router.back() })}>
      <Text style={styles.secondaryText}>{snapshot.transaction.occurrence_id ? 'Delete and skip this bill' : 'Delete Transaction'}</Text>
    </MotionPressable>
    {snapshot.transaction.occurrence_id&&<MotionPressable disabled={saving} style={styles.secondaryButton} onPress={()=>billCommand.mutate({id:snapshot.transaction.occurrence_id!,command:'replace'},{onSuccess:data=>router.replace({pathname:'/transaction/new',params:{visit:createRequestId(),occurrenceId:data.occurrence.id,paymentMethodId:data.occurrence.payment_method_id??undefined,categoryId:data.occurrence.category_id??'',billAmount:String(data.occurrence.amount),billNote:data.occurrence.label??'Scheduled expense'}})})}><Text style={styles.chipText}>Replace this expense</Text></MotionPressable>}
  </>;
}

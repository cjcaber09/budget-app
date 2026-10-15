import { MoneyInput } from './MoneyInput';
import {CategoryPicker} from './CategoryPicker';
import { formatMoney } from '../domain/money';
import { useEffect,useRef,useState,type ReactNode } from 'react';
import type {TransactionDraftFields} from '../domain/transactionDraft';
import { MotionPressable } from './MotionPressable';
import { useFormStyles } from '../styles/forms';
import { useColors } from '../styles/theme';
import { View, Text, TextInput } from 'react-native';
import type { Category, TransactionType } from '../types/database';
import { centsToDecimal, decimalToCents, MAX_MONEY_CENTS, sumItemCents, isCalendarDate, receiptTarget, validPaymentDetails, type PaymentDetails, type TransactionItemInput, type ReconciledReceipt } from '../../supabase/functions/ocr/shared';
import { draftItem, parseItemDrafts, type ItemDraft } from '../domain/itemDrafts';
import { TransactionItemsEditor } from './TransactionItemsEditor';
import { TransactionDateField } from './TransactionDateField';
import { localDateKey } from '../domain/transactionDates';

export interface TransactionFormValues {
  incomeSourceId:string|null;
  paymentMethodId:string|null;
  transactionDate: string;
  paymentDetails: PaymentDetails | null;
  items: TransactionItemInput[];
  type: TransactionType;
  categoryId: string;
  amount: string;
  note: string;
}

interface Props {
  transferControl?:{selected:boolean;onSelect:()=>void;content:ReactNode;onLeave?:()=>void};
  initialDraft?:TransactionDraftFields;
  onDraftChange?:(draft:TransactionDraftFields)=>void;
  attachmentControl?:ReactNode;
  incomeSourceControl?:(value:string|null,onChange:(id:string|null)=>void)=>ReactNode;
  paymentMethodControl?:(value:string|null,onChange:(id:string|null)=>void)=>ReactNode;
  onDiscard?: () => void;
  scanDate?: string;
  scanned?: boolean;
  receipt?: ReconciledReceipt | null;
  receiptText?: string;
  categories: Category[];
  initialValues?: Partial<TransactionFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: {
    incomeSourceId:string|null;
    paymentMethodId:string|null;
    type: TransactionType;
    categoryId: string | null;
    amount: number;
    note: string | null;
    items: TransactionItemInput[];
    transactionDate: string;
    paymentDetails: PaymentDetails | null;
  }) => void;
}

const TYPE_OPTIONS: TransactionType[] = ['expense', 'income'];

export function TransactionForm({ categories, initialValues, initialDraft,onDraftChange,receipt, receiptText, scanDate, scanned, onDiscard, submitLabel, submitting, onSubmit,paymentMethodControl,incomeSourceControl,attachmentControl,transferControl }: Props) {
  const styles = useFormStyles();
  const colors = useColors();
  const [type, setType] = useState<TransactionType|null>(() => initialValues?.type ?? (receipt?.transactionType === 'income' || receipt?.transactionType === 'expense' ? receipt.transactionType : scanned ? null : 'expense'));
  const [manualEntry, setManualEntry] = useState(false);
  const [transferVisited,setTransferVisited]=useState(false);
  if(transferControl?.selected&&!transferVisited)setTransferVisited(true);
  const [transactionDate,setTransactionDate] = useState(initialValues?.transactionDate ?? receipt?.receiptDate ?? scanDate ?? localDateKey(new Date()));
  const [dateEdited,setDateEdited] = useState(false);
  const [paymentDetails,setPaymentDetails] = useState<PaymentDetails|null>(initialValues?.paymentDetails ?? receipt?.paymentDetails ?? null);
  const [paymentMethodId,setPaymentMethodId]=useState<string|null>(initialValues?.paymentMethodId??null);
  const [incomeSourceId,setIncomeSourceId]=useState<string|null>(initialValues?.incomeSourceId??null);
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ItemDraft[]>(() => initialDraft?.drafts??(initialValues?.items ?? receipt?.rows ?? []).map(draftItem));
  const draftCallback=useRef(onDraftChange);
  useEffect(()=>{draftCallback.current=onDraftChange;},[onDraftChange]);
  const previousDraft=useRef<string|null>(null);
  const previousTransfer=useRef(!!transferControl?.selected);
  useEffect(()=>{
    const leftTransfer=previousTransfer.current&&!transferControl?.selected;
    previousTransfer.current=!!transferControl?.selected;
    if(!type||scanned||paymentDetails||transferControl?.selected)return;
    const draft:TransactionDraftFields={type,amount,note,categoryId,paymentMethodId,incomeSourceId,transactionDate,drafts};
    const signature=JSON.stringify(draft);
    if(leftTransfer||previousDraft.current!==null&&signature!==previousDraft.current)draftCallback.current?.(draft);
    previousDraft.current=signature;
  },[type,amount,note,categoryId,paymentMethodId,incomeSourceId,transactionDate,drafts,scanned,paymentDetails,transferControl?.selected]);
  const [showText, setShowText] = useState(false);
  const [lastPositiveTotal, setLastPositiveTotal] = useState<number | null>(() => {
    const total = sumItemCents(initialDraft?parseItemDrafts(initialDraft.drafts).rows:initialValues?.items ?? receipt?.rows ?? [],type ?? 'expense');
    return total > 0 && total <= MAX_MONEY_CENTS ? total : null;
  });
  const parsed = parseItemDrafts(drafts);
  const hasRows = drafts.length > 0;
  const totalCents = type === null ? null : sumItemCents(parsed.rows,type);
  const blockedPayment = !manualEntry && receipt?.schemaVersion !== 1 && !!receipt && receipt.paymentStatus !== 'completed';
  const rowError = hasRows ? parsed.error ?? (totalCents !== null && (totalCents <= 0 || totalCents > MAX_MONEY_CENTS) ? 'Rows must add up to a positive amount within the supported range.' : null) : null;
  const target = manualEntry ? null : receiptTarget(receipt,type);
  const difference = target !== null && totalCents !== null ? target - totalCents : null;
  const summaryDraft = drafts.find(row => row.isPaymentSummary);
  function chooseType(next:TransactionType) {
    transferControl?.onLeave?.();
    if (next === type) return;
    if(next==='expense')setIncomeSourceId(null);
    const nextDrafts = drafts.map(row => row.kind === 'fee' ? { ...row, affectsTotal: row.feeParty && row.feeParty !== 'unknown' ? row.feeParty === (next === 'income' ? 'recipient' : 'sender') && row.affectsTotal : row.affectsTotal,
      requiresCountingReview: !row.feeParty || row.feeParty === 'unknown' || (!row.affectsTotal && row.feeParty === (next === 'income' ? 'recipient' : 'sender')) } : row);
    const result = parseItemDrafts(nextDrafts); const total = sumItemCents(result.rows,next);
    setLastPositiveTotal(!result.error && total>0 && total<=MAX_MONEY_CENTS ? total : null);
    setDrafts(nextDrafts); setType(next);
  }
  function changeDrafts(next: ItemDraft[]) {
    if (drafts.length && !next.length && lastPositiveTotal !== null) setAmount(centsToDecimal(lastPositiveTotal));
    const nextParsed = parseItemDrafts(next);
    const nextTotal = sumItemCents(nextParsed.rows,type ?? 'expense');
    if (type && !nextParsed.error && nextTotal > 0 && nextTotal <= MAX_MONEY_CENTS) setLastPositiveTotal(nextTotal);
    setDrafts(next);
  }

  function handleSubmit() {
    if (submitting) return;
    const manualCents = /^\d+(?:\.\d{0,2})?$/.test(amount) ? decimalToCents(amount) : null;
    const parsedAmount = hasRows ? (totalCents ?? 0) / 100 : (manualCents ?? 0) / 100;
    if (!type || blockedPayment) { setError('Choose a completed transaction type, or enter a transaction manually.'); return; }
    if (!isCalendarDate(transactionDate)) { setError('Enter a valid date in YYYY-MM-DD format.'); return; }
    if (!validPaymentDetails(paymentDetails)) { setError('Payment details must be blank or text up to 200 characters.'); return; }

    if (type === 'expense' && !categoryId) {
      setError('Please choose a category');
      return;
    }
    if (rowError) { setError(rowError); return; }
    if ((!hasRows && manualCents === null) || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a number greater than 0');
      return;
    }

    setError(null);
    onSubmit({
      incomeSourceId:type==='income'?incomeSourceId:null,
      paymentMethodId,
      type,
      categoryId: type === 'expense' ? categoryId : null,
      amount: parsedAmount,
      note: note.trim() ? note.trim() : null,
      items: parsed.rows,
      transactionDate, paymentDetails,
    });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      {receipt?.classificationReason && !manualEntry && <Text style={styles.subtitle}>{receipt.classificationReason}</Text>}
      {!type && !transferControl?.selected && <Text style={styles.subtitle}>Choose Income or Expense. The receipt direction is unclear.</Text>}
      {!type && !transferControl?.selected && scanned && onDiscard && <MotionPressable style={styles.secondaryButton} onPress={onDiscard}><Text style={styles.chipText}>Skip transaction</Text></MotionPressable>}
      {blockedPayment && !transferControl?.selected && <View><Text style={styles.error}>This payment is {receipt?.paymentStatus ?? 'unconfirmed'}. It cannot be saved as a completed payment.</Text><MotionPressable style={styles.chip} onPress={() => { setManualEntry(true); setType(null); setDrafts([]); setAmount(''); setNote(''); setPaymentDetails(null); setTransactionDate(scanDate ?? localDateKey(new Date())); setLastPositiveTotal(null); }}><Text style={styles.chipText}>Enter manually</Text></MotionPressable></View>}
      <Text style={styles.label}>Type</Text>
      <View style={styles.optionRow}>
        {TYPE_OPTIONS.map((option) => (
          <MotionPressable
            key={option} disabled={submitting} accessibilityState={{ selected: !transferControl?.selected&&type === option }}
            onPress={() => chooseType(option)}
            style={[styles.chip, !transferControl?.selected&&type === option && styles.chipSelected]}
          >
            <Text style={!transferControl?.selected&&type === option ? styles.chipTextSelected : styles.chipText}>
              {option === 'expense' ? 'Expense' : 'Income'}
            </Text>
          </MotionPressable>
        ))}
        {transferControl&&<MotionPressable disabled={submitting} accessibilityState={{selected:transferControl.selected}} onPress={transferControl.onSelect} style={[styles.chip,transferControl.selected&&styles.chipSelected]}><Text style={transferControl.selected?styles.chipTextSelected:styles.chipText}>Transfer</Text></MotionPressable>}
      </View>
      {transferControl&&(transferControl.selected||transferVisited)&&<View style={transferControl.selected?undefined:{display:'none'}}>{transferControl.content}</View>}
      <View style={transferControl?.selected?{display:'none'}:undefined}>
      <Text style={styles.label}>{paymentDetails ? 'Total' : 'Amount'}</Text>
      <MoneyInput placeholderTextColor={colors.subtle} style={styles.input} accessibilityLabel="Amount" accessibilityHint={hasRows ? 'Computed from counted rows' : undefined} editable={!hasRows} keyboardType="decimal-pad" value={hasRows ? totalCents === null ? '' : centsToDecimal(Math.abs(totalCents)<=MAX_MONEY_CENTS ? totalCents : 0) : amount} onChangeText={setAmount} placeholder={type ? '0.00' : 'Choose a type'} />
      {type === 'expense' && <CategoryPicker compact categories={categories} value={categoryId} onChange={setCategoryId}/>}
      {type==='income'&&(incomeSourceControl?incomeSourceControl(incomeSourceId,setIncomeSourceId):<View><Text style={styles.label}>Income source</Text><Text style={styles.subtitle}>Unspecified</Text></View>)}
      {paymentMethodControl?paymentMethodControl(paymentMethodId,setPaymentMethodId):<View><Text style={styles.label}>Payment method</Text><Text style={styles.subtitle}>Cash</Text></View>}
      <TransactionDateField value={transactionDate} onChange={day => {setTransactionDate(day);setDateEdited(true);}} hint={dateEdited ? 'Edited date' : receipt?.receiptDate ? 'Receipt date' : scanned ? receipt?.receiptDateRaw ? 'Receipt date was unclear; using the date this scan started.' : 'No receipt date found; using the date this scan started.' : undefined} />
      {paymentDetails && <View style={{marginTop:28}}>
        <Text style={styles.title}>Payment details</Text>
        {([['fromName','From name'],['fromNumber','From number'],['reference','Reference']] as const).map(([field,label]) => <View key={field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} placeholderTextColor={colors.subtle} accessibilityLabel={label} value={paymentDetails[field] ?? ''} onChangeText={value => setPaymentDetails({...paymentDetails,[field]:value.trim() ? value : null})} /></View>)}
        <Text style={styles.label}>Payment amount</Text>
        <MoneyInput style={styles.input} accessibilityLabel="Payment amount" keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.subtle} value={summaryDraft?.amount ?? (hasRows && totalCents !== null ? centsToDecimal(totalCents) : '')} editable={!!summaryDraft || !hasRows} onChangeText={value => {
          if (summaryDraft) changeDrafts(drafts.map(row => row.id===summaryDraft.id ? {...row,amount:value}:row));
          else if(!hasRows && drafts.length<100) changeDrafts([...drafts,{...draftItem(),label:'Payment',amount:value,isPaymentSummary:true,affectsTotal:true}]);
        }} />
        {!summaryDraft && hasRows && <Text style={styles.subtitle}>Calculated from the rows below. Edit rows to change it.</Text>}
        {!summaryDraft && drafts.length>=100 && <Text style={styles.subtitle}>Remove a row before adding a payment amount.</Text>}
      </View>}
      <TransactionItemsEditor drafts={drafts} onChange={changeDrafts} transactionType={type} onUnfinishedDraft={onDraftChange&&!scanned&&!paymentDetails?rows=>{if(type)draftCallback.current?.({type,amount,note,categoryId,paymentMethodId,incomeSourceId,transactionDate,drafts:rows});}:undefined} />
      {rowError && <Text style={[styles.error, { marginTop: 16 }]} accessibilityRole="alert">{rowError}</Text>}
      {hasRows && !rowError && difference !== null && Math.abs(difference) > 1 && <View style={{ marginTop: 16 }}>
        <Text style={styles.subtitle}>Rows add up to {formatMoney((totalCents!)/100)}; printed {type === 'income' ? 'net received' : 'total paid'} is {formatMoney((target!)/100)}</Text>
        <MotionPressable style={styles.chip} disabled={drafts.length >= 100 || Math.abs(difference) > MAX_MONEY_CENTS} onPress={() => changeDrafts([...drafts, draftItem({ kind: 'adjustment', label: 'Receipt adjustment', amountCents: difference, quantity: null, unitPriceCents: null, taxIncluded: false })])}>
          <Text style={styles.chipText}>{difference < 0 ? 'Subtract' : 'Add'} {formatMoney((Math.abs(difference))/100)} adjustment</Text>
        </MotionPressable>
        {drafts.length >= 100 && <Text style={styles.subtitle}>Remove a row before adding an adjustment.</Text>}
      </View>}
      {receipt && (receipt.droppedRowCount > 0 || receipt.cappedRowCount > 0 || !receipt.rows.length) && <Text style={[styles.subtitle, { marginTop: 16 }]}>{receipt.rows.length ? `${receipt.droppedRowCount + receipt.cappedRowCount} receipt rows could not be added. Review the transcription before saving.` : 'No items found. Review the receipt and enter them manually.'}</Text>}
      {receiptText && <>
        <MotionPressable style={styles.secondaryButton} onPress={() => setShowText(!showText)}><Text style={styles.chipText}>{showText ? 'Hide receipt text' : 'View receipt text'}</Text></MotionPressable>
        {showText && <Text selectable style={styles.subtitle}>{receiptText}</Text>}
      </>}
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        placeholderTextColor={colors.subtle}
        style={[styles.input, styles.noteInput]}
        value={note}
        onChangeText={setNote}
        accessibilityLabel="Note" placeholder="What was it for?"
        multiline
      />
      {attachmentControl}
      <MotionPressable style={styles.button} onPress={handleSubmit} disabled={submitting || !!rowError || !type || blockedPayment}>
        <Text style={styles.buttonText}>{submitting ? 'Saving…' : submitLabel}</Text>
      </MotionPressable>
      </View>
    </View>
  );
}

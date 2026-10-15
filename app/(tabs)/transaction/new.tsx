import {TransferEntryForm} from '../../../src/components/TransferEntryForm';
import type {EntryDraft} from '../../../src/domain/transferDraft';
import {TransactionDraftRecovery} from '../../../src/components/TransactionDraftRecovery';
import {repeatTransactionValues} from '../../../src/domain/repeatTransaction';
import {useIncomeSources} from '../../../src/hooks/useIncomeSources';
import {usePaymentMethods} from '../../../src/hooks/usePaymentMethods';
import {QueryState} from '../../../src/components/QueryState';
import type {TransactionFormValues} from '../../../src/components/TransactionForm';
import type {TransactionDraft,TransactionDraftFields} from '../../../src/domain/transactionDraft';
import {saveTransactionDraft,clearTransactionDraft,transactionDraftGeneration} from '../../../src/lib/transactionDraftStorage';
import {draftItem} from '../../../src/domain/itemDrafts';
import {useFormStyles} from '../../../src/styles/forms';
import {supabase} from '../../../src/lib/supabase';
import {isUuid} from '../../../supabase/functions/ocr/shared';
import {PaymentMethodPicker} from '../../../src/components/PaymentMethodPicker';
import {BillPaymentForm} from '../../../src/components/BillPaymentForm';
import {useProofDraft,ProofPicker,AttachmentRetry} from '../../../src/components/TransactionAttachments';
import {IncomeSourcePicker} from '../../../src/components/IncomeSources';
import {useExpenseBalanceReview,ExpenseReviewMethodDialog} from '../../../src/components/ExpenseBalanceReview';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Image, Text, ActivityIndicator } from 'react-native';
import { MotionPressable } from '../../../src/components/MotionPressable';
import { createThemedStyles, type, useColors } from '../../../src/styles/theme';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddTransaction,useTransaction,useTransactionItems } from '../../../src/hooks/useTransactions';
import { useOcrScan } from '../../../src/hooks/useOcr';
import { useUiStore } from '../../../src/stores/useUiStore';
import { useScanStore, type PendingScanImage } from '../../../src/stores/useScanStore';
import { useToastStore } from '../../../src/stores/useToastStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { usePageLayout } from '../../../src/styles/pageLayout';
import { MAX_OCR_TEXT_CHARS, centsToDecimal, type OcrScanResult } from '../../../supabase/functions/ocr/shared';
import { createRequestId } from '../../../src/domain/ocr';
import { localDateKey, occurrenceForDate } from '../../../src/domain/transactionDates';
import { activeTimezone,usePreferencesStore } from '../../../src/stores/usePreferencesStore';
import type { AddTransactionInput } from '../../../src/hooks/useTransactions';

function showToast(message: string) {
  useToastStore.getState().showToast(message);
}

// Tab screens stay mounted between visits, so all per-visit state lives in
// NewTransactionContent, remounted for every `visit` id the FAB navigates with.
// The pending image is only used when it was picked for this visit.
export default function NewTransactionScreen() {

  const { visit,occurrenceId,repeatId } = useLocalSearchParams<{ visit?: string;occurrenceId?:string;repeatId?:string }>();
  const owner=usePreferencesStore(state=>state.profile?.user_id);
  const pendingImage = useScanStore((state) => state.pendingImage);
  const scanImage = pendingImage && pendingImage.requestId === visit ? pendingImage : null;

  if(occurrenceId)return <BillPaymentForm key={visit??occurrenceId} occurrenceId={occurrenceId}/>;

  if(!owner)return null;
  return <NewVisitEntry key={`${owner}:${visit??'direct'}`} owner={owner} scanImage={scanImage} repeatId={repeatId}/>;
}
function NewVisitEntry({owner,scanImage,repeatId}:{owner:string;scanImage:PendingScanImage|null;repeatId?:string}) {
  const [scan]=useState(scanImage);
  if(scan)return <TransactionDraftRecovery owner={owner}>{draft=><NewTransactionContent scanImage={draft?null:scan} restored={draft}/>}</TransactionDraftRecovery>;
  return <TransactionDraftRecovery owner={owner}>{draft=>repeatId&&!draft?<RepeatEntry repeatId={repeatId}/>:<NewTransactionContent scanImage={null} restored={draft}/>}</TransactionDraftRecovery>;
}

function RepeatEntry({repeatId}:{repeatId:string}) {
 const parent=useTransaction(repeatId),items=useTransactionItems(repeatId),categories=useCategories(),methods=usePaymentMethods(),sources=useIncomeSources();
 const owner=usePreferencesStore(state=>state.profile?.user_id),layout=usePageLayout(),form=useFormStyles();
 const [copy,setCopy]=useState<ReturnType<typeof repeatTransactionValues>|null>(null);
 let message='';
 if(!copy&&parent.isSuccess&&items.isSuccess&&categories.isSuccess&&methods.isSuccess&&methods.methods&&sources.isSuccess&&!parent.isFetching&&!items.isFetching&&!categories.isFetching&&!methods.isFetching&&!sources.isFetching&&owner){try{setCopy(repeatTransactionValues(parent.data,items.data,categories.data,methods.methods,sources.data,localDateKey(new Date()),owner));}catch(issue){message=issue instanceof Error?issue.message:'Could not repeat this entry.';}}
 if(copy)return <NewTransactionContent scanImage={null} repeated={copy}/>;
 return <View style={layout.screen}><View style={layout.card}>{message?<Text style={form.error}>{message}</Text>:<QueryState error={!isUuid(repeatId)||parent.isError||items.isError||categories.isError||methods.isError||sources.isError} loading={isUuid(repeatId)&&!parent.isError&&!items.isError&&!categories.isError&&!methods.isError&&!sources.isError} retry={()=>{void parent.refetch();void items.refetch();void categories.refetch();void methods.refetch();void sources.refetch();}}/>}</View></View>;
}

function NewTransactionContent({ scanImage: initialScanImage,restored:entryRestored,repeated }: { scanImage: PendingScanImage | null;restored?:EntryDraft|null;repeated?:{values:Partial<TransactionFormValues>;warnings:string[]} }) {
  const restored=entryRestored?.version===1?entryRestored:null;
  const restoredTransfer=entryRestored?.version===2?entryRestored:undefined;
  const [transferSelected,setTransferSelected]=useState(!!restoredTransfer);
  const [transferLocked,setTransferLocked]=useState(false);
  const methods=usePaymentMethods();
  const pageLayout = usePageLayout();
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: addTransaction, isPending: submitting,isError:saveError,error:saveIssue } = useAddTransaction(selectedMonth);
  const acceptScanRef = useRef(true);
  const focusedRef = useRef(true);
  const { mutate: runOcr } = useOcrScan(() => acceptScanRef.current && focusedRef.current);
  const [transactionId] = useState(()=>entryRestored?.id??createRequestId());
  const profile=usePreferencesStore(state=>state.profile);
  const form=useFormStyles();
  const owner=profile?.user_id;
  const [draftGeneration]=useState(()=>owner?transactionDraftGeneration(owner):0);
  const [draftError,setDraftError]=useState(''),[draftBusy,setDraftBusy]=useState(false),[pendingInput,setPendingInput]=useState<AddTransactionInput|null>(restored?.pending??null),[saved,setSaved]=useState(false);
  const draftRef=useRef<TransactionDraft|null>(restored??null),running=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const [scanContext] = useState(() => { if(entryRestored)return {startedAt:entryRestored.startedAt,day:entryRestored.day,timezone:entryRestored.timezone}; const now=new Date();const timezone=activeTimezone();return {startedAt:now.toISOString(),day:localDateKey(now,timezone),timezone}; });
  const occurredAt=scanContext.startedAt;
  const funds=useExpenseBalanceReview<AddTransactionInput>();
  const methodChange=useRef<((id:string|null)=>void)|null>(null);
  const proof=useProofDraft();
  const prepareScan=proof.prepareScan;
  const finishSave=()=>{setSaved(true);void (async()=>{try{if(owner&&!initialScanImage)await clearTransactionDraft(owner,transactionId);if(!alive.current||usePreferencesStore.getState().profile?.user_id!==owner)return;const ok=await proof.upload(transactionId);if(ok&&alive.current)router.back();}catch{if(alive.current)setDraftError('Transaction saved. Could not clear the local draft. Retry cleanup.');}})();};
  function makeDraft(fields:TransactionDraftFields,pending?:AddTransactionInput):TransactionDraft {
    return {version:1,owner:owner!,id:transactionId,updatedAt:new Date().toISOString(),startedAt:scanContext.startedAt,day:scanContext.day,timezone:scanContext.timezone,currency:restored?.currency??profile!.currency,fields,...(pending?{pending}:{})};
  }
  function keepDraft(fields:TransactionDraftFields){
    if(transferSelected||initialScanImage||pendingInput||saved||!owner||running.current||submitting)return;
    const draft=makeDraft(fields);draftRef.current=draft;
    void saveTransactionDraft(draft,draftGeneration).then(()=>{if(alive.current)setDraftError('');}).catch(()=>{if(alive.current)setDraftError('Could not save this draft on your device. Keep this screen open and retry.');});
  }
  async function dispatch(input:AddTransactionInput){
    if(running.current||usePreferencesStore.getState().profile?.user_id!==owner)return;
    running.current=true;setDraftBusy(true);setDraftError('');
    try {
      if(!initialScanImage&&owner){
        const fields:TransactionDraftFields={type:input.type,amount:String(input.amount),note:input.note??'',categoryId:input.categoryId??'',paymentMethodId:input.paymentMethodId??null,incomeSourceId:input.incomeSourceId??null,transactionDate:input.transactionDate!,drafts:(input.items??[]).map(draftItem)};
        const draft=makeDraft(fields,input);await saveTransactionDraft(draft,draftGeneration);draftRef.current=draft;
        if(!alive.current||usePreferencesStore.getState().profile?.user_id!==owner)return;
        setPendingInput(input);
      }
      setPendingInput(input);
      addTransaction(input,{onSuccess:finishSave});
    }catch{if(alive.current)setDraftError('Could not preserve the save request. Retry; nothing was sent.');}
    finally{running.current=false;if(alive.current)setDraftBusy(false);}
  }
  async function checkSaved(){
    if(!owner||running.current)return;running.current=true;setDraftBusy(true);
    try{const result=await supabase.from('transactions').select('id,user_id').eq('id',transactionId).eq('user_id',owner).maybeSingle();if(!alive.current||usePreferencesStore.getState().profile?.user_id!==owner)return;if(result.error)throw result.error;
      if(result.data){await clearTransactionDraft(owner,transactionId);router.replace({pathname:'/transaction/[id]',params:{id:transactionId,visit:createRequestId()}});}
      else if(draftRef.current){const draft={...draftRef.current,pending:undefined};await saveTransactionDraft(draft,draftGeneration);draftRef.current=draft;setPendingInput(null);setDraftError('No saved transaction found. Review this draft before retrying.');}
    }catch{if(alive.current)setDraftError('Could not confirm whether it saved. Retry the same request or check again.');}
    finally{running.current=false;if(alive.current)setDraftBusy(false);}
  }
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    return () => {
      focusedRef.current = false;
      // StrictMode immediately repeats setup; a real blur remains unfocused.
      void Promise.resolve().then(() => { if (!focusedRef.current) acceptScanRef.current = false; });
    };
  }, []));

  // Captured once per visit: the effect below clears the store, which turns the
  // parent's prop to null — the preview and scan must survive that. The ref
  // keeps a StrictMode double-effect from starting a second scan.
  const [scanImage] = useState(initialScanImage);
  const [isScanning, setIsScanning] = useState(scanImage !== null);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<OcrScanResult | null>(null);
  const scanStartedRef = useRef(false);

  useEffect(() => {
    if (!scanImage || scanStartedRef.current) return;
    scanStartedRef.current = true;
    void prepareScan(scanImage.uri);
    useScanStore.getState().clearPendingImage();

    runOcr(
      { base64: scanImage.base64, mimeType: scanImage.mimeType, requestId: scanImage.requestId },
      {
        onSuccess: (result) => {
          if (!acceptScanRef.current || !focusedRef.current) return;
          if (result.truncated) {
            showToast(`That text was long — kept the first ${MAX_OCR_TEXT_CHARS.toLocaleString('en-US')} characters.`);
          } else if (!result.text.trim()) {
            showToast('No text found in that image.');
          }
          setScanResult(result);
          if(result.receipt?.transfer?.kind==='withdrawal'&&result.receipt.paymentStatus==='completed')setTransferSelected(true);
          setPrefillNote(result.receipt ? result.receipt.merchant : result.text.trim() ? result.text : null);
          setIsScanning(false);
        },
        // The error toast comes from the global MutationCache handler.
        onError: () => { if (acceptScanRef.current && focusedRef.current) setIsScanning(false); },
      }
    );
  }, [scanImage, runOcr, prepareScan]);

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={pageLayout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        {proof.savedId ? <AttachmentRetry draft={proof} onDone={()=>router.back()}/> : <>
        {scanImage && <Image source={{ uri: scanImage.uri }} style={styles.preview} />}
        {isScanning ? (
          <View style={styles.scanning}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.scanningText}>Reading text…</Text>
            <MotionPressable style={styles.skipButton} onPress={() => { acceptScanRef.current = false; setIsScanning(false); }}>
              <Text style={styles.skipText}>Skip — enter manually</Text>
            </MotionPressable>
          </View>
        ) : (
          <>
          <funds.Controls busy={submitting||draftBusy}/>
          {!!draftError&&<Text accessibilityRole="alert" style={form.error}>{draftError}</Text>}
          {draftError&&!pendingInput&&!saved&&<MotionPressable style={form.secondaryButton} onPress={()=>{if(draftRef.current)keepDraft(draftRef.current.fields);}}><Text style={form.chipTextSelected}>Retry saving draft</Text></MotionPressable>}
          {saved&&draftError&&<MotionPressable style={form.button} onPress={finishSave}><Text style={form.buttonText}>Retry cleanup</Text></MotionPressable>}
          {!!repeated&&<Text style={form.subtitle}>New copy for today. Review before saving. Attachments, payment references and bill links are not copied.</Text>}
          {repeated?.warnings.map(warning=><Text key={warning} style={form.subtitle}>{warning}</Text>)}
          {!!restored&&<Text style={form.subtitle}>Recovered draft · {restored.currency} · {restored.fields.transactionDate}. Review your date and selections before saving.</Text>}
          {pendingInput&&!saved&&<View><Text style={form.subtitle}>Save request retained: {pendingInput.type} · {pendingInput.transactionDate} · {pendingInput.amount} {restored?.currency??profile?.currency}. Retry this exact request to avoid recording it twice.</Text>{saveError&&<Text accessibilityRole="alert" style={form.error}>{saveIssue.message}</Text>}<MotionPressable disabled={submitting||draftBusy} style={form.button} onPress={()=>void dispatch(pendingInput)}><Text style={form.buttonText}>{submitting||draftBusy?'Saving…':'Retry same save'}</Text></MotionPressable><MotionPressable disabled={submitting||draftBusy} style={form.secondaryButton} onPress={()=>void checkSaved()}><Text style={form.chipTextSelected}>Check whether it saved</Text></MotionPressable></View>}
          <ExpenseReviewMethodDialog review={funds} onSelect={id=>methodChange.current?.(id)}/>
          <View style={funds.pending||pendingInput||saved?{display:'none'}:undefined}>
          <TransactionForm transferControl={{selected:transferSelected,onSelect:()=>setTransferSelected(true),onLeave:()=>setTransferSelected(false),content:<TransferEntryForm defaultCash={scanResult?.receipt?.transfer?.kind==='withdrawal'} entryContext={{...scanContext,currency:entryRestored?.currency??profile?.currency??'USD'}} id={transactionId} methods={methods.methods??[]} active={transferSelected} persist restored={restoredTransfer} proof={proof} onUncertainChange={setTransferLocked} onClose={()=>{if(focusedRef.current)router.back();}} initialFields={scanResult?.receipt?.transfer?{destinationId:scanResult.receipt.transfer.kind==='withdrawal'?methods.methods?.find(m=>m.method==='cash')?.id??'':'',amount:scanResult.receipt.transfer.receivedCents?centsToDecimal(scanResult.receipt.transfer.receivedCents):'',fee:scanResult.receipt.transfer.feeCents!=null?centsToDecimal(scanResult.receipt.transfer.feeCents):'',feeMode:'added',date:scanResult.receipt.receiptDate??scanContext.day,reviewRequired:scanResult.receipt.transfer.requiresReview||scanResult.receipt.paymentStatus!=='completed'}:undefined}/>}} incomeSourceControl={(value,onChange)=><IncomeSourcePicker value={value} onChange={onChange}/>} paymentMethodControl={(value,onChange)=>{methodChange.current=onChange;return <PaymentMethodPicker value={value} onChange={onChange}/>;}}
            attachmentControl={<><ProofPicker draft={proof} disabled={submitting||draftBusy}/>{!initialScanImage&&<Text style={form.subtitle}>Draft recovery saves text and items on this device. Reattach proof files after restarting.</Text>}</>}
            categories={categories}
            receipt={scanResult?.receipt}
            receiptText={scanResult?.text}
            scanned={!!scanResult}
            onDiscard={() => router.back()}
            scanDate={scanContext.day}
            initialDraft={restored?.fields} onDraftChange={initialScanImage?undefined:keepDraft}
            initialValues={restored?.fields??repeated?.values??{paymentMethodId:null,note: prefillNote ?? '', items: scanResult?.receipt?.rows ?? [], amount: scanResult?.receipt?.totalCents ? centsToDecimal(scanResult.receipt.totalCents) : '' }}
            submitting={submitting||draftBusy||funds.checking||proof.busy||transferLocked} submitLabel="Add Transaction"
            onSubmit={({ type, categoryId, amount, note, items, transactionDate, paymentDetails, paymentMethodId, incomeSourceId }) => {
              const input={id:transactionId,type,categoryId,amount,note,items,transactionDate,paymentDetails,paymentMethodId,incomeSourceId,occurredAt:transactionDate===scanContext.day?occurredAt:occurrenceForDate(transactionDate,occurredAt,scanContext.timezone)};
              void funds.review(input,()=>void dispatch(input));
            }}
          />
          </View>
          </>
        )}
        </>}
      </View>
    </ScrollView>
  );
}

const useStyles = createThemedStyles(colors => ({
  preview: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  scanning: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  scanningText: { ...type.body, color: colors.muted },
  skipButton: { paddingVertical: 12, paddingHorizontal: 16, minHeight: 48 },
  skipText: { ...type.label, color: colors.primary },
}));

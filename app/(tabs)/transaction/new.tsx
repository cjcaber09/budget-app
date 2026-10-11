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
import { useAddTransaction } from '../../../src/hooks/useTransactions';
import { useOcrScan } from '../../../src/hooks/useOcr';
import { useUiStore } from '../../../src/stores/useUiStore';
import { useScanStore, type PendingScanImage } from '../../../src/stores/useScanStore';
import { useToastStore } from '../../../src/stores/useToastStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { usePageLayout } from '../../../src/styles/pageLayout';
import { MAX_OCR_TEXT_CHARS, centsToDecimal, type OcrScanResult } from '../../../supabase/functions/ocr/shared';
import { createRequestId } from '../../../src/domain/ocr';
import { localDateKey, occurrenceForDate } from '../../../src/domain/transactionDates';
import { activeTimezone } from '../../../src/stores/usePreferencesStore';
import type { AddTransactionInput } from '../../../src/hooks/useTransactions';

function showToast(message: string) {
  useToastStore.getState().showToast(message);
}

// Tab screens stay mounted between visits, so all per-visit state lives in
// NewTransactionContent, remounted for every `visit` id the FAB navigates with.
// The pending image is only used when it was picked for this visit.
export default function NewTransactionScreen() {

  const { visit,occurrenceId } = useLocalSearchParams<{ visit?: string;occurrenceId?:string }>();
  const pendingImage = useScanStore((state) => state.pendingImage);
  const scanImage = pendingImage && pendingImage.requestId === visit ? pendingImage : null;

  if(occurrenceId)return <BillPaymentForm key={visit??occurrenceId} occurrenceId={occurrenceId}/>;

  return <NewTransactionContent key={visit ?? 'direct'} scanImage={scanImage} />;
}

function NewTransactionContent({ scanImage: initialScanImage }: { scanImage: PendingScanImage | null }) {
  const pageLayout = usePageLayout();
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: addTransaction, isPending: submitting } = useAddTransaction(selectedMonth);
  const acceptScanRef = useRef(true);
  const focusedRef = useRef(true);
  const { mutate: runOcr } = useOcrScan(() => acceptScanRef.current && focusedRef.current);
  const [transactionId] = useState(createRequestId);
  const [scanContext] = useState(() => { const now=new Date();const timezone=activeTimezone();return {startedAt:now.toISOString(),day:localDateKey(now,timezone),timezone}; });
  const occurredAt=scanContext.startedAt;
  const funds=useExpenseBalanceReview<AddTransactionInput>();
  const methodChange=useRef<((id:string|null)=>void)|null>(null);
  const proof=useProofDraft();
  const prepareScan=proof.prepareScan;
  const finishSave=()=>{void proof.upload(transactionId).then(ok=>{if(ok)router.back();});};
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
          <funds.Controls busy={submitting}/>
          <ExpenseReviewMethodDialog review={funds} onSelect={id=>methodChange.current?.(id)}/>
          <View style={funds.pending?{display:'none'}:undefined}>
          <TransactionForm incomeSourceControl={(value,onChange)=><IncomeSourcePicker value={value} onChange={onChange}/>} paymentMethodControl={(value,onChange)=>{methodChange.current=onChange;return <PaymentMethodPicker value={value} onChange={onChange}/>;}}
            attachmentControl={<ProofPicker draft={proof} disabled={submitting}/>}
            categories={categories}
            receipt={scanResult?.receipt}
            receiptText={scanResult?.text}
            scanned={!!scanResult}
            onDiscard={() => router.back()}
            scanDate={scanContext.day}
            initialValues={{paymentMethodId:null,note: prefillNote ?? '', items: scanResult?.receipt?.rows ?? [], amount: scanResult?.receipt?.totalCents ? centsToDecimal(scanResult.receipt.totalCents) : '' }}
            submitting={submitting||funds.checking||proof.busy} submitLabel="Add Transaction"
            onSubmit={({ type, categoryId, amount, note, items, transactionDate, paymentDetails, paymentMethodId, incomeSourceId }) => {
              const input={id:transactionId,type,categoryId,amount,note,items,transactionDate,paymentDetails,paymentMethodId,incomeSourceId,occurredAt:transactionDate===scanContext.day?occurredAt:occurrenceForDate(transactionDate,occurredAt,scanContext.timezone)};
              void funds.review(input,()=>addTransaction(
                input,
                { onSuccess: finishSave }
              ));
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

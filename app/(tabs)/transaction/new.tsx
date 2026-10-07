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
import { formatMoney } from '../../../src/domain/money';

function showToast(message: string) {
  useToastStore.getState().showToast(message);
}

// Tab screens stay mounted between visits, so all per-visit state lives in
// NewTransactionContent, remounted for every `visit` id the FAB navigates with.
// The pending image is only used when it was picked for this visit.
export default function NewTransactionScreen() {

  const { visit,occurrenceId,categoryId,billAmount,billNote } = useLocalSearchParams<{ visit?: string;occurrenceId?:string;categoryId?:string;billAmount?:string;billNote?:string }>();
  const pendingImage = useScanStore((state) => state.pendingImage);
  const scanImage = pendingImage && pendingImage.requestId === visit ? pendingImage : null;

  return <NewTransactionContent key={visit ?? 'direct'} scanImage={scanImage} bill={{occurrenceId,categoryId,billAmount,billNote}} />;
}

function NewTransactionContent({ scanImage: initialScanImage,bill }: { scanImage: PendingScanImage | null;bill:{occurrenceId?:string;categoryId?:string;billAmount?:string;billNote?:string} }) {
  const pageLayout = usePageLayout();
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: addTransaction, isPending: submitting,isError:saveError } = useAddTransaction(selectedMonth);
  const acceptScanRef = useRef(true);
  const focusedRef = useRef(true);
  const { mutate: runOcr } = useOcrScan(() => acceptScanRef.current && focusedRef.current);
  const [transactionId] = useState(createRequestId);
  const [scanContext] = useState(() => { const now=new Date();const timezone=activeTimezone();return {startedAt:now.toISOString(),day:localDateKey(now,timezone),timezone}; });
  const occurredAt=scanContext.startedAt;
  const [billReview,setBillReview]=useState<AddTransactionInput|null>(null);
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
  }, [scanImage, runOcr]);

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
          <View style={billReview?{display:'none'}:undefined}>
          <TransactionForm
            categories={categories}
            receipt={scanResult?.receipt}
            receiptText={scanResult?.text}
            scanned={!!scanResult}
            onDiscard={() => router.back()}
            scanDate={scanContext.day}
            initialValues={{categoryId:bill.categoryId,note: prefillNote ?? bill.billNote ?? '', items: scanResult?.receipt?.rows ?? [], amount: scanResult?.receipt?.totalCents ? centsToDecimal(scanResult.receipt.totalCents) : bill.billAmount??'' }}
            submitting={submitting} submitLabel="Add Transaction"
            onSubmit={({ type, categoryId, amount, note, items, transactionDate, paymentDetails }) => {
              if(bill.occurrenceId && type!=='expense'){showToast('Record a bill as an expense.');return;}
              const input={id:transactionId,occurrenceId:bill.occurrenceId,type,categoryId,amount,note,items,transactionDate,paymentDetails,occurredAt:transactionDate===scanContext.day?occurredAt:occurrenceForDate(transactionDate,occurredAt,scanContext.timezone)};
              if(bill.occurrenceId && amount!==Number(bill.billAmount)){setBillReview(input);return;}
              addTransaction(
                input,
                { onSuccess: () => router.back() }
              );
            }}
          />
          </View>
          {billReview&&<View><Text style={styles.scanningText}>{formatMoney(billReview.amount)} differs from the scheduled {formatMoney(Number(bill.billAmount))}. Confirm this expense settles the whole bill.</Text>{saveError&&<Text accessibilityRole="alert" style={styles.scanningText}>Could not save this settlement. Your draft is still here. Retry or cancel.</Text>}<MotionPressable disabled={submitting} style={styles.skipButton} onPress={()=>addTransaction({...billReview,confirmDifference:true},{onSuccess:()=>router.back()})}><Text style={styles.skipText}>Confirm full settlement</Text></MotionPressable><MotionPressable style={styles.skipButton} onPress={()=>setBillReview(null)}><Text style={styles.skipText}>Cancel confirmation</Text></MotionPressable></View>}
          </>
        )}
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

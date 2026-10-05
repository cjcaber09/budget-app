import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Image, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddTransaction } from '../../../src/hooks/useTransactions';
import { useOcrScan } from '../../../src/hooks/useOcr';
import { useUiStore } from '../../../src/stores/useUiStore';
import { useScanStore, type PendingScanImage } from '../../../src/stores/useScanStore';
import { useToastStore } from '../../../src/stores/useToastStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { pageLayout } from '../../../src/styles/pageLayout';
import { MAX_OCR_TEXT_CHARS } from '../../../supabase/functions/ocr/shared';

function showToast(message: string) {
  useToastStore.getState().showToast(message);
}

// Tab screens stay mounted between visits, so all per-visit state lives in
// NewTransactionContent, remounted for every `visit` id the FAB navigates with.
// The pending image is only used when it was picked for this visit.
export default function NewTransactionScreen() {
  const { visit } = useLocalSearchParams<{ visit?: string }>();
  const pendingImage = useScanStore((state) => state.pendingImage);
  const scanImage = pendingImage && pendingImage.requestId === visit ? pendingImage : null;

  return <NewTransactionContent key={visit ?? 'direct'} scanImage={scanImage} />;
}

function NewTransactionContent({ scanImage: initialScanImage }: { scanImage: PendingScanImage | null }) {
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: addTransaction } = useAddTransaction(selectedMonth);
  const { mutate: runOcr } = useOcrScan();

  // Captured once per visit: the effect below clears the store, which turns the
  // parent's prop to null — the preview and scan must survive that. The ref
  // keeps a StrictMode double-effect from starting a second scan.
  const [scanImage] = useState(initialScanImage);
  const [isScanning, setIsScanning] = useState(scanImage !== null);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const scanStartedRef = useRef(false);

  useEffect(() => {
    if (!scanImage || scanStartedRef.current) return;
    scanStartedRef.current = true;
    useScanStore.getState().clearPendingImage();

    runOcr(
      { base64: scanImage.base64, mimeType: scanImage.mimeType, requestId: scanImage.requestId },
      {
        onSuccess: (result) => {
          if (result.truncated) {
            showToast(`That text was long — kept the first ${MAX_OCR_TEXT_CHARS.toLocaleString('en-US')} characters.`);
          } else if (!result.text.trim()) {
            showToast('No text found in that image.');
          }
          if (result.text.trim()) setPrefillNote(result.text);
          setIsScanning(false);
        },
        // The error toast comes from the global MutationCache handler.
        onError: () => setIsScanning(false),
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
    <ScrollView contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        {scanImage && <Image source={{ uri: scanImage.uri }} style={styles.preview} />}
        {isScanning ? (
          <View style={styles.scanning}>
            <ActivityIndicator />
            <Text style={styles.scanningText}>Reading text…</Text>
            <Pressable style={styles.skipButton} onPress={() => setIsScanning(false)}>
              <Text style={styles.skipText}>Skip — enter manually</Text>
            </Pressable>
          </View>
        ) : (
          <TransactionForm
            categories={categories}
            initialValues={prefillNote ? { note: prefillNote } : undefined}
            submitLabel="Add Transaction"
            onSubmit={({ type, categoryId, amount, note }) => {
              addTransaction(
                { type, categoryId, amount, note, occurredAt: new Date().toISOString() },
                { onSuccess: () => router.back() }
              );
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  scanning: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  scanningText: { color: '#666' },
  skipButton: { paddingVertical: 8, paddingHorizontal: 12 },
  skipText: { color: '#2196F3', fontWeight: '600' },
});

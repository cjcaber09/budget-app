import { View, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddTransaction } from '../../../src/hooks/useTransactions';
import { useUiStore } from '../../../src/stores/useUiStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { pageLayout } from '../../../src/styles/pageLayout';

// `photoUri` arrives as a URL query param, so it's reachable via any
// deep link to this route, not just our own camera flow (e.g.
// budgetmanagement://transaction/new?photoUri=https://evil.example/x).
// Only render it as an <Image> if it's a device-local URI scheme our
// own image picker would actually produce -- never a remote http(s)
// URL, which would let a crafted link make the viewer's device fetch
// an attacker-chosen resource.
const SAFE_LOCAL_URI_PREFIXES = ['file:', 'content:', 'blob:', 'ph:', 'assets-library:'];

function isSafeLocalImageUri(uri: string): boolean {
  return SAFE_LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

export default function NewTransactionScreen() {
  const router = useRouter();
  const { photoUri } = useLocalSearchParams<{ photoUri?: string }>();
  const showPhotoPreview = !!photoUri && isSafeLocalImageUri(photoUri);
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: addTransaction } = useAddTransaction(selectedMonth);

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
        {/* Preview only for now -- the photo isn't uploaded/saved with the
            transaction yet (no receipt storage/column exists). */}
        {showPhotoPreview && <Image source={{ uri: photoUri }} style={styles.preview} />}
        <TransactionForm
          categories={categories}
          submitLabel="Add Transaction"
          onSubmit={({ type, categoryId, amount, note }) => {
            addTransaction(
              { type, categoryId, amount, note, occurredAt: new Date().toISOString() },
              { onSuccess: () => router.back() }
            );
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
});

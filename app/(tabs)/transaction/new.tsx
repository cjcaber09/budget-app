import { View, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddTransaction } from '../../../src/hooks/useTransactions';
import { useUiStore } from '../../../src/stores/useUiStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { pageLayout } from '../../../src/styles/pageLayout';

export default function NewTransactionScreen() {
  const router = useRouter();
  const { photoUri } = useLocalSearchParams<{ photoUri?: string }>();
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
        {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}
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

import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddTransaction } from '../../../src/hooks/useTransactions';
import { useUiStore } from '../../../src/stores/useUiStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { pageLayout } from '../../../src/styles/pageLayout';

export default function NewTransactionScreen() {
  const router = useRouter();
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
        <TransactionForm
          categories={categories}
          submitLabel="Add Transaction"
          onSubmit={({ categoryId, amount, note }) => {
            addTransaction(
              { categoryId, amount, note, occurredAt: new Date().toISOString() },
              { onSuccess: () => router.back() }
            );
          }}
        />
      </View>
    </ScrollView>
  );
}

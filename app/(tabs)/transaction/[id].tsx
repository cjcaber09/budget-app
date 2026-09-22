import { View, ScrollView, ActivityIndicator, Pressable, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useUpdateTransaction, useDeleteTransaction } from '../../../src/hooks/useTransactions';
import { useUiStore } from '../../../src/stores/useUiStore';
import { TransactionForm } from '../../../src/components/TransactionForm';
import { pageLayout } from '../../../src/styles/pageLayout';

export default function EditTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    categoryId: string;
    amount: string;
    note: string;
    occurredAt: string;
  }>();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: updateTransaction } = useUpdateTransaction(selectedMonth);
  const { mutate: deleteTransaction } = useDeleteTransaction(selectedMonth);

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
          initialValues={{ categoryId: params.categoryId, amount: params.amount, note: params.note }}
          submitLabel="Save Changes"
          onSubmit={({ categoryId, amount, note }) => {
            updateTransaction(
              { id: params.id, categoryId, amount, note, occurredAt: params.occurredAt },
              { onSuccess: () => router.back() }
            );
          }}
        />
        <Pressable
          style={styles.deleteButton}
          onPress={() => deleteTransaction(params.id, { onSuccess: () => router.back() })}
        >
          <Text style={styles.deleteText}>Delete Transaction</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  deleteButton: { padding: 16, alignItems: 'center' },
  deleteText: { color: '#D32F2F', fontWeight: '600' },
});

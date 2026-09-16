import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useUiStore } from '../../src/stores/useUiStore';
import { TransactionListItem } from '../../src/components/TransactionListItem';

export default function TransactionsScreen() {
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: transactions } = useTransactions(selectedMonth);

  return (
    <View style={styles.container}>
      <FlatList
        data={transactions ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            category={(categories ?? []).find((c) => c.id === item.category_id)}
            onPress={() =>
              router.push({
                pathname: '/transaction/[id]',
                params: {
                  id: item.id,
                  categoryId: item.category_id,
                  amount: String(item.amount),
                  note: item.note ?? '',
                  occurredAt: item.occurred_at,
                },
              })
            }
          />
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/transaction/new')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});

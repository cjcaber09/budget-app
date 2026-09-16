import { ScrollView, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useBudgets } from '../../src/hooks/useBudgets';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useUiStore } from '../../src/stores/useUiStore';
import { sumTransactionsForCategory, computeBudgetStatus } from '../../src/domain/budgetMath';
import { CategoryProgressBar } from '../../src/components/CategoryProgressBar';
import { AlertBanner } from '../../src/components/AlertBanner';

export default function OverviewScreen() {
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets(selectedMonth);
  const { data: transactions } = useTransactions(selectedMonth);

  const rows = (categories ?? []).map((category) => {
    const budget = (budgets ?? []).find((b) => b.category_id === category.id);
    const spent = sumTransactionsForCategory(transactions ?? [], category.id);
    const status = computeBudgetStatus(budget?.amount ?? 0, spent);
    return { category, status };
  });

  const overBudgetRows = rows.filter((row) => row.status.status === 'over');

  return (
    <ScrollView style={styles.container}>
      {overBudgetRows.map((row) => (
        <AlertBanner key={row.category.id} message={`${row.category.name} is over budget`} />
      ))}
      {/* `/budget/[id]` and `/transaction/new` don't exist as route files yet
          (added in Tasks 23/21), so expo-router's generated typed-routes
          union doesn't include them yet. These casts are safe now and
          become redundant (not incorrect) once those routes land. */}
      {rows.map((row) => (
        <Pressable
          key={row.category.id}
          onPress={() => router.push(`/budget/${row.category.id}` as Href)}
        >
          <CategoryProgressBar categoryName={row.category.name} status={row.status} />
        </Pressable>
      ))}
      <Pressable style={styles.fab} onPress={() => router.push('/transaction/new' as Href)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </ScrollView>
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

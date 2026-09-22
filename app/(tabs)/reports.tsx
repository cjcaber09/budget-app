import { ScrollView, Text, StyleSheet } from 'react-native';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useMonthlyTotals } from '../../src/hooks/useMonthlyTotals';
import { useUiStore } from '../../src/stores/useUiStore';
import { SpendByCategoryChart } from '../../src/components/SpendByCategoryChart';
import { MonthlyTrendChart } from '../../src/components/MonthlyTrendChart';

export default function ReportsScreen() {
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: transactions } = useTransactions(selectedMonth);
  const { data: monthlyTotals } = useMonthlyTotals(6);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Spend by Category</Text>
      <SpendByCategoryChart categories={categories ?? []} transactions={transactions ?? []} />
      <Text style={styles.heading}>Last 6 Months</Text>
      <MonthlyTrendChart totals={monthlyTotals ?? []} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
});

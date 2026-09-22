import { ScrollView, View, Text, StyleSheet } from 'react-native';
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.column}>
        <View style={styles.card}>
          <Text style={styles.heading}>Spend by Category</Text>
          <View style={styles.chartWrap}>
            <SpendByCategoryChart categories={categories ?? []} transactions={transactions ?? []} />
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Last 6 Months</Text>
          <View style={styles.chartWrap}>
            <MonthlyTrendChart totals={monthlyTotals ?? []} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { flexGrow: 1, alignItems: 'center', padding: 16 },
  column: { width: '100%', maxWidth: 480, gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
    elevation: 1,
  },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  chartWrap: { alignItems: 'center' },
});

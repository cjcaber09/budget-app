import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useMonthlyTotals } from '../../src/hooks/useMonthlyTotals';
import { useUiStore } from '../../src/stores/useUiStore';
import { SpendByCategoryChart } from '../../src/components/SpendByCategoryChart';
import { MonthlyTrendChart } from '../../src/components/MonthlyTrendChart';
import { pageLayout } from '../../src/styles/pageLayout';

export default function ReportsScreen() {
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: transactions } = useTransactions(selectedMonth);
  const { data: monthlyTotals } = useMonthlyTotals(6);

  return (
    <ScrollView style={styles.container} contentContainerStyle={pageLayout.scrollContent}>
      <View style={styles.column}>
        <View style={pageLayout.card}>
          <Text style={styles.heading}>Spend by Category</Text>
          <View style={styles.chartWrap}>
            <SpendByCategoryChart categories={categories ?? []} transactions={transactions ?? []} />
          </View>
        </View>
        <View style={pageLayout.card}>
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
  column: { width: '100%', maxWidth: 480, gap: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  chartWrap: { alignItems: 'center' },
});

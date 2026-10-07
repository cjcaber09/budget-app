import { ScrollView, View, Text } from 'react-native';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useMonthlyTotals } from '../../src/hooks/useMonthlyTotals';
import { useUiStore } from '../../src/stores/useUiStore';
import { SpendByCategoryChart } from '../../src/components/SpendByCategoryChart';
import { MonthlyTrendChart } from '../../src/components/MonthlyTrendChart';
import { ScreenHeading } from '../../src/components/ScreenHeading';
import { MonthPicker } from '../../src/components/MonthPicker';
import { QueryState } from '../../src/components/QueryState';
import { usePageLayout } from '../../src/styles/pageLayout';
import { createThemedStyles, type } from '../../src/styles/theme';

export default function ReportsScreen() {
  const styles = useStyles();
  const pageLayout = usePageLayout({ safeTop: true });
  const selectedMonth = useUiStore(state => state.selectedMonth);
  const categories = useCategories();
  const transactions = useTransactions(selectedMonth);
  const monthlyTotals = useMonthlyTotals(6);
  return <ScrollView style={pageLayout.screen} contentContainerStyle={pageLayout.scrollContent}><View style={pageLayout.workspace}>
    <ScreenHeading title="Reports" description="Find the patterns behind your spending." action={<MonthPicker />} />
    <View style={styles.columns}>
      <View style={pageLayout.section}><Text accessibilityRole="header" style={styles.heading}>Last 6 Months</Text><Text style={styles.caption}>Monthly expenses, including the current month.</Text><QueryState loading={monthlyTotals.isPending} error={monthlyTotals.isError} retry={() => void monthlyTotals.refetch()}><MonthlyTrendChart totals={monthlyTotals.data ?? []} /></QueryState></View>
      <View style={pageLayout.section}><Text accessibilityRole="header" style={styles.heading}>Spend by Category</Text><Text style={styles.caption}>A breakdown of your selected month.</Text><QueryState loading={categories.isPending || transactions.isPending} error={categories.isError || transactions.isError} retry={() => { void categories.refetch(); void transactions.refetch(); }}><SpendByCategoryChart categories={categories.data ?? []} transactions={transactions.data ?? []} /></QueryState></View>
    </View>
  </View></ScrollView>;
}
const useStyles = createThemedStyles(colors => ({
  columns: { gap: 24 },
  heading: { ...type.heading, color: colors.text }, caption: { ...type.body, color: colors.muted, marginTop: 4 },
}));

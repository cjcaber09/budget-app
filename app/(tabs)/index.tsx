import { formatMoney } from '../../src/domain/money';
import { View, ScrollView, Text } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Plus } from 'lucide-react-native';
import { useCategories } from '../../src/hooks/useCategories';
import { useBudgets } from '../../src/hooks/useBudgets';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useUiStore } from '../../src/stores/useUiStore';
import { sumTransactionsForCategory, sumTransactionsByType, computeBudgetStatus } from '../../src/domain/budgetMath';
import { CategoryBudgetRow } from '../../src/components/CategoryBudgetRow';
import { AlertBanner } from '../../src/components/AlertBanner';
import { SpendByCategoryChart } from '../../src/components/SpendByCategoryChart';
import { ScreenHeading } from '../../src/components/ScreenHeading';
import { MonthPicker } from '../../src/components/MonthPicker';
import { MotionPressable } from '../../src/components/MotionPressable';
import { QueryState } from '../../src/components/QueryState';
import { usePageLayout } from '../../src/styles/pageLayout';
import { createThemedStyles, type, useColors } from '../../src/styles/theme';
import { useDashboard } from '../../src/hooks/useDashboard';
import { SpendingGuidance } from '../../src/components/SpendingGuidance';
import { usePreferencesStore } from '../../src/stores/usePreferencesStore';

export default function OverviewScreen() {
  const router = useRouter();
  const styles = useStyles();
  const pageLayout = usePageLayout({ safeTop: true });
  const colors = useColors();
  const compact = true;
  const selectedMonth = useUiStore(state => state.selectedMonth);
  const dashboard=useDashboard(selectedMonth);const dashboardEnabled=usePreferencesStore(s=>s.ready);
  const categoriesQuery = useCategories();
  const budgetsQuery = useBudgets(selectedMonth);
  const transactionsQuery = useTransactions(selectedMonth);
  const categories = categoriesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const rows = categories.map(category => {
    const budget = (budgetsQuery.data ?? []).find(b => b.category_id === category.id);
    return { category, status: computeBudgetStatus(budget?.amount ?? 0, dashboard.data ? (dashboard.data.categoryTotals.find(c=>c.id===category.id)?.spent??0)/100 : sumTransactionsForCategory(transactions, category.id)) };
  });
  const income = dashboard.data ? dashboard.data.incomeCents/100 : sumTransactionsByType(transactions, 'income');
  const expenses = dashboard.data ? dashboard.data.expenseCents/100 : sumTransactionsByType(transactions, 'expense');
  const loading = categoriesQuery.isPending || budgetsQuery.isPending || transactionsQuery.isPending || (dashboardEnabled&&dashboard.isPending);
  const error = categoriesQuery.isError || budgetsQuery.isError || transactionsQuery.isError || (dashboardEnabled&&dashboard.isError);
  const totalBudget = rows.reduce((total, row) => total + row.status.budgeted, 0);
  return <ScrollView style={pageLayout.screen} contentContainerStyle={pageLayout.scrollContent}>
    <View style={pageLayout.workspace}>
      <ScreenHeading title="Overview" description="A little clarity for your month." action={<MonthPicker />} />
      <QueryState loading={loading} error={error} retry={() => { void categoriesQuery.refetch(); void budgetsQuery.refetch(); void transactionsQuery.refetch();void dashboard.refetch(); }}>
        {dashboard.data&&<SpendingGuidance key={selectedMonth} snapshot={dashboard.data}/>}
        <View style={[styles.summary, compact && styles.compactSummary]}>
          <View style={styles.summaryCell}>
            <View style={styles.summaryLabelRow}><ArrowDownLeft size={17} color={colors.success} /><Text style={styles.label}>Income</Text></View>
            <Text style={[styles.amount, compact && styles.compactAmount, { color: colors.success }]}>{formatMoney(income)}</Text>
            <Text style={styles.caption}>Money coming in</Text>
          </View>
          <View style={styles.summaryCell}>
            <View style={styles.summaryLabelRow}><ArrowUpRight size={17} color={colors.muted} /><Text style={styles.label}>Expenses</Text></View>
            <Text style={[styles.amount, compact && styles.compactAmount]}>{formatMoney(expenses)}</Text>
            <Text style={styles.caption}>Money going out</Text>
          </View>
          <View style={[styles.summaryCell, compact && styles.netCell]}>
            <Text style={styles.label}>Net income</Text>
            <Text style={[styles.amount, compact && styles.compactAmount]}>{formatMoney((income - expenses))}</Text>
            {!compact && <Text style={styles.caption}>Income minus expenses</Text>}
          </View>
        </View>
        <View style={styles.columns}>
          <View style={[pageLayout.section]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}><Text accessibilityRole="header" style={styles.heading}>Budgets</Text><Text style={styles.caption}>Your plan, category by category.</Text></View>
              <Text style={styles.count}>{rows.length} categories</Text>
            </View>
            {rows.filter(row => row.status.spent > row.status.budgeted).map(row => <AlertBanner key={row.category.id} message={`${row.category.name} is over budget`} />)}
            {rows.length === 0 ? <QueryState empty="Start with a category, then give it a monthly budget.">
              <MotionPressable style={styles.textAction} onPress={() => router.push('/category/new')}><Plus size={16} color={colors.primary} /><Text style={styles.actionLabel}>Add Category</Text></MotionPressable>
            </QueryState> : rows.map(row => <MotionPressable key={row.category.id} accessibilityLabel={`Edit ${row.category.name} budget`} onPress={() => router.push(`/budget/${row.category.id}` as Href)}>
              <CategoryBudgetRow categoryName={row.category.name} categoryColor={row.category.color} status={row.status} />
            </MotionPressable>)}
            <View style={styles.budgetFooter}><Text style={styles.caption}>Category allocations</Text><Text style={styles.footerAmount}>{formatMoney(totalBudget)}</Text></View>
          </View>
          <View style={[pageLayout.section]}>
            <Text accessibilityRole="header" style={styles.heading}>Expenses by Category</Text>
            <Text style={styles.caption}>Where your money went this month.</Text>
            <SpendByCategoryChart categories={categories} transactions={transactions} totals={dashboard.data?.categoryTotals}/>
            <MotionPressable style={styles.reportLink} onPress={() => router.push('/reports')}><Text style={styles.actionLabel}>View reports</Text><ChevronRight size={16} color={colors.primary} /></MotionPressable>
          </View>
        </View>
      </QueryState>
    </View>
  </ScrollView>;
}
const useStyles = createThemedStyles(colors => ({
  summary: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surfaceAlt, borderRadius: 16, padding: 24, columnGap: 28, rowGap: 24 },
  summaryCell: { flex: 1, minWidth: 120, gap: 8 },
  compactSummary: { padding: 20, columnGap: 16, rowGap: 20 },
  compactAmount: { fontSize: 24, letterSpacing: -0.5 },
  netCell: { flexBasis: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  summaryLabelRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  label: { ...type.label, color: colors.muted },
  amount: { ...type.number, fontSize: 32, letterSpacing: -0.9, color: colors.text },
  caption: { ...type.label, fontWeight: '400', color: colors.muted },
  columns: { gap: 24 },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 },
  sectionCopy: { gap: 4 }, heading: { ...type.heading, color: colors.text },
  count: { ...type.label, fontWeight: '400', color: colors.muted },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, gap: 16 },
  footerAmount: { ...type.number, fontSize: 14, color: colors.text },
  reportLink: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, marginTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
  actionLabel: { ...type.label, color: colors.primary },
  textAction: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 },
}));

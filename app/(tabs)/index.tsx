import { createRequestId } from '../../src/domain/ocr';
import { formatMoney } from '../../src/domain/money';
import { View, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from 'lucide-react-native';
import { useCategories } from '../../src/hooks/useCategories';
import { useBudgets } from '../../src/hooks/useBudgets';
import { useUiStore } from '../../src/stores/useUiStore';
import { computeBudgetStatus } from '../../src/domain/budgetMath';
import { AlertBanner } from '../../src/components/AlertBanner';
import { ScreenHeading } from '../../src/components/ScreenHeading';
import { MonthPicker } from '../../src/components/MonthPicker';
import { MotionPressable } from '../../src/components/MotionPressable';
import { QueryState } from '../../src/components/QueryState';
import { usePageLayout } from '../../src/styles/pageLayout';
import { createThemedStyles, type, useColors } from '../../src/styles/theme';
import { useDashboard } from '../../src/hooks/useDashboard';
import { SpendingGuidance } from '../../src/components/SpendingGuidance';
import { UpcomingBillsBell } from '../../src/components/UpcomingBillsBell';

export default function OverviewScreen() {
  const router = useRouter();
  const styles = useStyles();
  const pageLayout = usePageLayout({ safeTop: true });
  const colors = useColors();
  const compact = true;
  const selectedMonth = useUiStore(state => state.selectedMonth);
  const dashboard=useDashboard(selectedMonth);
  const categoriesQuery = useCategories();
  const budgetsQuery = useBudgets(selectedMonth);
  const categories = categoriesQuery.data ?? [];
  const rows = categories.map(category => {
    const budget = (budgetsQuery.data ?? []).find(b => b.category_id === category.id);
    return { category, status: computeBudgetStatus(budget?.amount ?? 0, (dashboard.data?.categoryTotals.find(c=>c.id===category.id)?.spent??0)/100) };
  });
  const income = (dashboard.data?.incomeCents ?? 0) / 100;
  const expenses = (dashboard.data?.expenseCents ?? 0) / 100;
  const loading = dashboard.isPending;
  const error = dashboard.isError;
  return <ScrollView style={pageLayout.screen} contentContainerStyle={pageLayout.scrollContent}>
    <View style={pageLayout.workspace}>
      <ScreenHeading title="Overview" description="A little clarity for your month." action={<UpcomingBillsBell query={dashboard}/>} />
      <QueryState loading={categoriesQuery.isPending || budgetsQuery.isPending} error={categoriesQuery.isError || budgetsQuery.isError} retry={() => { void categoriesQuery.refetch(); void budgetsQuery.refetch(); }}>
        {!dashboard.isPending && !dashboard.isError && rows.filter(row => row.status.spent > row.status.budgeted).map(row => <MotionPressable key={row.category.id} accessibilityLabel={`View ${row.category.name} budget`} onPress={() => router.push({pathname:'/budget/[categoryId]',params:{categoryId:row.category.id,visit:createRequestId()}})}><AlertBanner message={`${row.category.name} is over budget`} /></MotionPressable>)}
      </QueryState>
      <View style={styles.monthPicker}><MonthPicker /></View>
      <QueryState loading={loading} error={error} retry={() => { void dashboard.refetch(); }}>
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
      </QueryState>

      <MotionPressable style={styles.reportLink} onPress={() => router.push('/reports')}><Text style={styles.actionLabel}>View reports</Text><ChevronRight size={16} color={colors.primary} /></MotionPressable>
    </View>
  </ScrollView>;
}
const useStyles = createThemedStyles(colors => ({
  monthPicker: { alignItems: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surfaceAlt, borderRadius: 16, padding: 24, columnGap: 28, rowGap: 24 },
  summaryCell: { flex: 1, minWidth: 120, gap: 8 },
  compactSummary: { padding: 20, columnGap: 16, rowGap: 20 },
  compactAmount: { fontSize: 24, letterSpacing: -0.5 },
  netCell: { flexBasis: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  summaryLabelRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  label: { ...type.label, color: colors.muted },
  amount: { ...type.number, fontSize: 32, letterSpacing: -0.9, color: colors.text },
  caption: { ...type.label, fontWeight: '400', color: colors.muted },
  reportLink: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, marginTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
  actionLabel: { ...type.label, color: colors.primary },
}));

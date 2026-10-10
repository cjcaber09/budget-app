import { View, Text, ScrollView, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import type { Category, Budget } from '../types/database';
import type { DashboardSnapshot } from '../domain/spendingGuidance';
import { computeBudgetStatus } from '../domain/budgetMath';
import { createRequestId } from '../domain/ocr';
import { useMoneyCents } from '../domain/money';
import { MotionPressable } from './MotionPressable';
import { createThemedStyles, type, useColors } from '../styles/theme';

export function CategoryBudgetReport({ categories, budgets, snapshot, month }: { categories: Category[]; budgets: Budget[]; snapshot: Pick<DashboardSnapshot,'categoryTotals'|'allocatedCents'>;month?:string }) {
  const styles = useStyles();
  const colors = useColors();
  const money = useMoneyCents();
  const router = useRouter();
  return <View>
    {!categories.length && <View style={styles.empty}><Text style={styles.caption}>Start with a category, then give it a monthly budget.</Text><MotionPressable style={styles.add} onPress={() => router.push({ pathname: '/category/new', params: { visit: createRequestId() } })}><Plus size={16} color={colors.primary}/><Text style={styles.action}>Add Category</Text></MotionPressable></View>}
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.row}>{categories.map(category => {
      const budget = Math.round((budgets.find(b => b.category_id === category.id)?.amount ?? 0)*100);
      const spent = snapshot.categoryTotals.find(c => c.id === category.id)?.spent ?? 0;
      const status = computeBudgetStatus(budget, spent);
      const hasBudget = budget > 0;
      const state = !hasBudget ? 'No budget' : spent > budget ? 'Over budget' : spent === budget ? 'Budget reached' : status.status === 'warning' ? 'Nearing limit' : 'On track';
      const stateColor = !hasBudget ? colors.muted : status.status === 'over' ? colors.danger : status.status === 'warning' ? colors.warning : colors.success;
      const progress = hasBudget ? Math.max(0, Math.min(1, status.percentUsed / 100)) : 0;
      // Keep rounded labels on the correct side of the reached-budget threshold.
      const roundedUsage = Math.round(status.percentUsed * 10) / 10;
      const displayedUsage = spent < budget ? Math.min(99.9, roundedUsage) : spent > budget ? Math.max(100.1, roundedUsage) : 100;
      const usage = !hasBudget ? '—' : status.percentUsed > 999 ? '999%+' : status.percentUsed > 0 && status.percentUsed < 1 ? '<1%' : `${displayedUsage}%`;
      const remaining = spent > budget ? `Over by ${money(spent - budget)}` : `Remaining ${money(budget - spent)}`;
      const circumference = 2 * Math.PI * 30;
      return <View key={category.id} style={styles.cell}><MotionPressable style={styles.category} accessibilityLabel={`View ${category.name} budget`} accessibilityHint={`Spent ${money(spent)} of ${money(budget)}. ${state}. ${remaining}.`} onPress={() => router.push({ pathname: '/budget/[categoryId]', params: { categoryId: category.id, visit: createRequestId(),...(month?{month}:{}) } })}>
        <Text style={styles.name} numberOfLines={2}>{category.name}</Text>
        <Text style={styles.remaining}>{hasBudget ? money(budget - spent) : '—'}</Text>
        <View style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width="100%" height="100%" viewBox="0 0 80 80">
            <Circle cx={40} cy={40} r={30} stroke={colors.border} strokeWidth={8} fill="none"/>
            {progress > 0 && <Circle cx={40} cy={40} r={30} stroke={stateColor} strokeWidth={8} fill="none" strokeDasharray={`${circumference * progress} ${circumference}`} transform="rotate(-90 40 40)"/>}
          </Svg>
          <View style={styles.ringLabel}><Text style={[styles.usage, {color:stateColor}]}>{usage}</Text></View>
        </View>
        <Text style={styles.figure}>Budget {money(budget)}</Text>
        <Text style={[styles.state, {color:stateColor}]}>{state}</Text>
      </MotionPressable></View>;
    })}</ScrollView>
    <View style={styles.footer}><Text style={styles.caption}>Category allocations</Text><Text style={styles.amount}>{money(snapshot.allocatedCents)}</Text></View>
  </View>;
}
const useStyles = createThemedStyles(c => ({
  row: { flexDirection: 'row', gap: 12, paddingTop: 16, paddingBottom: 4 },
  cell: { width: 112 }, category: { gap: 6, alignItems: 'center' },
  name: { ...type.label, fontSize: 13, color: c.text, textAlign: 'center', alignSelf: 'stretch', height: 40 },
  ring: { width: 72, height: 72 }, ringLabel: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  usage: { ...type.number, fontSize: 13 }, state: { ...type.label, fontSize: 11, fontWeight: '400', textAlign: 'center' },
  figure: { ...type.number, fontSize: 11, color: c.muted, textAlign: 'center' },
  caption: { ...type.label, fontWeight: '400', fontSize: 12, color: c.muted, textAlign: 'center' },
  remaining: { ...type.number, fontSize: 14, color: c.text, textAlign: 'center', alignSelf: 'stretch' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingTop: 24 }, amount: { ...type.number, color: c.text, fontSize: 15 },
  empty: { paddingVertical: 20, gap: 12 }, add: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }, action: { ...type.label, color: c.primary },
}));

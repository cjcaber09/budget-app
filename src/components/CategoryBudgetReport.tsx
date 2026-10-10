import { View, Text } from 'react-native';
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
    <View style={styles.grid}>{categories.map(category => {
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
        <Text style={styles.name}>{category.name}</Text>
        <View style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width="100%" height="100%" viewBox="0 0 80 80">
            <Circle cx={40} cy={40} r={30} stroke={colors.border} strokeWidth={8} fill="none"/>
            {progress > 0 && <Circle cx={40} cy={40} r={30} stroke={stateColor} strokeWidth={8} fill="none" strokeDasharray={`${circumference * progress} ${circumference}`} transform="rotate(-90 40 40)"/>}
          </Svg>
          <View style={styles.ringLabel}><Text style={[styles.usage, {color:stateColor}]}>{usage}</Text></View>
        </View>
        <Text style={[styles.state, {color:stateColor}]}>{state}</Text>
        <View style={styles.figures}><Text style={styles.caption}>Spent</Text><Text style={styles.figure}>{money(spent)}</Text><Text style={styles.caption}>Budget</Text><Text style={styles.figure}>{money(budget)}</Text></View>
        <Text style={styles.remaining}>{hasBudget ? remaining : 'Set a budget'}</Text>
      </MotionPressable></View>;
    })}</View>
    <View style={styles.footer}><Text style={styles.caption}>Category allocations</Text><Text style={styles.amount}>{money(snapshot.allocatedCents)}</Text></View>
  </View>;
}
const useStyles = createThemedStyles(c => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 24, marginTop: 16 },
  cell: { width: '33.333333%', paddingHorizontal: 6 }, category: { flex: 1, gap: 8, alignItems: 'center' },
  name: { ...type.label, color: c.text, textAlign: 'center', alignSelf: 'stretch', minHeight: 40, flexGrow: 1 },
  ring: { width: '100%', maxWidth: 80, aspectRatio: 1 }, ringLabel: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  usage: { ...type.number, fontSize: 13 }, state: { ...type.label, fontSize: 12, fontWeight: '400', textAlign: 'center', minHeight: 40 },
  figures: { gap: 2, alignSelf: 'stretch' }, figure: { ...type.number, fontSize: 12, color: c.text, textAlign: 'center' },
  caption: { ...type.label, fontWeight: '400', fontSize: 12, color: c.muted, textAlign: 'center' },
  remaining: { ...type.label, fontSize: 12, fontWeight: '400', color: c.muted, textAlign: 'center', alignSelf: 'stretch', minHeight: 40 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingTop: 24 }, amount: { ...type.number, color: c.text, fontSize: 15 },
  empty: { paddingVertical: 20, gap: 12 }, add: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }, action: { ...type.label, color: c.primary },
}));

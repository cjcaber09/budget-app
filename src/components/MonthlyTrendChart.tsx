import { formatMoney } from '../domain/money';
import { View, Text } from 'react-native';
import { format } from 'date-fns';
import type { MonthlyTotal } from '../hooks/useMonthlyTotals';
import { createThemedStyles, type } from '../styles/theme';

// Measured by the available column, never a fixed-width chart that clips on phones.
export function MonthlyTrendChart({ totals }: { totals: MonthlyTotal[] }) {
  const styles = useStyles();
  const maximum = Math.max(...totals.map(entry => entry.total), 1);
  if (!totals.some(entry => entry.total > 0)) return <Text style={styles.empty}>Your spending history will appear as you add expenses.</Text>;
  return <View style={styles.chart}>{totals.map((entry, index) => <View key={entry.month} accessible accessibilityLabel={`${format(new Date(`${entry.month}T12:00:00`), 'MMMM yyyy')}: ${formatMoney(entry.total)}`} style={styles.column}>
    <Text style={styles.amount} numberOfLines={1}>{formatMoney(entry.total,undefined,true)}</Text>
    <View style={styles.track}><View style={[styles.bar, index === totals.length - 1 && styles.current, { height: `${entry.total / maximum * 100}%` as `${number}%` }]} /></View>
    <Text style={styles.month}>{format(new Date(`${entry.month}T12:00:00`), 'MMM')}</Text>
  </View>)}</View>;
}
const useStyles = createThemedStyles(colors => ({
  chart: { flexDirection: 'row', gap: 10, marginTop: 40, alignItems: 'flex-end' }, column: { flex: 1, minWidth: 0, alignItems: 'center', gap: 12 },
  amount: { ...type.number, fontSize: 11, color: colors.muted }, track: { height: 180, width: '72%', backgroundColor: colors.surfaceAlt, borderRadius: 5, justifyContent: 'flex-end', overflow: 'hidden' },
  bar: { backgroundColor: colors.selected, width: '100%', borderRadius: 5 }, current: { backgroundColor: colors.primary },
  month: { ...type.label, fontWeight: '400', color: colors.muted }, empty: { ...type.body, color: colors.muted, textAlign: 'center', paddingVertical: 64 },
}));

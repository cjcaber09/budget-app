import { View, Text } from 'react-native';
import { spendingGuidance, type DashboardSnapshot } from '../domain/spendingGuidance';
import { useMoney } from '../domain/money';
import { useSpendingGuidanceStyles } from '../styles/spendingGuidance';
import { createThemedStyles } from '../styles/theme';

export function DailySpendingPace({ snapshot }: { snapshot: DashboardSnapshot }) {
  const styles = useSpendingGuidanceStyles();
  const chart = useChartStyles();
  const money = useMoney();
  const guidance = spendingGuidance(snapshot);
  if (!guidance.current || guidance.forecast === null || guidance.average === null) return null;
  const maximum = Math.max(guidance.forecast, snapshot.limitCents ?? 0, 1);
  const values = [
    { label: 'Estimated month-end spending', value: guidance.forecast, forecast: true },
    ...(snapshot.limitCents === null ? [] : [{ label: 'Monthly allowance', value: snapshot.limitCents, forecast: false }]),
  ];
  return <View style={styles.section}>
    <View style={styles.headingRow}><Text accessibilityRole="header" style={styles.heading}>Daily Spending Pace</Text>{guidance.pace && <Text style={styles.caption}>{guidance.pace}</Text>}</View>
    <View style={styles.row}><Text style={styles.caption}>Average per calendar day</Text><Text style={styles.number}>{money(guidance.average / 100)}</Text></View>
    {values.map(entry => <View key={entry.label} style={chart.entry} accessible accessibilityLabel={`${entry.label}: ${money(entry.value / 100)}`}>
      <View style={styles.row}><Text style={styles.caption}>{entry.label}</Text><Text style={styles.number}>{money(entry.value / 100)}</Text></View>
      <View style={chart.track}><View style={[chart.bar, entry.forecast ? guidance.pace === 'Over budget' ? chart.over : chart.forecast : chart.allowance, { width: `${entry.value / maximum * 100}%` as `${number}%` }]} /></View>
    </View>)}
    {snapshot.limitCents === null && <Text style={styles.caption}>Set a monthly allowance on Overview to compare your forecast.</Text>}
    <Text style={styles.caption}>An estimate using discretionary spending so far and scheduled bills. Early-month estimates can change quickly.</Text>
  </View>;
}
const useChartStyles = createThemedStyles(c => ({
  entry: { gap: 4 }, track: { height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 }, forecast: { backgroundColor: c.primary }, over: { backgroundColor: c.danger }, allowance: { backgroundColor: c.muted },
}));

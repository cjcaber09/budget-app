import { formatMoney } from '../domain/money';
import { View, Text } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import type { Category, Transaction } from '../types/database';
import { sumTransactionsForCategory } from '../domain/budgetMath';
import { createThemedStyles, type, useColors } from '../styles/theme';

interface Props { categories: Category[]; transactions: Transaction[];totals?:{id:string;spent:number}[] }
export function SpendByCategoryChart({ categories, transactions,totals }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const data = categories.map(category => ({ value: totals ? (totals.find(t=>t.id===category.id)?.spent??0)/100 : sumTransactionsForCategory(transactions, category.id), color: category.color, text: category.name })).filter(slice => slice.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  if (!data.length) return <View style={styles.empty}><Text style={styles.emptyTitle}>A fresh start.</Text><Text style={styles.muted}>Add an expense to see your category breakdown here.</Text></View>;
  return <View style={styles.container}>
    <View accessible accessibilityLabel={data.map(slice => `${slice.text}: ${formatMoney(slice.value)}, ${(slice.value / total * 100).toFixed(0)} percent`).join('. ')} style={styles.chart}>
      <PieChart data={data} donut radius={86} innerRadius={70} innerCircleColor={colors.surface} centerLabelComponent={() => <View style={styles.center}><Text style={styles.centerNumber}>{data.length}</Text><Text style={styles.muted}>categories</Text></View>} />
    </View>
    {data.map(slice => <View key={slice.text} style={styles.legend}><View style={[styles.dot, { backgroundColor: slice.color }]} /><Text style={styles.name}>{slice.text}</Text><Text style={styles.percent}>{Math.round(slice.value / total * 100)}%</Text></View>)}
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  container: { marginTop: 24, gap: 14 }, chart: { alignItems: 'center', marginBottom: 10 },
  center: { alignItems: 'center' }, centerNumber: { ...type.number, color: colors.text, fontSize: 28 },
  muted: { ...type.label, fontWeight: '400', color: colors.muted, textAlign: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { ...type.label, color: colors.text, fontWeight: '400', flex: 1 },
  percent: { ...type.number, color: colors.muted, fontSize: 13 },
  empty: { paddingVertical: 48, gap: 8, alignItems: 'center' },
  emptyTitle: { ...type.heading, color: colors.text },
}));

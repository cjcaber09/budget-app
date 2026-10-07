import { formatMoney } from '../domain/money';
import { View, Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { BudgetStatus } from '../domain/budgetMath';
import { createThemedStyles, type, useColors } from '../styles/theme';

interface Props { categoryName: string; categoryColor: string; status: BudgetStatus }
export function CategoryBudgetRow({ categoryName, categoryColor, status }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const hasBudget = status.budgeted > 0;
  const statusLabel = !hasBudget ? 'Set a budget' : status.spent > status.budgeted ? 'Over budget' : status.spent === status.budgeted ? 'Budget reached' : status.status === 'warning' ? 'Nearing limit' : 'On track';
  const statusColor = !hasBudget ? colors.muted : status.status === 'over' ? colors.danger : status.status === 'warning' ? colors.warning : colors.success;
  const width: `${number}%` = `${Math.max(0, Math.min(status.percentUsed, 100))}%`;
  return <View style={styles.row}>
    <View style={styles.header}><View style={[styles.swatch, { backgroundColor: categoryColor }]} /><Text style={styles.name}>{categoryName}</Text><ChevronRight size={15} color={colors.subtle} /></View>
    <View style={styles.detail}><Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text><Text style={styles.amounts}>{formatMoney(status.spent)} / {formatMoney(status.budgeted)}</Text></View>
    <View style={styles.track}><View style={[styles.fill, { width, backgroundColor: hasBudget ? statusColor : categoryColor }]} /></View>
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  row: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  name: { ...type.body, color: colors.text, fontWeight: '600', flex: 1 },
  detail: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  status: { ...type.label, fontWeight: '400' },
  amounts: { ...type.number, fontWeight: '400', fontSize: 13, color: colors.muted },
  track: { height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
}));

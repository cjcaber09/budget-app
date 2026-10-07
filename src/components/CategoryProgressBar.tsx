import { formatMoney } from '../domain/money';
import { View, Text, StyleSheet } from 'react-native';
import type { BudgetStatus } from '../domain/budgetMath';

interface Props {
  categoryName: string;
  status: BudgetStatus;
}

export const STATUS_COLORS: Record<BudgetStatus['status'], string> = {
  ok: '#4CAF50',
  warning: '#FF9800',
  over: '#D32F2F',
};

export function CategoryProgressBar({ categoryName, status }: Props) {
  const fillWidth: `${number}%` = `${Math.min(status.percentUsed, 100)}%`;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.name}>{categoryName}</Text>
        <Text style={styles.amounts}>
          {formatMoney(status.spent)} / {formatMoney(status.budgeted)}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: fillWidth, backgroundColor: STATUS_COLORS[status.status] }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontWeight: '600' },
  amounts: { color: '#555' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#eee', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});

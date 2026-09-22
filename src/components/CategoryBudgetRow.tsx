import { View, Text, StyleSheet } from 'react-native';
import type { BudgetStatus } from '../domain/budgetMath';
import { STATUS_COLORS } from './CategoryProgressBar';

interface Props {
  categoryName: string;
  categoryColor: string;
  status: BudgetStatus;
}

export function CategoryBudgetRow({ categoryName, categoryColor, status }: Props) {
  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: categoryColor }]} />
      <Text style={styles.name}>{categoryName}</Text>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status.status] }]} />
      <Text style={styles.amounts}>
        ${status.spent.toFixed(2)} / ${status.budgeted.toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  swatch: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  name: { flex: 1, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  amounts: { color: '#555' },
});

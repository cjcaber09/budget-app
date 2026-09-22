import { Pressable, Text, View, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import type { Transaction, Category } from '../types/database';

interface Props {
  transaction: Transaction;
  category: Category | undefined;
  onPress: () => void;
}

export function TransactionListItem({ transaction, category, onPress }: Props) {
  const isIncome = transaction.type === 'income';

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View>
        <Text style={styles.category}>{isIncome ? 'Income' : (category?.name ?? 'Unknown')}</Text>
        {transaction.note ? <Text style={styles.note}>{transaction.note}</Text> : null}
        <Text style={styles.date}>{format(new Date(transaction.occurred_at), 'MMM d')}</Text>
      </View>
      <Text style={[styles.amount, isIncome && styles.amountIncome]}>
        {isIncome ? '+' : '-'}${transaction.amount.toFixed(2)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  category: { fontWeight: '600' },
  note: { color: '#666' },
  date: { color: '#999', fontSize: 12 },
  amount: { fontWeight: '700' },
  amountIncome: { color: '#2E7D32' },
});

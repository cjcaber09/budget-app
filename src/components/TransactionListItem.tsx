import { formatMoney } from '../domain/money';
import { Text, View } from 'react-native';
import { ArrowDownLeft, ShoppingBasket, House, Car, Utensils, Heart, Tag, ChevronRight } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { effectiveDate } from '../domain/transactionDates';
import type { Transaction, Category } from '../types/database';
import { createThemedStyles, type, useColors } from '../styles/theme';
import { MotionPressable } from './MotionPressable';

interface Props { transaction: Transaction; category: Category | undefined; paymentMethodLabel?: string; onPress: () => void }
export function TransactionListItem({ transaction, category, paymentMethodLabel, onPress }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const isIncome = transaction.type === 'income';
  const name = isIncome ? 'Income' : category?.name ?? (transaction.category_id===null?'Uncategorized':'Category unavailable');
  const Icon = isIncome ? ArrowDownLeft : /grocer/i.test(name) ? ShoppingBasket : /rent|home/i.test(name) ? House : /transport/i.test(name) ? Car : /dining|coffee/i.test(name) ? Utensils : /health/i.test(name) ? Heart : Tag;
  return <MotionPressable style={styles.row} onPress={onPress} accessibilityLabel={`Edit ${name}, ${isIncome ? 'income' : 'expense'} ${formatMoney(transaction.amount)}`}>
    <View style={styles.icon}><Icon size={19} strokeWidth={1.6} color={isIncome ? colors.success : category?.color ?? colors.muted} /></View>
    <View style={styles.info}><Text style={styles.category}>{name}</Text>{transaction.note ? <Text style={styles.note} numberOfLines={1}>{transaction.note}</Text> : null}{paymentMethodLabel ? <Text style={styles.note} numberOfLines={1}>{paymentMethodLabel}</Text> : null}<Text style={styles.date}>{format(parseISO(effectiveDate(transaction)), 'MMM d, yyyy')}</Text></View>
    <Text style={[styles.amount, isIncome && styles.amountIncome]}>{isIncome ? '+' : '−'}{formatMoney(transaction.amount)}</Text><ChevronRight size={15} color={colors.subtle} />
  </MotionPressable>;
}
const useStyles = createThemedStyles(colors => ({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2, minWidth: 0 }, category: { ...type.body, fontWeight: '600', color: colors.text },
  note: { ...type.label, fontWeight: '400', color: colors.muted }, date: { ...type.label, fontWeight: '400', fontSize: 12, color: colors.subtle },
  amount: { ...type.number, fontSize: 15, color: colors.text }, amountIncome: { color: colors.success },
}));

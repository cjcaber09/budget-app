import { useMoney } from '../domain/money';
import { Text, View } from 'react-native';
import { ArrowDownLeft, RotateCcw, ShoppingBasket, House, Car, Utensils, Heart, Tag, ChevronRight } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { effectiveDate } from '../domain/transactionDates';
import type { Transaction, Category } from '../types/database';
import { createThemedStyles, type, useColors } from '../styles/theme';
import { MotionPressable } from './MotionPressable';

interface Props { transaction: Transaction; category: Category | undefined; paymentMethodLabel?: string; onPress: () => void }
export function TransactionListItem({ transaction, category, paymentMethodLabel, onPress }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const money=useMoney();const isRefund=transaction.type==='refund';
  const isIncome = transaction.type === 'income';
  const categoryName=category?.name??(transaction.category_id===null?'Uncategorized':'Category unavailable');
  const name=isRefund?'Refund · '+categoryName:isIncome?'Income':categoryName;
  const Icon = isRefund?RotateCcw:isIncome ? ArrowDownLeft : /grocer/i.test(name) ? ShoppingBasket : /rent|home/i.test(name) ? House : /transport/i.test(name) ? Car : /dining|coffee/i.test(name) ? Utensils : /health/i.test(name) ? Heart : Tag;
  return <MotionPressable style={styles.row} onPress={onPress} accessibilityLabel={`Edit ${name}, ${isRefund?'refund':isIncome ? 'income' : 'expense'} ${money(transaction.amount)}`}>
    <View style={styles.icon}><Icon size={19} strokeWidth={1.6} color={isIncome||isRefund ? colors.success : category?.color ?? colors.muted} /></View>
    <View style={styles.info}><Text style={styles.category}>{name}</Text>{transaction.note ? <Text style={styles.note} numberOfLines={1}>{transaction.note}</Text> : null}{paymentMethodLabel ? <Text style={styles.note} numberOfLines={1}>{paymentMethodLabel}</Text> : null}<Text style={styles.date}>{format(parseISO(effectiveDate(transaction)), 'MMM d, yyyy')}</Text></View>
    <Text style={[styles.amount, (isIncome||isRefund) && styles.amountIncome]}>{isIncome||isRefund ? '+' : '−'}{money(transaction.amount)}</Text><ChevronRight size={15} color={colors.subtle} />
  </MotionPressable>;
}
const useStyles = createThemedStyles(colors => ({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2, minWidth: 0 }, category: { ...type.body, fontWeight: '600', color: colors.text },
  note: { ...type.label, fontWeight: '400', color: colors.muted }, date: { ...type.label, fontWeight: '400', fontSize: 12, color: colors.subtle },
  amount: { ...type.number, fontSize: 15, color: colors.text }, amountIncome: { color: colors.success },
}));

import {useDateFormatter} from '../hooks/useDateFormatter';
import { useMoney } from '../domain/money';
import { Text, View } from 'react-native';
import { ArrowDownLeft, RotateCcw, ShoppingBasket, House, Car, Utensils, Heart, Tag, ChevronRight } from 'lucide-react-native';

import { effectiveDate } from '../domain/transactionDates';
import type { Transaction, Category } from '../types/database';
import { createThemedStyles, type, useColors } from '../styles/theme';
import { MotionPressable } from './MotionPressable';
import {ActivityBalanceChange} from './ActivityBalanceChange';
import type {ActivityBalance} from '../domain/activityBalances';

interface Props { transaction: Transaction; category: Category | undefined; paymentMethodLabel?: string; balance?:ActivityBalance; onPress: () => void }
const categoryIcons = [[/grocer/i,ShoppingBasket],[/rent|home/i,House],[/transport/i,Car],[/dining|coffee/i,Utensils],[/health/i,Heart]] as const;
function transactionPresentation(transaction:Transaction,category:Category|undefined) {
  const categoryName=category?.name??(transaction.category_id===null?'Uncategorized':'Category unavailable');
  if(transaction.type==='refund')return {name:'Refund · '+categoryName,entryType:'refund',positive:true,Icon:RotateCcw};
  if(transaction.type==='income')return {name:'Income',entryType:'income',positive:true,Icon:ArrowDownLeft};
  return {name:categoryName,entryType:'expense',positive:false,Icon:categoryIcons.find(([pattern])=>pattern.test(categoryName))?.[1]??Tag};
}
export function TransactionListItem({ transaction, category, paymentMethodLabel, balance, onPress }: Readonly<Props>) {
  const styles = useStyles();
 const dateLabel=useDateFormatter();
  const colors = useColors();
  const money=useMoney();
  const {name,entryType,positive,Icon}=transactionPresentation(transaction,category);
  return <View style={styles.container}><MotionPressable style={styles.row} onPress={onPress} accessibilityLabel={`Edit ${name}, ${entryType} ${money(transaction.amount)}`}>
    <View style={styles.icon}><Icon size={19} strokeWidth={1.6} color={positive ? colors.success : category?.color ?? colors.muted} /></View>
    <View style={styles.info}><Text style={styles.category}>{name}</Text>{transaction.note ? <Text style={styles.note} numberOfLines={1}>{transaction.note}</Text> : null}{paymentMethodLabel ? <Text style={styles.note} numberOfLines={1}>{paymentMethodLabel}</Text> : null}<Text style={styles.date}>{dateLabel(effectiveDate(transaction))}</Text></View>
    <Text style={[styles.amount, positive && styles.amountIncome]}>{positive ? '+' : '−'}{money(transaction.amount)}</Text><ChevronRight size={15} color={colors.subtle} />
  </MotionPressable>{balance&&<View style={{paddingBottom:18}}><ActivityBalanceChange balance={balance} compact/></View>}</View>;
}
const useStyles = createThemedStyles(colors => ({
  container:{borderBottomWidth:1,borderBottomColor:colors.border},
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2, minWidth: 0 }, category: { ...type.body, fontWeight: '600', color: colors.text },
  note: { ...type.label, fontWeight: '400', color: colors.muted }, date: { ...type.label, fontWeight: '400', fontSize: 12, color: colors.subtle },
  amount: { ...type.number, fontSize: 15, color: colors.text }, amountIncome: { color: colors.success },
}));

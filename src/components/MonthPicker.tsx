import { Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react-native';
import { addMonths, format, parseISO } from 'date-fns';
import { useUiStore } from '../stores/useUiStore';
import { createThemedStyles, type, useColors } from '../styles/theme';
import { MotionPressable } from './MotionPressable';

export function MonthPicker({value,onChange,minMonth,maxMonth}:{value?:string;onChange?:(month:string)=>void;minMonth?:string;maxMonth?:string}={}) {
  const selectedMonth = useUiStore(state => state.selectedMonth);
  const month=value??selectedMonth;
  const setMonth = useUiStore(state => state.setSelectedMonth);
  const styles = useStyles();
  const colors = useColors();
  const date = parseISO(month);
  function step(amount: number) { const next=format(addMonths(date, amount), 'yyyy-MM-01');if((minMonth&&next<minMonth)||(maxMonth&&next>maxMonth))return;(onChange??setMonth)(next); }
  return <View style={styles.container}>
    <MotionPressable accessibilityLabel="Previous month" disabled={!!minMonth&&month<=minMonth} style={styles.arrow} onPress={() => step(-1)}><ChevronLeft size={17} color={colors.muted} /></MotionPressable>
    <View style={styles.label}><CalendarDays size={15} color={colors.muted} /><Text style={styles.text}>{format(date, 'MMMM yyyy')}</Text></View>
    <MotionPressable accessibilityLabel="Next month" disabled={!!maxMonth&&month>=maxMonth} style={styles.arrow} onPress={() => step(1)}><ChevronRight size={17} color={colors.muted} /></MotionPressable>
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  container: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { ...type.label, color: colors.text, minWidth: 110, textAlign: 'center' },
}));

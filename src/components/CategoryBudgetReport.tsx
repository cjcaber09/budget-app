import { View, Text, ScrollView, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Plus, ShoppingBasket, House, Car, Utensils, Heart, Zap, ShoppingBag, GraduationCap, Clapperboard, Tag } from 'lucide-react-native';
import type { Category, Budget } from '../types/database';
import type { DashboardSnapshot } from '../domain/spendingGuidance';
import { computeBudgetStatus } from '../domain/budgetMath';
import { createRequestId } from '../domain/ocr';
import { useMoneyCents } from '../domain/money';
import { MotionPressable } from './MotionPressable';
import { cardElevation, createThemedStyles, type, useColors } from '../styles/theme';

export function CategoryBudgetReport({ categories, budgets, snapshot, month, hideZeroValues=false }: { categories: Category[]; budgets: Budget[]; snapshot: Pick<DashboardSnapshot,'categoryTotals'|'allocatedCents'>;month?:string;hideZeroValues?:boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const money = useMoneyCents();
  const router = useRouter();
  const visible=hideZeroValues?categories.filter(c=>(snapshot.categoryTotals.find(t=>t.id===c.id)?.spent??0)!==0||Math.round((budgets.find(b=>b.category_id===c.id)?.amount??0)*100)!==0):categories;
  return <View>
    {!categories.length && <View style={styles.empty}><Text style={styles.caption}>Start with a category, then give it a monthly budget.</Text><MotionPressable style={styles.add} onPress={() => router.push({ pathname: '/category/new', params: { visit: createRequestId() } })}><Plus size={16} color={colors.primary}/><Text style={styles.action}>Add Category</Text></MotionPressable></View>}
    {categories.length>0&&!visible.length&&<Text style={styles.caption}>No nonzero category amounts. Turn off Hide zero values to show all categories.</Text>}
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.row}>{visible.map(category => {
      const budget = Math.round((budgets.find(b => b.category_id === category.id)?.amount ?? 0)*100);
      const spent = snapshot.categoryTotals.find(c => c.id === category.id)?.spent ?? 0;
      const status = computeBudgetStatus(budget, spent);
      const hasBudget = budget > 0;
      const state = spent<0?'Net refunds':!hasBudget ? 'No budget' : spent > budget ? 'Over budget' : spent === budget ? 'Budget reached' : status.status === 'warning' ? 'Nearing limit' : 'On track';
      const stateColor = !hasBudget ? colors.muted : status.status === 'over' ? colors.danger : status.status === 'warning' ? colors.warning : colors.success;
      const stateBackground = spent<0||!hasBudget ? colors.surfaceAlt : status.status === 'over' ? colors.dangerBg : status.status === 'warning' ? colors.warningBg : colors.successBg;
      const Icon = /grocer|food shop/i.test(category.name) ? ShoppingBasket : /rent|home|housing/i.test(category.name) ? House : /transport|travel|fuel/i.test(category.name) ? Car : /dining|coffee|restaurant/i.test(category.name) ? Utensils : /health|medical/i.test(category.name) ? Heart : /utilit|electric|internet/i.test(category.name) ? Zap : /education|school/i.test(category.name) ? GraduationCap : /entertain|movie/i.test(category.name) ? Clapperboard : /shopping|clothing/i.test(category.name) ? ShoppingBag : Tag;
      const progress = hasBudget ? Math.max(0, Math.min(1, status.percentUsed / 100)) : 0;
      // Keep rounded labels on the correct side of the reached-budget threshold.
      const roundedUsage = Math.round(status.percentUsed * 10) / 10;
      const displayedUsage = spent < budget ? Math.min(99.9, roundedUsage) : spent > budget ? Math.max(100.1, roundedUsage) : 100;
      const usage = spent<0?'Refund':!hasBudget ? '—' : status.percentUsed > 999 ? '999%+' : status.percentUsed > 0 && status.percentUsed < 1 ? '<1%' : `${displayedUsage}%`;
      const remaining = !hasBudget ? 'No remaining budget set' : spent > budget ? `Over by ${money(spent - budget)}` : `Remaining ${money(budget - spent)}`;
      const circumference = 2 * Math.PI * 30;
      return <View key={category.id} style={styles.cell}><MotionPressable style={styles.category} accessibilityLabel={`View ${category.name} budget`} accessibilityHint={`Spent ${money(spent)} of ${money(budget)}. ${state}. ${remaining}.`} onPress={() => router.push({ pathname: '/budget/[categoryId]', params: { categoryId: category.id, visit: createRequestId(),...(month?{month}:{}) } })}>
        <View style={styles.header}>
          <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon size={20} strokeWidth={1.8} color={colors.primary}/></View>
          <Text style={styles.name}>{category.name}</Text>
        </View>
        <View style={styles.balanceRow}>
          <View style={styles.balance}><Text style={[styles.caption,styles.metricLabel]}>{hasBudget && spent > budget ? 'Over by' : 'Remaining'}</Text>
          <Text style={[styles.remaining,hasBudget&&spent>budget&&{color:colors.danger}]}>{hasBudget ? money(Math.abs(budget - spent)) : '—'}</Text></View>
          <View style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width="100%" height="100%" viewBox="0 0 80 80" style={styles.ringGraphic}>
            <Circle cx={40} cy={40} r={30} stroke={colors.border} strokeWidth={8} fill="none"/>
            {progress > 0 && <Circle cx={40} cy={40} r={30} stroke={stateColor} strokeWidth={8} fill="none" strokeDasharray={`${circumference * progress} ${circumference}`} transform="rotate(-90 40 40)"/>}
          </Svg>
          <View style={styles.ringLabel}><Text style={[styles.usage, {color:stateColor}]}>{usage}</Text></View>
          </View>
        </View>
        <View style={[styles.pill,{backgroundColor:stateBackground}]}><Text style={[styles.state, {color:stateColor}]}>{state}</Text></View>
        <View style={styles.figures}>
          <View style={styles.metric}><Text style={[styles.caption,styles.metricLabel]}>Net spent</Text><Text style={styles.figure}>{money(spent)}</Text></View>
          <View style={styles.metric}><Text style={[styles.caption,styles.metricLabel]}>Budget</Text><Text style={styles.figure}>{money(budget)}</Text></View>
        </View>
      </MotionPressable></View>;
    })}</ScrollView>
    <View style={styles.footer}><Text style={styles.caption}>Category allocations</Text><Text style={styles.amount}>{money(snapshot.allocatedCents)}</Text></View>
  </View>;
}
const useStyles = createThemedStyles(c => ({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal:8, paddingTop: 16, paddingBottom: 18 },
  // Let the row measure its cards before stretching them; percentage height
  // creates a circular measurement inside native horizontal ScrollViews.
  cell: { width: 240 }, category: { ...cardElevation(c), gap: 14, padding:16, backgroundColor:c.surface, borderRadius:16, flexGrow:1 },
  header: { flexDirection:'row',alignItems:'center',gap:10 },
  icon: { width:36,height:36,borderRadius:10,backgroundColor:c.surfaceAlt,alignItems:'center',justifyContent:'center' },
  name: { ...type.body, fontSize:15, fontWeight:'600', color:c.text, flex:1 },
  balanceRow: { gap:12 }, balance: { gap:4,minWidth:0 },
  ring: { width:'100%',aspectRatio:1 }, ringLabel: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  ringGraphic: { position:'absolute',inset:0 },
  usage: { ...type.number, fontSize:24 }, state: { ...type.label, fontSize:12, lineHeight:18 },
  pill: { alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:4,borderRadius:20 },
  figures: { flexDirection:'row',gap:12,borderTopWidth:1,borderTopColor:c.border,paddingTop:12,marginTop:'auto' },
  metric: { flex:1,gap:4,minWidth:0 }, figure: { ...type.number,fontSize:14,lineHeight:20,color:c.text },
  metricLabel: { textAlign:'left' },
  caption: { ...type.label, fontWeight: '400', fontSize: 12, color: c.muted, textAlign: 'center' },
  remaining: { ...type.number, fontWeight:'700',fontSize:24,lineHeight:30,letterSpacing:-0.5,color:c.text },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingTop: 24 }, amount: { ...type.number, color: c.text, fontSize: 15 },
  empty: { paddingVertical: 20, gap: 12 }, add: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }, action: { ...type.label, color: c.primary },
}));

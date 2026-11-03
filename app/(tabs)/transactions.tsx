import {useDateFormatter} from '../../src/hooks/useDateFormatter';
import {activityKey} from '../../src/domain/activityPages';
import type {TransactionFilter} from '../../src/domain/csv';
import {useMoney} from '../../src/domain/money';
import { useEffect, useState } from 'react';
import { FlatList, View, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Plus } from 'lucide-react-native';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactionHistory } from '../../src/hooks/useTransactionHistory';
import { usePaymentMethods } from '../../src/hooks/usePaymentMethods';
import { paymentMethodLabel,type PaymentMethod } from '../../src/domain/paymentMethods';
import { useUiStore } from '../../src/stores/useUiStore';
import { TransactionListItem } from '../../src/components/TransactionListItem';
import { ScreenHeading } from '../../src/components/ScreenHeading';
import {UpdateBanner} from '../../src/components/AppUpdates';
import { MonthPicker } from '../../src/components/MonthPicker';
import { QueryState } from '../../src/components/QueryState';
import { MotionPressable } from '../../src/components/MotionPressable';
import { usePageLayout } from '../../src/styles/pageLayout';
import { createThemedStyles, type, useColors } from '../../src/styles/theme';
import { createRequestId } from '../../src/domain/ocr';
import {CsvExport} from '../../src/components/CsvExport';
import {useActivityBalances} from '../../src/hooks/useActivityBalances';
import {balanceActivityKey,transactionBalanceActivity,type BalanceActivity} from '../../src/domain/activityBalances';
import {ActivityBalanceChange,BalanceHistoryRetry} from '../../src/components/ActivityBalanceChange';

function entryCountLabel(count:number,hasMore:boolean|undefined){
 if(hasMore)return 'shown';
 return count===1?'entry':'entries';
}
function historyPaymentLabel(id:string|null|undefined,methods:PaymentMethod[]|undefined){
 if(!id)return 'Cash';
 const method=methods?.find(row=>row.id===id);
 return method?paymentMethodLabel(method):'Saved payment method';
}
function BalanceHistoryStatus({failed,loading,retry}:Readonly<{failed:boolean;loading:boolean;retry:()=>void}>){
 const styles=useStyles();
 if(failed)return <BalanceHistoryRetry onRetry={retry}/>;
 if(loading)return <Text style={styles.caption}>Refreshing balance history…</Text>;
 return null;
}

export default function TransactionsScreen() {
 const dateLabel=useDateFormatter();
  const router = useRouter();
  const money=useMoney();
  const styles = useStyles();
  const pageLayout = usePageLayout({ safeTop: true });
  const colors = useColors();
  const selectedMonth = useUiStore(state => state.selectedMonth);
  const categoriesQuery = useCategories();
  const paymentMethods = usePaymentMethods();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [debouncedSearch,setDebouncedSearch]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setDebouncedSearch(search),250);return()=>clearTimeout(timer);},[search]);
  const transactionsQuery = useTransactionHistory(selectedMonth,filter,debouncedSearch);
  const filtering=search.trim().toLowerCase()!==debouncedSearch.trim().toLowerCase();
  const categories = categoriesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const balances=useActivityBalances(transactions.map(row=>row.type==='transfer'?{kind:'transfer',id:row.id}:transactionBalanceActivity(row)));
  return <View style={pageLayout.screen}><FlatList
    keyboardShouldPersistTaps="handled"
    data={filtering ? [] : transactions}
    initialNumToRender={10}
    maxToRenderPerBatch={10}
    windowSize={5}
    keyExtractor={activityKey}
    contentContainerStyle={[pageLayout.scrollContent, styles.content]}
    ListHeaderComponent={<View style={styles.header}>
      <ScreenHeading title="Transactions" action={<MonthPicker />} />
      <UpdateBanner/>
      <CsvExport month={selectedMonth} kind="transactions" filter={filter} search={search}/>
      <View style={styles.toolbar}>
        <View style={styles.search}><Search size={17} color={colors.muted} /><TextInput accessibilityLabel="Search transactions" value={search} onChangeText={setSearch} maxLength={500} placeholder="Search transactions" placeholderTextColor={colors.subtle} style={styles.searchInput} /></View>
        <View style={styles.filters}>{(['all', 'expense', 'income','refund','transfer'] as const).filter(option=>(option!=='refund'||paymentMethods.refundSupported)&&(option!=='transfer'||paymentMethods.transferEntrySupported)).map(option => <MotionPressable key={option} accessibilityState={{ selected: option === filter }} onPress={() => setFilter(option)} style={[styles.filter, filter === option && styles.activeFilter]}><Text style={[styles.filterText, filter === option && styles.activeFilterText]}>{option === 'all' ? 'All' : option === 'expense' ? 'Expenses' : option==='refund'?'Refunds':option==='transfer'?'Transfers':'Income'}</Text></MotionPressable>)}</View>
      </View>
      <View style={styles.listHeading}><Text style={styles.heading}>Activity</Text><Text style={styles.caption}>{transactions.length} {entryCountLabel(transactions.length,transactionsQuery.hasNextPage)}</Text></View>
      {transactions.length>0&&<View><Text style={styles.caption}>Before and after balances use complete account history. Edits recalculate them.</Text><BalanceHistoryStatus failed={balances.isError} loading={balances.isFetching} retry={()=>void balances.refetch()}/></View>}
    </View>}
    ListEmptyComponent={<View style={styles.empty}><QueryState loading={filtering || transactionsQuery.isPending || categoriesQuery.isPending} error={transactionsQuery.isError || categoriesQuery.isError} retry={() => { void transactionsQuery.refetch(); void categoriesQuery.refetch(); }} empty={search || filter !== 'all' ? 'No matches. Change your search or filter.' : 'No transactions this month.'}>
      {!search && filter === 'all' && <MotionPressable onPress={() => router.push({ pathname: '/transaction/new', params: { visit: createRequestId() } })} style={styles.add}><Plus size={16} color={colors.primary} /><Text style={styles.activeFilterText}>Add Transaction</Text></MotionPressable>}
    </QueryState></View>}
    ListFooterComponent={filtering?null:<View style={styles.footer}>
      {transactionsQuery.isFetchNextPageError&&<Text accessibilityRole="alert" style={styles.caption}>Could not load more. Your entries are still here.</Text>}
      {transactionsQuery.hasNextPage&&<MotionPressable accessibilityLabel="Load more transactions" disabled={transactionsQuery.isFetching} onPress={()=>void transactionsQuery.fetchNextPage()} style={styles.loadMore}><Text style={styles.activeFilterText}>{transactionsQuery.isFetchingNextPage?'Loading…':transactionsQuery.isFetchNextPageError?'Retry load more':'Load more'}</Text></MotionPressable>}
      {transactionsQuery.isRefetchError&&transactions.length>0&&<MotionPressable style={styles.loadMore} onPress={()=>void transactionsQuery.refetch()}><Text style={styles.activeFilterText}>Could not refresh. Retry</Text></MotionPressable>}
    </View>}
    renderItem={({ item }) => {
      const entry:BalanceActivity=item.type==='transfer'?{kind:'transfer',id:item.id}:transactionBalanceActivity(item);
      const balance=balances.isError||balances.isFetching?undefined:balances.data?.get(balanceActivityKey(entry));
      if(item.type==='transfer')return <View style={styles.item}><MotionPressable accessibilityLabel={`Transfer from ${item.source_label} to ${item.destination_label}, ${money(Number(item.amount))} received`} style={{paddingVertical:18,gap:6}} onPress={()=>router.push({pathname:'/transfer/[id]',params:{id:item.id,visit:createRequestId()}})}><Text style={styles.heading}>{item.source_label} → {item.destination_label}</Text><Text style={styles.caption}>{money(Number(item.amount))} received · {dateLabel(item.financial_date!)}{Number(item.fee_amount)>0?` · ${money(Number(item.fee_amount))} fee`:''}</Text>{item.note&&<Text style={styles.caption}>{item.note}</Text>}</MotionPressable>{balance&&<ActivityBalanceChange balance={balance} compact/>}</View>;
      return <View style={styles.item}><TransactionListItem transaction={item} balance={balance} paymentMethodLabel={historyPaymentLabel(item.payment_method_id,paymentMethods.methods)} category={categories.find(category => category.id === item.category_id)} onPress={() => router.push({ pathname: '/transaction/[id]', params: { visit: createRequestId(), id: item.refund_of??item.id, refundId:item.type==='refund'?item.id:undefined, type: item.type, categoryId: item.category_id ?? '', amount: String(item.amount), note: item.note ?? '', occurredAt: item.occurred_at } })} /></View>;
    }}
  /></View>;
}
const useStyles = createThemedStyles(colors => ({
  content: { alignItems: 'stretch', alignSelf: 'center', width: '100%', maxWidth: 560 },
  header: { gap: 28 }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  search: { flex: 1, minWidth: 220, backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 10, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { ...type.body, color: colors.text, paddingVertical: 12, paddingRight: 14, minHeight: 48, flex: 1 },
  filters: { flexWrap:'wrap', flexDirection: 'row', gap: 4, backgroundColor: colors.surfaceAlt, padding: 4, borderRadius: 10 },
  filter: { paddingHorizontal: 12, minHeight: 48, justifyContent: 'center', borderRadius: 7 }, activeFilter: { backgroundColor: colors.surface },
  filterText: { ...type.label, color: colors.muted }, activeFilterText: { ...type.label, color: colors.primary },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  heading: { ...type.heading, color: colors.text }, caption: { ...type.label, color: colors.muted, fontWeight: '400' },
  item: { width: '100%' }, empty: { minHeight: 250 },
  add: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 48, paddingHorizontal: 16 },
  footer:{gap:12,paddingVertical:20},loadMore:{minHeight:48,alignItems:'center',justifyContent:'center',padding:12,borderWidth:1,borderColor:colors.controlBorder,borderRadius:10,backgroundColor:colors.controlBackground},
}));

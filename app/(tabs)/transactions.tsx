import { useEffect, useState } from 'react';
import { FlatList, View, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Plus } from 'lucide-react-native';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactionHistory } from '../../src/hooks/useTransactionHistory';
import { usePaymentMethods } from '../../src/hooks/usePaymentMethods';
import { paymentMethodLabel } from '../../src/domain/paymentMethods';
import { useUiStore } from '../../src/stores/useUiStore';
import { TransactionListItem } from '../../src/components/TransactionListItem';
import { ScreenHeading } from '../../src/components/ScreenHeading';
import { MonthPicker } from '../../src/components/MonthPicker';
import { QueryState } from '../../src/components/QueryState';
import { MotionPressable } from '../../src/components/MotionPressable';
import { usePageLayout } from '../../src/styles/pageLayout';
import { createThemedStyles, type, useColors } from '../../src/styles/theme';
import { createRequestId } from '../../src/domain/ocr';
import {CsvExport} from '../../src/components/CsvExport';

export default function TransactionsScreen() {
  const router = useRouter();
  const styles = useStyles();
  const pageLayout = usePageLayout({ safeTop: true });
  const colors = useColors();
  const selectedMonth = useUiStore(state => state.selectedMonth);
  const categoriesQuery = useCategories();
  const paymentMethods = usePaymentMethods();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'expense' | 'income' | 'refund'>('all');
  const [debouncedSearch,setDebouncedSearch]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setDebouncedSearch(search),250);return()=>clearTimeout(timer);},[search]);
  const transactionsQuery = useTransactionHistory(selectedMonth,filter,debouncedSearch);
  const filtering=search.trim().toLowerCase()!==debouncedSearch.trim().toLowerCase();
  const categories = categoriesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  return <View style={pageLayout.screen}><FlatList
    keyboardShouldPersistTaps="handled"
    data={filtering ? [] : transactions}
    initialNumToRender={10}
    maxToRenderPerBatch={10}
    windowSize={5}
    keyExtractor={item => item.id}
    contentContainerStyle={[pageLayout.scrollContent, styles.content]}
    ListHeaderComponent={<View style={styles.header}>
      <ScreenHeading title="Transactions" action={<MonthPicker />} />
      <CsvExport month={selectedMonth} kind="transactions" filter={filter} search={search}/>
      <View style={styles.toolbar}>
        <View style={styles.search}><Search size={17} color={colors.muted} /><TextInput accessibilityLabel="Search transactions" value={search} onChangeText={setSearch} maxLength={500} placeholder="Search transactions" placeholderTextColor={colors.subtle} style={styles.searchInput} /></View>
        <View style={styles.filters}>{(['all', 'expense', 'income','refund'] as const).filter(option=>option!=='refund'||paymentMethods.refundSupported).map(option => <MotionPressable key={option} accessibilityState={{ selected: option === filter }} onPress={() => setFilter(option)} style={[styles.filter, filter === option && styles.activeFilter]}><Text style={[styles.filterText, filter === option && styles.activeFilterText]}>{option === 'all' ? 'All' : option === 'expense' ? 'Expenses' : option==='refund'?'Refunds':'Income'}</Text></MotionPressable>)}</View>
      </View>
      <View style={styles.listHeading}><Text style={styles.heading}>Activity</Text><Text style={styles.caption}>{transactions.length} {transactionsQuery.hasNextPage?'shown':transactions.length === 1 ? 'entry' : 'entries'}</Text></View>
    </View>}
    ListEmptyComponent={<View style={styles.empty}><QueryState loading={filtering || transactionsQuery.isPending || categoriesQuery.isPending} error={transactionsQuery.isError || categoriesQuery.isError} retry={() => { void transactionsQuery.refetch(); void categoriesQuery.refetch(); }} empty={search || filter !== 'all' ? 'No matches. Change your search or filter.' : 'No transactions this month.'}>
      {!search && filter === 'all' && <MotionPressable onPress={() => router.push({ pathname: '/transaction/new', params: { visit: createRequestId() } })} style={styles.add}><Plus size={16} color={colors.primary} /><Text style={styles.activeFilterText}>Add Transaction</Text></MotionPressable>}
    </QueryState></View>}
    ListFooterComponent={filtering?null:<View style={styles.footer}>
      {transactionsQuery.isFetchNextPageError&&<Text accessibilityRole="alert" style={styles.caption}>Could not load more. Your entries are still here.</Text>}
      {transactionsQuery.hasNextPage&&<MotionPressable accessibilityLabel="Load more transactions" disabled={transactionsQuery.isFetching} onPress={()=>void transactionsQuery.fetchNextPage()} style={styles.loadMore}><Text style={styles.activeFilterText}>{transactionsQuery.isFetchingNextPage?'Loading…':transactionsQuery.isFetchNextPageError?'Retry load more':'Load more'}</Text></MotionPressable>}
      {transactionsQuery.isRefetchError&&transactions.length>0&&<MotionPressable style={styles.loadMore} onPress={()=>void transactionsQuery.refetch()}><Text style={styles.activeFilterText}>Could not refresh. Retry</Text></MotionPressable>}
    </View>}
    renderItem={({ item }) => <View style={styles.item}><TransactionListItem transaction={item} paymentMethodLabel={item.payment_method_id ? (paymentMethods.methods?.find(method => method.id === item.payment_method_id) ? paymentMethodLabel(paymentMethods.methods.find(method => method.id === item.payment_method_id)!) : 'Saved payment method') : 'Cash'} category={categories.find(category => category.id === item.category_id)} onPress={() => router.push({ pathname: '/transaction/[id]', params: { visit: createRequestId(), id: item.refund_of??item.id, refundId:item.type==='refund'?item.id:undefined, type: item.type, categoryId: item.category_id ?? '', amount: String(item.amount), note: item.note ?? '', occurredAt: item.occurred_at } })} /></View>}
  /></View>;
}
const useStyles = createThemedStyles(colors => ({
  content: { alignItems: 'stretch', alignSelf: 'center', width: '100%', maxWidth: 560 },
  header: { gap: 28 }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  search: { flex: 1, minWidth: 220, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { ...type.body, color: colors.text, paddingVertical: 12, paddingRight: 14, minHeight: 48, flex: 1 },
  filters: { flexWrap:'wrap', flexDirection: 'row', gap: 4, backgroundColor: colors.surfaceAlt, padding: 4, borderRadius: 10 },
  filter: { paddingHorizontal: 12, minHeight: 48, justifyContent: 'center', borderRadius: 7 }, activeFilter: { backgroundColor: colors.surface },
  filterText: { ...type.label, color: colors.muted }, activeFilterText: { ...type.label, color: colors.primary },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  heading: { ...type.heading, color: colors.text }, caption: { ...type.label, color: colors.muted, fontWeight: '400' },
  item: { width: '100%' }, empty: { minHeight: 250 },
  add: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 48, paddingHorizontal: 16 },
  footer:{gap:12,paddingVertical:20},loadMore:{minHeight:48,alignItems:'center',justifyContent:'center',padding:12,borderWidth:1,borderColor:colors.border,borderRadius:10,backgroundColor:colors.surface},
}));

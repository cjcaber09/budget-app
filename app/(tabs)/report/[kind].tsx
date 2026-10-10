import {useState,useCallback} from 'react';
import {FlatList,View,Text} from 'react-native';
import {format,parseISO} from 'date-fns';
import {useLocalSearchParams,useRouter,useFocusEffect} from 'expo-router';
import {useReports,useReportTransfers,useReportTransactions,type ReportTransfer} from '../../../src/hooks/useReports';
import {useUiStore} from '../../../src/stores/useUiStore';
import {usePreferencesStore} from '../../../src/stores/usePreferencesStore';
import {useMoneyCents} from '../../../src/domain/money';
import {effectiveDate} from '../../../src/domain/transactionDates';
import {createRequestId} from '../../../src/domain/ocr';
import type {Transaction,Category} from '../../../src/types/database';
import {ScreenHeading} from '../../../src/components/ScreenHeading';
import {MonthlyTrendChart} from '../../../src/components/MonthlyTrendChart';
import {TransactionListItem} from '../../../src/components/TransactionListItem';
import {ReportData,ReportGroups,CashFlowTotals,PreviousComparison,UnsupportedReport} from '../../../src/components/ReportWidgets';
import {MotionPressable} from '../../../src/components/MotionPressable';
import {QueryState} from '../../../src/components/QueryState';
import {usePageLayout} from '../../../src/styles/pageLayout';
import {useSpendingGuidanceStyles} from '../../../src/styles/spendingGuidance';
import {useColors} from '../../../src/styles/theme';
const TITLES:Record<string,string>={cashflow:'Detailed cash flow',income:'Income breakdown',accounts:'Account spending',comparison:'Previous-month comparison',trends:'Expense trends'};
type HistoryRow={kind:'transaction';value:Transaction}|{kind:'transfer';value:ReportTransfer}|{kind:'heading';label:string};
export default function ReportDetailScreen() {
 const params=useLocalSearchParams<{kind:string;month?:string;filter?:string;visit?:string}>();
 const selected=useUiStore(s=>s.selectedMonth),owner=usePreferencesStore(s=>s.profile?.user_id);
 const month=params.month??selected;
 return <ReportDetail key={owner+':'+params.kind+':'+month+':'+(params.filter??'')+':'+(params.visit??'direct')} kind={params.kind} month={month} filter={params.filter}/>;
}
function ReportDetail({kind,month,filter}:{kind:string;month:string;filter?:string}) {
 const page=usePageLayout({safeTop:true}),s=useSpendingGuidanceStyles(),router=useRouter(),money=useMoneyCents(),colors=useColors();
 const q=useReports(month);
 const historyKind=kind==='cashflow'||kind==='income'||kind==='accounts';
 const transactions=useReportTransactions(month,q.supported&&historyKind),transfers=useReportTransfers(month,q.supported&&kind==='cashflow'&&!filter);
 const setMonth=useUiStore(v=>v.setSelectedMonth);
 const [type,setType]=useState<'all'|'income'|'expense'>('all');
 const [trend,setTrend]=useState<'daily'|'weekly'|'monthly'>('monthly');
 useFocusEffect(useCallback(()=>{if(q.supported)setMonth(month);},[month,q.supported,setMonth]));
 if(!q.supported||!TITLES[kind])return <View style={[page.screen,page.scrollContent]}><ScreenHeading title="Reports" description="Choose a supported month to continue."/><UnsupportedReport today={q.today}/></View>;
 const data=q.data,totals=data?.totals.data;
 const filtered=(transactions.data??[]).filter(t=>{
  if(kind==='income')return t.type==='income'&&(!filter||(filter==='unspecified'?t.income_source_id==null:t.income_source_id===filter));
  if(kind==='accounts')return t.type==='expense'&&(!filter||(filter==='cash'?t.payment_method_kind==='cash':t.payment_method_id===filter));
  if(filter==='uncategorized')return t.type==='expense'&&t.category_id===null;
  return type==='all'||t.type===type;
 });
 const history:HistoryRow[]=historyKind&&!transactions.isPending&&!transactions.isError?filtered.map(value=>({kind:'transaction' as const,value})):[];
 if(kind==='cashflow'&&!filter){history.push({kind:'heading',label:'Internal transfers'});if(!transfers.isPending&&!transfers.isError)history.push(...(transfers.data??[]).map(value=>({kind:'transfer' as const,value})));}
 const retry=()=>void q.refetch();
 const header=<View style={{gap:24}}>
  <ScreenHeading title={TITLES[kind]} description={format(parseISO(month),'MMMM yyyy')+' · Recorded entries, including future-dated records.'}/>
  {filter&&<MotionPressable style={s.editButton} onPress={()=>router.push({pathname:'/report/[kind]',params:{kind,month,visit:createRequestId()}})}><Text style={s.action}>Show all {kind==='income'?'income':kind==='accounts'?'accounts':'entries'}</Text></MotionPressable>}
  {kind==='cashflow'&&<ReportData section={data?.totals} loading={q.isPending} error={q.isError} retry={retry}>{value=><CashFlowTotals totals={value}/>}</ReportData>}
  {(kind==='income'||kind==='accounts')&&!filter&&<View style={s.section}><Text style={s.heading}>{kind==='income'?'By income source':'By payment method'}</Text><ReportData section={kind==='income'?data?.sources:data?.accounts} loading={q.isPending} error={q.isError} retry={retry}>{groups=><ReportGroups groups={groups} total={kind==='income'?totals?.income:totals?.expense} onSelect={key=>router.push({pathname:'/report/[kind]',params:{kind,month,filter:key,visit:createRequestId()}})}/>}</ReportData></View>}
  {kind==='comparison'&&<View style={s.section}><Text style={s.heading}>Previous-month comparison</Text><ReportData section={data?.comparison} loading={q.isPending} error={q.isError} retry={retry}>{value=><PreviousComparison comparison={value}/>}</ReportData></View>}
  {kind==='trends'&&<View style={s.section}>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['daily','weekly','monthly'] as const).map(value=><MotionPressable key={value} style={[s.editButton,value===trend&&{backgroundColor:colors.selected,borderColor:colors.primary}]} accessibilityLabel={'Show '+value+' trend'} accessibilityState={{selected:value===trend}} onPress={()=>setTrend(value)}><Text style={s.action}>{value==='daily'?'Daily':value==='weekly'?'Weekly':'Monthly'}</Text></MotionPressable>)}</View>
   <Text style={s.caption}>{trend==='monthly'?'Twelve months ending in the selected month.':trend==='weekly'?'Monday-based weeks clipped to the selected month.':'Every day in the selected month, including zero activity.'}</Text>
   <ReportData section={data?.[trend]} loading={q.isPending} error={q.isError} retry={retry}>{points=><MonthlyTrendChart kind={trend} currentMonth={q.today.slice(0,7)+'-01'} totals={points.map(p=>({month:p.day,total:p.amount/100,cents:p.amount,future:p.future,end:p.end}))}/>}</ReportData>
  </View>}
  {historyKind&&<View><Text style={s.heading}>{filter==='uncategorized'?'Uncategorized expenses':kind==='income'?'Income history':kind==='accounts'?'Expense history':'Transaction history'}</Text>{filter&&filter!=='uncategorized'&&<Text style={s.caption}>{(kind==='income'?data?.sources.data:data?.accounts.data)?.find(g=>g.key===filter)?.name??'Selected group'}</Text>}
   {kind==='cashflow'&&!filter&&<View style={{flexDirection:'row',gap:8,marginTop:12}}>{(['all','income','expense'] as const).map(value=><MotionPressable key={value} style={[s.editButton,value===type&&{backgroundColor:colors.selected,borderColor:colors.primary}]} accessibilityState={{selected:type===value}} onPress={()=>setType(value)}><Text style={s.action}>{value==='all'?'All':value==='income'?'Income':'Expenses'}</Text></MotionPressable>)}</View>}
   <QueryState loading={transactions.isPending} error={transactions.isError} retry={()=>void transactions.refetch()}/>
   {!transactions.isPending&&!transactions.isError&&!filtered.length&&<Text style={s.caption}>No entries in this period for this selection.</Text>}
  </View>}
 </View>;
 return <FlatList style={page.screen} data={history} keyExtractor={r=>r.kind==='heading'?'transfer-heading':r.kind+':'+r.value.id} contentContainerStyle={[page.scrollContent,{alignItems:'stretch'}]} ListHeaderComponentStyle={{width:'100%',maxWidth:560,alignSelf:'center'}} ListHeaderComponent={header}
 renderItem={({item})=>{
  if(item.kind==='heading')return <View style={{paddingTop:28,gap:12}}><Text style={s.heading}>Internal transfers</Text><Text style={s.caption}>Recorded once per transfer; excluded from income, expenses and net amount.</Text><QueryState loading={transfers.isPending} error={transfers.isError} retry={()=>void transfers.refetch()}/>{!transfers.isPending&&!transfers.isError&&!transfers.data?.length&&<Text style={s.caption}>No transfers in this month.</Text>}</View>;
  if(item.kind==='transfer'){const t=item.value;return <View style={{paddingVertical:18,gap:8}} accessible accessibilityLabel={'Transfer from '+t.source_name+' to '+t.destination_name+', '+money(t.amount)+', '+t.transfer_date}><Text style={s.label}>From {t.source_name}</Text><Text style={s.label}>To {t.destination_name}</Text><View style={s.row}><Text style={s.caption}>{t.transfer_date}{t.transfer_date>q.today?' · Future-dated':''}</Text><Text style={s.number}>{money(t.amount)}</Text></View>{t.note&&<Text style={s.caption}>{t.note}</Text>}</View>;}
  const t=item.value,c=data?.categories.data?.find(c=>c.id===t.category_id);
  const category:Category|undefined=t.category_id?{id:t.category_id,user_id:data?.owner??'',name:c?.name??'Category unavailable',color:c?.color??'#69736A',icon:'tag',is_default:false}:undefined;
  const account=data?.accounts.data?.find(a=>a.id===t.payment_method_id);
  return <View style={{width:'100%',maxWidth:560,alignSelf:'center'}}>{effectiveDate(t)>q.today&&<Text style={s.caption}>Future-dated entry</Text>}<TransactionListItem transaction={t} category={category} paymentMethodLabel={t.payment_method_id?account?.name??'Payment method unavailable':'Cash'} onPress={()=>router.push({pathname:'/transaction/[id]',params:{id:t.id,visit:createRequestId()}})}/></View>;
 }}/>;
}

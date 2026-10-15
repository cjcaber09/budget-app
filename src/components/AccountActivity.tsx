import {useEffect,useState} from 'react';
import {AppState,Text,TextInput,View} from 'react-native';
import {useReportTransactions,useReportTransfers} from '../hooks/useReports';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useUiStore} from '../stores/useUiStore';
import {useCategories} from '../hooks/useCategories';
import {accountActivity,searchAccountActivity,type AccountActivityRow} from '../domain/accountActivity';
import {paymentMethodLabel,type PaymentMethod,type BalanceCorrection} from '../domain/paymentMethods';
import {useMoneyCents} from '../domain/money';
import {localDateKey} from '../domain/transactionDates';
import {reportingMonthSupported} from '../domain/reports';
import {useFormStyles} from '../styles/forms';
import {type,useColors} from '../styles/theme';
import {MonthPicker} from './MonthPicker';
import {MotionPressable} from './MotionPressable';
import {QueryState} from './QueryState';

export function AccountActivity({method,corrections,unavailable,refresh,onBack}:{method:PaymentMethod;corrections:BalanceCorrection[];unavailable:boolean;refresh:()=>void;onBack:()=>void}) {
 const profile=usePreferencesStore(s=>s.profile),selectedMonth=useUiStore(s=>s.selectedMonth);
 const [month,setMonth]=useState(selectedMonth),[search,setSearch]=useState(''),[kind,setKind]=useState<'all'|AccountActivityRow['kind']>('all');
 const supported=reportingMonthSupported(month,localDateKey(new Date(),profile?.timezone));
 const transactions=useReportTransactions(month,supported),transfers=useReportTransfers(month,supported),categories=useCategories();
 const refetchTransactions=transactions.refetch,refetchTransfers=transfers.refetch;
 useEffect(()=>{let day=localDateKey(new Date(),profile?.timezone);const sync=()=>{if(supported){void refetchTransactions();void refetchTransfers();}};const listener=AppState.addEventListener('change',state=>{if(state==='active')sync();});const timer=setInterval(()=>{const next=localDateKey(new Date(),profile?.timezone);if(next!==day){day=next;sync();}},30000);return()=>{listener.remove();clearInterval(timer);};},[profile?.timezone,supported,refetchTransactions,refetchTransfers]);
 const form=useFormStyles(),colors=useColors(),money=useMoneyCents();
 let rows:AccountActivityRow[]=[],error='';
 const owned=profile?.user_id===method.user_id;
 if(owned&&transactions.data&&transfers.data&&!unavailable){try{
  rows=accountActivity(method,month,profile.timezone,transactions.data,transfers.data,corrections);
  const labels=new Map((categories.data??[]).map(category=>[category.id,category.name]));
  const byId=new Map(transactions.data.map(transaction=>['transaction:'+transaction.id,transaction]));
  rows=rows.map(row=>{const transaction=byId.get(row.key);const category=transaction?.category_id?labels.get(transaction.category_id):undefined;return {...row,detail:[row.detail,category].filter(Boolean).join(' · ')};});
 }catch(issue){error=issue instanceof Error?issue.message:'Activity could not be read.';}}
 const filtered=searchAccountActivity(rows,search,kind);
 const failed=unavailable||transactions.isError||transfers.isError||categories.isError||!owned||!!error;
 const loading=transactions.isPending||transfers.isPending||categories.isPending;
 return <View style={{gap:12}}>
  <Text style={form.title}>{method.method==='cash'?'Cash':paymentMethodLabel(method)}</Text>
  <MotionPressable accessibilityLabel="Back to payment method details" style={form.secondaryButton} onPress={onBack}><Text style={form.chipTextSelected}>Back to details</Text></MotionPressable>
  <Text style={form.subtitle}>Recorded activity for this month. Future dates and records before the starting balance may not affect the current balance.</Text>
  <MonthPicker value={month} onChange={setMonth} minMonth="0001-12-01"/>
  <TextInput accessibilityLabel="Search account activity" value={search} onChangeText={setSearch} placeholder="Search notes, category, date or amount" placeholderTextColor={colors.subtle} style={form.input}/>
  <View style={form.optionRow}>{([['all','All'],['transaction','Transactions'],['transfer','Transfers'],['correction','Corrections']] as const).map(([value,label])=><MotionPressable key={value} accessibilityState={{selected:kind===value}} style={[form.chip,kind===value&&form.chipSelected]} onPress={()=>setKind(value)}><Text style={kind===value?form.chipTextSelected:form.chipText}>{label}</Text></MotionPressable>)}</View>
  {!supported?<Text style={form.error}>Choose a supported month.</Text>:<QueryState loading={loading&&!failed} error={failed} retry={()=>{refresh();void transactions.refetch();void transfers.refetch();void categories.refetch();}}>
   <Text accessibilityLiveRegion="polite" style={form.subtitle}>{filtered.length} {filtered.length===1?'entry':'entries'}{search.trim()?' matching your search':''}</Text>
   {!filtered.length&&<Text style={form.subtitle}>{search.trim()||kind!=='all'?'No matching activity. Clear the search or choose All.':'No recorded activity this month.'}</Text>}
   {filtered.map(row=><View key={row.key} style={{paddingVertical:14,borderBottomWidth:1,borderBottomColor:colors.border,gap:6}}>
    <View style={{flexDirection:'row',gap:12,alignItems:'flex-start'}}><Text style={{...type.body,color:colors.text,flex:1}}>{row.label}</Text><Text style={{...type.number,color:colors.text,flexShrink:1}}>{row.cents>0?'+':''}{money(row.cents)}</Text></View>
    <Text style={form.subtitle}>{row.date}{row.detail?' · '+row.detail:''}</Text>
    {!!row.note&&<Text style={form.subtitle}>{row.note}</Text>}
   </View>)}
  </QueryState>}
 </View>;
}

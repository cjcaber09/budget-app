import {format,parseISO} from 'date-fns';
import {useTransactions} from '../../../src/hooks/useTransactions';
import {TransactionListItem} from '../../../src/components/TransactionListItem';
import {createRequestId} from '../../../src/domain/ocr';
import {useState,useCallback} from 'react';
import {View,FlatList,Text,TextInput} from 'react-native';
import {useLocalSearchParams,useRouter,useFocusEffect} from 'expo-router';
import {CategoryPerformance} from '../../../src/components/CategoryPerformance';
import {UnsupportedReport} from '../../../src/components/ReportWidgets';
import {reportingMonthSupported} from '../../../src/domain/reports';
import {localDateKey} from '../../../src/domain/transactionDates';
import {usePreferencesStore} from '../../../src/stores/usePreferencesStore';
import {useCategories} from '../../../src/hooks/useCategories';
import {useBudgets,useSetBudget} from '../../../src/hooks/useBudgets';
import {useDashboard} from '../../../src/hooks/useDashboard';
import {useUiStore} from '../../../src/stores/useUiStore';
import {MotionPressable} from '../../../src/components/MotionPressable';
import {QueryState} from '../../../src/components/QueryState';
import {useFormStyles} from '../../../src/styles/forms';
import {useColors} from '../../../src/styles/theme';
import {usePageLayout} from '../../../src/styles/pageLayout';
import {useMoney} from '../../../src/domain/money';
import {allocationError,allocationCapacity} from '../../../src/domain/budgetAllocation';
import {decimalToCents,MAX_MONEY_CENTS} from '../../../supabase/functions/ocr/shared';

export default function EditBudgetScreen(){
 const {categoryId,visit,month:requested}=useLocalSearchParams<{categoryId:string;visit?:string;month?:string}>();
 const selected=useUiStore(state=>state.selectedMonth),setMonth=useUiStore(s=>s.setSelectedMonth);
 const profile=usePreferencesStore(s=>s.profile),page=usePageLayout();
 const month=requested??selected,today=localDateKey(new Date(),profile?.timezone),supported=reportingMonthSupported(month,today);
 useFocusEffect(useCallback(()=>{if(requested&&supported)setMonth(month);},[month,requested,supported,setMonth]));
 if(!supported)return <View style={[page.screen,page.scrollContent]}><UnsupportedReport today={today}/></View>;
 return <BudgetEditor key={(profile?.user_id??'')+categoryId+month+(visit??'direct')} categoryId={categoryId} month={month}/>;
}
function BudgetEditor({categoryId,month}:Readonly<{categoryId:string;month:string}>){
 const page=usePageLayout();const form=useFormStyles();const categories=useCategories();const budgets=useBudgets(month);const dashboard=useDashboard(month);
 const transactions=useTransactions(month);const router=useRouter();
 const ready=!!categories.data&&!!budgets.data&&!!dashboard.data;
 const failed=categories.isError||budgets.isError||dashboard.isError;
 const fetching=categories.isFetching||budgets.isFetching||dashboard.isFetching;
 const retry=()=>{void categories.refetch();void budgets.refetch();void dashboard.refetch();};
 const category=categories.data?.find(c=>c.id===categoryId);
 return <FlatList style={page.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={[page.scrollContent,{alignItems:'stretch'}]}
 data={transactions.isPending||transactions.isError?[]:(transactions.data??[]).filter(t=>t.category_id===categoryId)} keyExtractor={item=>item.id}
 ListHeaderComponentStyle={{width:'100%',maxWidth:560,alignSelf:'center'}}
 ListHeaderComponent={<><View style={page.card}>
 {!ready?<QueryState loading={!failed} error={failed} retry={retry}/>:!category?<Text style={form.error}>Category unavailable. Return to Overview and choose a category.</Text>:<BudgetForm categoryId={categoryId} month={month} name={category.name} current={decimalToCents(budgets.data!.find(b=>b.category_id===categoryId)?.amount??0)!} allocated={dashboard.data!.allocatedCents} allowance={dashboard.data!.limitCents} blocked={failed||fetching} failed={failed} retry={retry}/>}
 </View><View style={{paddingTop:28,width:'100%',maxWidth:560,alignSelf:'center'}}><CategoryPerformance categoryId={categoryId} month={month}/></View><View style={{paddingHorizontal:24,paddingTop:28,width:'100%',maxWidth:560,alignSelf:'center'}}><Text style={form.title}>Transactions</Text><Text style={form.subtitle}>{format(parseISO(month),'MMMM yyyy')}</Text></View></>}
 ListEmptyComponent={<View style={{paddingHorizontal:24}}><QueryState loading={transactions.isPending} error={transactions.isError} retry={()=>void transactions.refetch()} empty="No transactions for this category this month."/></View>}
 renderItem={({item})=><View style={{paddingHorizontal:24,width:'100%',maxWidth:560,alignSelf:'center'}}><TransactionListItem transaction={item} category={category} onPress={()=>router.push({pathname:'/transaction/[id]',params:{id:item.id,visit:createRequestId()}})}/></View>}/>;

}
function BudgetForm({categoryId,month,name,current,allocated,allowance,blocked,failed,retry}:Readonly<{categoryId:string;month:string;name:string;current:number;allocated:number;allowance:number|null;blocked:boolean;failed:boolean;retry:()=>void}>){
 const form=useFormStyles();const colors=useColors();const money=useMoney();const save=useSetBudget();const [editing,setEditing]=useState(false);
 const [amount,setAmount]=useState(()=>String(current/100));const [error,setError]=useState<string|null>(null);
 const capacity=allocationCapacity(current,allocated,allowance);
 const submit=()=>{
  const cents=/^\d+(?:\.\d{0,2})?$/.test(amount)?decimalToCents(amount):null;
  if(cents===null||cents<0||cents>MAX_MONEY_CENTS){setError('Enter a budget of zero or more, with up to two decimal places.');return;}
  const issue=allocationError(cents,current,allocated,allowance);if(issue){setError(issue);return;}setError(null);
  save.mutate({categoryId,month,amount:cents/100},{onSuccess:()=>setEditing(false)});
 };
 if(!editing)return <><Text style={form.title}>{name} Budget</Text><Text style={form.subtitle}>{format(parseISO(month),'MMMM yyyy')}</Text><Text style={[form.title,{marginTop:16}]}>{money(current/100)}</Text><Text style={form.subtitle}>Monthly allowance: {allowance===null?'Not set':money(allowance/100)}</Text><MotionPressable style={form.secondaryButton} accessibilityLabel="Edit category budget" disabled={blocked} onPress={()=>{setAmount(String(current/100));setError(null);save.reset();setEditing(true);}}><Text style={form.chipTextSelected}>Edit budget</Text></MotionPressable>{failed&&<View><Text accessibilityRole="alert" style={form.error}>Could not refresh budget allocations.</Text><MotionPressable style={form.secondaryButton} onPress={retry}><Text style={form.chipTextSelected}>Retry allocations</Text></MotionPressable></View>}</>;
 return <>
 <Text style={form.title}>{name} Budget</Text>
 <Text style={form.subtitle}>Combined category budgets must stay within the monthly allowance.</Text>
 <Text style={form.subtitle}>{allowance===null?'Set the monthly allowance on Overview first.':'Monthly allowance: '+money(allowance/100)}</Text>
 {capacity!==null&&<Text style={form.subtitle}>Available for this category: {money(capacity/100)}</Text>}
 {allowance!==null&&allocated>allowance&&<Text accessibilityRole="alert" style={form.error}>Existing category budgets exceed the allowance. Reduce allocations to bring them within it.</Text>}
 {(error||save.error)&&<Text accessibilityRole="alert" style={form.error}>{error||save.error?.message}</Text>}
 {failed&&<View><Text accessibilityRole="alert" style={form.error}>Could not refresh allocations. Your draft is still here.</Text><MotionPressable style={form.secondaryButton} onPress={retry}><Text style={form.chipTextSelected}>Retry allocations</Text></MotionPressable></View>}
 <Text style={form.label}>Category budget</Text><TextInput accessibilityLabel="Budget amount" placeholderTextColor={colors.subtle} style={form.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!save.isPending}/>
 <MotionPressable style={form.button} onPress={submit} disabled={blocked||save.isPending}><Text style={form.buttonText}>{save.isPending?'Saving...':'Save Budget'}</Text></MotionPressable>
 <MotionPressable style={form.secondaryButton} disabled={save.isPending} onPress={()=>setEditing(false)}><Text style={form.chipTextSelected}>Cancel</Text></MotionPressable>
 </>;
}

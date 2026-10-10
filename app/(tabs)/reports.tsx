import {ScrollView,View,Text} from 'react-native';
import {addMonths,format,parseISO} from 'date-fns';
import {useRouter} from 'expo-router';
import {useReports} from '../../src/hooks/useReports';
import {useDashboard} from '../../src/hooks/useDashboard';
import {useUiStore} from '../../src/stores/useUiStore';
import {useMoneyCents} from '../../src/domain/money';
import {createRequestId} from '../../src/domain/ocr';
import type {Category,Budget} from '../../src/types/database';
import {SpendByCategoryChart} from '../../src/components/SpendByCategoryChart';
import {MonthlyTrendChart} from '../../src/components/MonthlyTrendChart';
import {CategoryBudgetReport} from '../../src/components/CategoryBudgetReport';
import {DailySpendingPace} from '../../src/components/DailySpendingPace';
import {ReportData,ReportLink,UnsupportedReport} from '../../src/components/ReportWidgets';
import {ScreenHeading} from '../../src/components/ScreenHeading';
import {MonthPicker} from '../../src/components/MonthPicker';
import {QueryState} from '../../src/components/QueryState';
import {usePageLayout} from '../../src/styles/pageLayout';
import {useSpendingGuidanceStyles} from '../../src/styles/spendingGuidance';
import {CsvExport} from '../../src/components/CsvExport';
export default function ReportsScreen() {
 const s=useSpendingGuidanceStyles(),page=usePageLayout({safeTop:true}),router=useRouter(),money=useMoneyCents();
 const month=useUiStore(v=>v.selectedMonth),report=useReports(month),current=month===report.today.slice(0,7)+'-01';
 const guidance=useDashboard(month,report.supported&&current);
 const data=report.data,totals=data?.totals.data,maxMonth=format(addMonths(parseISO(report.today.slice(0,7)+'-01'),24),'yyyy-MM-01');
 const retry=()=>void report.refetch();
 if(!report.supported)return <View style={[page.screen,page.scrollContent]}><ScreenHeading title="Reports" description="Choose a supported month to continue."/><UnsupportedReport today={report.today}/></View>;
 return <ScrollView style={page.screen} contentContainerStyle={page.scrollContent}><View style={page.workspace}>
  <ScreenHeading title="Reports" description="Find the patterns behind your spending." action={<MonthPicker minMonth="0001-12-01" maxMonth={maxMonth}/>}/>
  <CsvExport month={month} kind="analysis"/>
  <View style={s.section}><Text accessibilityRole="header" style={s.heading}>Budget vs Actual</Text><Text style={s.caption}>Your selected month, category by category.</Text>
   <ReportData section={data?.categories} loading={report.isPending} error={report.isError} retry={retry}>{rows=>{
    const owned=rows.filter(c=>c.id!==null);
    const categories:Category[]=owned.map(c=>({id:c.id!,user_id:data!.owner,name:c.name,color:c.color,icon:'tag',is_default:false}));
    const budgets:Budget[]=owned.filter(c=>c.budget!==null).map(c=>({id:c.key,user_id:data!.owner,category_id:c.id!,month,amount:c.budget!/100}));
    const allocated=owned.reduce((n,c)=>n+BigInt(c.budget??0),0n);
    if(allocated>BigInt(Number.MAX_SAFE_INTEGER))return <Text style={s.caption}>Category allocations exceed the supported range.</Text>;
    return <CategoryBudgetReport categories={categories} budgets={budgets} month={month} snapshot={{allocatedCents:Number(allocated),categoryTotals:owned.map(c=>({id:c.id!,name:c.name,color:c.color,spent:c.spent}))}}/>;
   }}</ReportData>
  </View>
  <View style={s.section}><Text accessibilityRole="header" style={s.heading}>Spending by Category</Text><Text style={s.caption}>All categories, including zero spending and Uncategorized. Percentages use total recorded expenses.</Text>
   <ReportData section={data?.categories} loading={report.isPending} error={report.isError} retry={retry}>{rows=><SpendByCategoryChart reportCategories={rows} expenseCents={totals?.expense} onSelect={key=>key==='uncategorized'?router.push({pathname:'/report/[kind]',params:{kind:'cashflow',month,filter:key,visit:createRequestId()}}):router.push({pathname:'/budget/[categoryId]',params:{categoryId:key,month,visit:createRequestId()}})}/>}</ReportData>
  </View>
  <View style={s.section}><Text accessibilityRole="header" style={s.heading}>Explore reports</Text>
   <ReportLink title="Detailed cash flow" description="Income, expenses, net amount and separate transfers." kind="cashflow" month={month} value={totals?money(totals.net):undefined}/>
   <ReportLink title="Income breakdown" description="Income sources and recorded income history." kind="income" month={month} value={totals?money(totals.income):undefined}/>
   <ReportLink title="Account spending" description="Expenses by individual payment method." kind="accounts" month={month} value={totals?money(totals.expense):undefined}/>
   <ReportLink title="Previous-month comparison" description={current?'Month to date against matching previous dates.':'Recorded totals and category changes.'} kind="comparison" month={month}/>
  </View>
  {current&&<QueryState loading={guidance.isPending} error={guidance.isError} retry={()=>void guidance.refetch()}>{guidance.data&&<DailySpendingPace snapshot={guidance.data}/>}</QueryState>}
  <View style={s.section}><Text accessibilityRole="header" style={s.heading}>Expense Trend</Text><Text style={s.caption}>Twelve months ending in your selected month.</Text>
   <ReportData section={data?.monthly} loading={report.isPending} error={report.isError} retry={retry}>{points=><MonthlyTrendChart totals={points.map(p=>({month:p.day,total:p.amount/100,cents:p.amount,future:p.future}))} currentMonth={report.today.slice(0,7)+'-01'}/>}</ReportData>
   <ReportLink title="Daily, weekly and monthly trends" description="Explore the selected month's spending pace." kind="trends" month={month}/>
  </View>
 </View></ScrollView>;
}

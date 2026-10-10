import {View,Text} from 'react-native';
import {useReports} from '../hooks/useReports';
import {reportShare} from '../domain/reports';
import {useMoneyCents} from '../domain/money';
import {useSpendingGuidanceStyles} from '../styles/spendingGuidance';
import {ReportData} from './ReportWidgets';
import {MonthlyTrendChart} from './MonthlyTrendChart';
export function CategoryPerformance({categoryId,month}:{categoryId:string;month:string}) {
 const q=useReports(month),s=useSpendingGuidanceStyles(),money=useMoneyCents();
 if(!q.supported)return <View style={s.section}><Text style={s.caption}>Category performance is unavailable for this reporting period.</Text></View>;
 return <View style={s.section}><Text accessibilityRole="header" style={s.heading}>Category performance</Text>
  <ReportData section={q.data?.categories} loading={q.isPending} error={q.isError} retry={()=>void q.refetch()}>{categories=>{
   const c=categories.find(c=>c.id===categoryId);if(!c)return <Text style={s.caption}>Category unavailable.</Text>;
   const expense=q.data?.totals.data?.expense,share=expense===undefined?null:reportShare(c.spent,expense);
   const hasBudget=c.budget!==null&&c.budget>0,ratio=hasBudget?c.spent/c.budget!*100:0;
   const rounded=Math.round(ratio*10)/10;
   const usage=!hasBudget?'Not budgeted':ratio>999?'999%+':ratio>0&&ratio<1?'<1%':(c.spent<c.budget!?Math.min(99.9,rounded):c.spent>c.budget!?Math.max(100.1,rounded):100)+'%';
   return <View><View style={s.row}><Text style={s.caption}>Recorded spending</Text><Text style={s.number}>{money(c.spent)}</Text></View><View style={s.row}><Text style={s.caption}>{hasBudget&&c.spent>c.budget!?'Over by':'Remaining budget'}</Text><Text style={s.number}>{hasBudget?money(Math.abs(c.budget!-c.spent)):'Not budgeted'}</Text></View><View style={s.row}><Text style={s.caption}>Expense share</Text><Text style={s.number}>{share===null?'Unavailable':share.toFixed(1)+'%'}</Text></View><View style={s.row}><Text style={s.caption}>Budget usage</Text><Text style={s.number}>{usage}</Text></View><View style={s.row}><Text style={s.caption}>Transactions</Text><Text style={s.number}>{c.count}</Text></View></View>;
  }}</ReportData>
  <ReportData section={q.data?.categoryMonthly} loading={q.isPending} error={q.isError} retry={()=>void q.refetch()}>{points=><MonthlyTrendChart currentMonth={q.today.slice(0,7)+'-01'} totals={points.filter(p=>p.key===categoryId).map(p=>({month:p.day,total:p.amount/100,cents:p.amount,future:p.day>q.today.slice(0,7)+'-01'}))}/>}</ReportData>
 </View>;
}

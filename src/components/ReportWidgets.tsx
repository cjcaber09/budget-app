import type {ReactNode} from 'react';
import {View,Text} from 'react-native';
import {useRouter} from 'expo-router';
import {ChevronRight} from 'lucide-react-native';
import {useMoneyCents} from '../domain/money';
import {reportPercentage,reportShare,type ReportGroup,type ReportComparison,type ReportSection,type ReportTotals} from '../domain/reports';
import {createRequestId} from '../domain/ocr';
import {useUiStore} from '../stores/useUiStore';
import {useSpendingGuidanceStyles} from '../styles/spendingGuidance';
import {createThemedStyles,type,useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {QueryState} from './QueryState';

export function ReportData<T>({section,loading,error,retry,children}:{section?:ReportSection<T>;loading?:boolean;error?:boolean;retry:()=>void;children:(data:T)=>ReactNode}) {
 const s=useStyles();
 if(section?.error)return <View style={s.recovery}><Text accessibilityRole="alert" style={s.error}>{section.error}</Text><MotionPressable style={s.retry} onPress={retry}><Text style={s.action}>Retry report</Text></MotionPressable></View>;
 return <QueryState loading={loading} error={error} retry={retry}>{section?.data!==undefined&&children(section.data)}</QueryState>;
}
export function UnsupportedReport({today}:{today:string}) {
 const s=useStyles(),set=useUiStore(v=>v.setSelectedMonth),router=useRouter();
 return <View style={s.recovery}><Text style={s.caption}>This reporting period is unsupported. Reports cover valid twelve-month ranges and up to two years ahead.</Text><MotionPressable style={s.retry} onPress={()=>{set(today.slice(0,7)+'-01');router.replace('/reports');}}><Text style={s.action}>Return to current month</Text></MotionPressable></View>;
}
export function ReportLink({title,description,kind,month,value}:{title:string;description:string;kind:string;month:string;value?:string}) {
 const s=useStyles(),colors=useColors(),router=useRouter();
 return <MotionPressable style={s.link} accessibilityLabel={'View '+title} onPress={()=>router.push({pathname:'/report/[kind]',params:{kind,month,visit:createRequestId()}})}><View style={s.copy}><Text style={s.heading}>{title}</Text><Text style={s.caption}>{description}</Text></View><View style={s.linkEnd}>{value&&<Text style={s.number}>{value}</Text>}<ChevronRight size={16} color={colors.primary}/></View></MotionPressable>;
}
export function ReportGroups({groups,total,onSelect}:{groups:ReportGroup[];total?:number;onSelect:(key:string)=>void}) {
 const s=useStyles(),money=useMoneyCents();
 return <View>{groups.map(g=>{const share=total===undefined?null:reportShare(g.amount,total);return <MotionPressable key={g.key} accessibilityLabel={'View '+g.name+' history'} style={s.group} onPress={()=>onSelect(g.key)}><View style={s.copy}><Text style={s.heading}>{g.name}{g.archived?' · Archived':''}</Text><Text style={s.caption}>{g.paymentType&&g.paymentType!=='Cash'?g.paymentType+(g.lastFour?' · Last four '+g.lastFour:'')+' · ':''}{g.count} {g.count===1?'entry':'entries'}</Text></View><View style={s.groupValues}><Text style={s.number}>{money(g.amount)}</Text><Text style={s.caption}>{share===null?'Percentage unavailable':share<1&&share>0?'<1%':share.toFixed(1)+'%'}</Text></View></MotionPressable>;})}</View>;
}
export function CashFlowTotals({totals}:{totals:ReportTotals}) {
 const s=useSpendingGuidanceStyles(),money=useMoneyCents();
 return <View style={s.section}><Text accessibilityRole="header" style={s.heading}>Recorded cash flow</Text>{(['income','expense','net'] as const).map(key=><View key={key} style={s.row}><Text style={s.caption}>{key==='income'?'Income':key==='expense'?'Expenses':'Net amount'}</Text><Text style={s.number}>{money(totals[key])}</Text></View>)}<Text style={s.caption}>Includes future-dated records in this month. Transfers, initial balances and corrections are separate; this is not verified bank movement.</Text></View>;
}
export function PreviousComparison({comparison}:{comparison:ReportComparison|null}) {
 const s=useStyles(),money=useMoneyCents();
 if(!comparison)return <Text style={s.caption}>Previous-month comparison is unavailable for future months.</Text>;
 const inclusive=(date:string)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 return <View style={s.recovery}><Text style={s.caption}>Current period: {comparison.start} to {inclusive(comparison.end)}</Text><Text style={s.caption}>Previous period: {comparison.previousStart} to {inclusive(comparison.previousEnd)}</Text>
  {(['income','expense','net'] as const).map(key=>{const percent=reportPercentage(comparison.current[key],comparison.previous[key]);return <View key={key} style={s.group}><View style={s.copy}><Text style={s.heading}>{key==='income'?'Income':key==='expense'?'Expenses':'Net amount'}</Text><Text style={s.caption}>{money(comparison.previous[key])} → {money(comparison.current[key])}</Text></View><View style={s.groupValues}><Text style={s.number}>{money(comparison.delta[key])}</Text><Text style={s.caption}>{percent===null?'Percentage unavailable':percent.toFixed(1)+'%'}</Text></View></View>;})}
  <Text style={s.heading}>Category changes</Text>{comparison.categories.map(c=>{const p=reportPercentage(c.current,c.previous);return <View key={c.key} style={s.group}><Text style={[s.caption,s.copy]}>{c.name}</Text><View style={s.groupValues}><Text style={s.number}>{money(c.delta)}</Text><Text style={s.caption}>{p===null?'Percentage unavailable':p.toFixed(1)+'%'}</Text></View></View>;})}
 </View>;
}
const useStyles=createThemedStyles(c=>({
 recovery:{gap:12,paddingVertical:12},error:{...type.body,color:c.danger},caption:{...type.label,fontWeight:'400',color:c.muted},heading:{...type.body,fontWeight:'600',color:c.text},number:{...type.number,fontSize:15,color:c.text},
 retry:{minHeight:48,paddingHorizontal:16,justifyContent:'center',alignSelf:'flex-start',backgroundColor:c.selected,borderRadius:10},action:{...type.label,color:c.primary},
 link:{minHeight:80,paddingVertical:16,gap:12,flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:c.border},copy:{flex:1,minWidth:100,gap:4},linkEnd:{flexDirection:'row',gap:8,alignItems:'center',flexWrap:'wrap'},
 group:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:12},groupValues:{gap:4,alignItems:'flex-end'},
}));

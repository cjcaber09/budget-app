import {useState} from 'react';
import {View,Text} from 'react-native';
import Svg,{Circle,Path,Line} from 'react-native-svg';
import {format} from 'date-fns';
import {useMoneyCents} from '../domain/money';
import type {MonthlyTotal} from '../hooks/useMonthlyTotals';
import {createThemedStyles,type,useColors} from '../styles/theme';
export interface TrendValue extends MonthlyTotal {cents?:number;future?:boolean;end?:string}
const label=(date:string,pattern:string)=>format(new Date(date+'T12:00:00'),pattern);
export function MonthlyTrendChart({totals,currentMonth,kind='monthly'}:{totals:TrendValue[];currentMonth?:string;kind?:'monthly'|'daily'|'weekly'}) {
 const s=useStyles(),colors=useColors(),money=useMoneyCents();const [width,setWidth]=useState(0);
 const maximum=Math.max(...totals.map(t=>t.total),1),height=170,baseline=158;
 const points=totals.map((t,i)=>({x:12+i*Math.max(0,width-24)/Math.max(1,totals.length-1),y:baseline-t.total/maximum*142}));
 const line=points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ');
 const area=points.length?line+' L'+points[points.length-1].x+','+baseline+' L'+points[0].x+','+baseline+' Z':'';
 const hasSpending=totals.some(t=>t.total>0),pattern=kind==='monthly'?'MMM yyyy':'MMM d';
 const amount=(t:TrendValue)=>money(t.cents??Math.round(t.total*100));
 const step=Math.max(1,Math.ceil((totals.length-1)/5));
 return <View style={s.container}>
  {!!totals.length&&<Text style={s.caption}>{label(totals[0].month,pattern)} – {label(kind==='weekly'?totals[totals.length-1].end??totals[totals.length-1].month:totals[totals.length-1].month,pattern)}</Text>}
  {hasSpending?<View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={s.plot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
   <Text style={s.scale}>{amount(totals.reduce((a,b)=>a.total>b.total?a:b))}</Text>
   {width>0&&<Svg width={width} height={height}>{[0,0.5,1].map(n=><Line key={n} x1={12} x2={width-12} y1={baseline-n*142} y2={baseline-n*142} stroke={colors.border}/>)}
    <Path d={area} fill={colors.primary} fillOpacity={0.1}/><Path d={line} fill="none" stroke={colors.primary} strokeWidth={2.5}/>
    {points.map((p,i)=><Circle key={totals[i].month} cx={p.x} cy={p.y} r={totals.length>12?2.5:3.5} fill={totals[i].future?colors.muted:colors.primary}/>)}
   </Svg>}
   <View style={s.axis}>{totals.filter((_,i)=>i%step===0||i===totals.length-1).map(t=><Text key={t.month} style={s.axisLabel}>{label(t.month,kind==='monthly'?'MMM':'d')}</Text>)}</View>
  </View>:<Text style={s.empty}>No recorded expenses in this period.</Text>}
  <View style={s.values}>{totals.map(t=><View key={t.month} style={s.row} accessible accessibilityLabel={label(t.month,pattern)+(t.end?' to '+label(t.end,'MMM d'):'')+': '+amount(t)+(t.future?', future-dated records':'')}>
   <View style={s.month}><Text style={s.label}>{label(t.month,pattern)}{t.end?' – '+label(t.end,'MMM d'):''}</Text>{kind==='monthly'&&t.month===currentMonth&&<Text style={s.caption}>Current month—in progress</Text>}{t.future&&<Text style={s.caption}>Future-dated records</Text>}</View><Text style={s.amount}>{amount(t)}</Text>
  </View>)}</View>
  <Text style={s.caption}>Recorded expenses, including future-dated entries. This is spending history, not a forecast.</Text>
 </View>;
}
const useStyles=createThemedStyles(c=>({
 container:{gap:16},caption:{...type.label,fontWeight:'400',color:c.muted},plot:{width:'100%',gap:8},scale:{...type.number,fontSize:12,color:c.muted,textAlign:'right'},
 axis:{flexDirection:'row',justifyContent:'space-between'},axisLabel:{...type.label,fontWeight:'400',color:c.muted},
 values:{gap:12},row:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8,alignItems:'center'},month:{gap:2},label:{...type.label,color:c.text},amount:{...type.number,fontSize:14,color:c.text},
 empty:{...type.body,color:c.muted,textAlign:'center',paddingVertical:28},
}));

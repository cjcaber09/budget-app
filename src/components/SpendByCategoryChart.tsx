import {View,Text} from 'react-native';
import {PieChart} from 'react-native-gifted-charts';
import {useMoney,useMoneyCents} from '../domain/money';
import type {Category,Transaction} from '../types/database';
import type {ReportCategory} from '../domain/reports';
import {reportShare} from '../domain/reports';
import {sumTransactionsForCategory} from '../domain/budgetMath';
import {createThemedStyles,type,useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
interface Props {categories?:Category[];transactions?:Transaction[];totals?:{id:string;spent:number}[];reportCategories?:ReportCategory[];expenseCents?:number;hideZeroValues?:boolean;onSelect?:(key:string)=>void}
export function SpendByCategoryChart({categories=[],transactions=[],totals,reportCategories,expenseCents,hideZeroValues=false,onSelect}:Props) {
 const s=useStyles(),colors=useColors();
 const moneyDecimal=useMoney(),moneyCents=useMoneyCents();
 const data=reportCategories?reportCategories.map(c=>({key:c.key,name:c.name,color:c.color,value:c.spent/100,cents:c.spent})):
  categories.map(c=>{const value=totals?(totals.find(t=>t.id===c.id)?.spent??0)/100:sumTransactionsForCategory(transactions,c.id);return {key:c.id,name:c.name,color:c.color,value,cents:Math.round(value*100)};}).filter(c=>c.value>0);
 const refunded=data.some(c=>c.value<0);
 const positive=data.filter(c=>c.value>0).sort((a,b)=>b.value-a.value);
 const total=data.reduce((n,c)=>n+c.value,0);
 const percentage=(c:typeof data[number])=>refunded?null:reportCategories?expenseCents===undefined?null:reportShare(c.cents,expenseCents):total>0?c.value/total*100:null;
 const money=(c:typeof data[number])=>reportCategories?moneyCents(c.cents):moneyDecimal(c.value);
 const visible=hideZeroValues?data.filter(c=>c.cents!==0):data;
 if(!reportCategories&&!positive.length)return <View style={s.empty}><Text style={s.emptyTitle}>A fresh start.</Text><Text style={s.muted}>Add an expense to see your category breakdown here.</Text></View>;
 return <View style={s.container}>
  {!refunded&&positive.length>0&&(!reportCategories||expenseCents!==undefined)?<View accessible accessibilityLabel={positive.map(c=>c.name+': '+money(c)+', '+(percentage(c)?.toFixed(1)??'unavailable')+' percent').join('. ')} style={s.chart}>
   <PieChart data={positive.map(c=>({value:c.value,color:c.color,text:c.name}))} donut radius={86} innerRadius={70} innerCircleColor={colors.surfaceAlt} centerLabelComponent={()=><View style={s.center}><Text style={s.centerNumber}>{positive.length}</Text><Text style={s.muted}>with spending</Text></View>}/>
  </View>:<Text style={s.muted}>{refunded?'Refunds exceed spending in some categories. Net amounts are shown below; percentage shares are unavailable.':expenseCents===undefined&&positive.length?'Chart percentages are unavailable until totals refresh.':'No net expenses in this month.'}</Text>}
  {visible.map(c=>{const p=percentage(c);const body=<><View style={[s.dot,{backgroundColor:c.color}]}/><Text style={s.name}>{c.name}</Text><View style={s.values}><Text style={s.amount}>{money(c)}</Text><Text style={s.percent}>{p===null?'—':p>0&&p<1?'<1%':Math.round(p)+'%'}</Text></View></>;return onSelect?<MotionPressable key={c.key} accessibilityLabel={'View '+c.name+' spending'} style={s.legend} onPress={()=>onSelect(c.key)}>{body}</MotionPressable>:<View key={c.key} style={s.legend}>{body}</View>;})}
  {hideZeroValues&&data.length>0&&!visible.length&&<Text style={s.muted}>Turn off Hide zero values to show all categories.</Text>}
 </View>;
}
const useStyles=createThemedStyles(c=>({
 container:{marginTop:16,gap:8},chart:{alignItems:'center',marginBottom:12},center:{alignItems:'center'},centerNumber:{...type.number,color:c.text,fontSize:28},
 muted:{...type.label,fontWeight:'400',color:c.muted,textAlign:'center'},legend:{minHeight:44,flexDirection:'row',alignItems:'center',gap:10},
 dot:{width:8,height:8,borderRadius:4},name:{...type.label,color:c.text,fontWeight:'400',flex:1},values:{gap:2,alignItems:'flex-end'},amount:{...type.number,color:c.text,fontSize:13},percent:{...type.number,color:c.muted,fontSize:12},
 empty:{paddingVertical:40,gap:8,alignItems:'center'},emptyTitle:{...type.heading,color:c.text},
}));

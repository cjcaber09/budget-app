import {Text,View} from 'react-native';
import {useActivityBalances} from '../hooks/useActivityBalances';
import {balanceActivityKey,type BalanceActivity} from '../domain/activityBalances';
import {type,useColors} from '../styles/theme';
import {ActivityBalanceChange,BalanceHistoryRetry} from './ActivityBalanceChange';

export function ActivityBalanceDetails({entry}:{entry:BalanceActivity}){
 const query=useActivityBalances([entry]),colors=useColors();
 const balance=query.data?.get(balanceActivityKey(entry));
 return <View style={{gap:12,marginBottom:28}}>
  <Text accessibilityRole="header" style={{...type.heading,color:colors.text}}>Recorded balance change</Text>
  {query.isError?<BalanceHistoryRetry onRetry={()=>void query.refetch()}/>:balance&&!query.isFetching?<ActivityBalanceChange balance={balance}/>:<Text style={{...type.body,color:colors.muted}}>Loading balance history…</Text>}
  <Text style={{...type.label,fontWeight:'400',color:colors.muted}}>These figures describe the saved entry. Running balances use complete account history, including fees, refunds and corrections, ordered by when entries affect the account. Editing records recalculates them.</Text>
 </View>;
}

import {Text,View} from 'react-native';
import {useActivityBalances} from '../hooks/useActivityBalances';
import {balanceActivityKey,type BalanceActivity} from '../domain/activityBalances';
import {type,useColors} from '../styles/theme';
import {ActivityBalanceChange,BalanceHistoryRetry} from './ActivityBalanceChange';

export function ActivityBalanceDetails({entry}:Readonly<{entry:BalanceActivity}>){
 const query=useActivityBalances([entry]),colors=useColors();
 const balance=query.data?.get(balanceActivityKey(entry));
 let content;
 if(query.isError)content=<BalanceHistoryRetry onRetry={()=>void query.refetch()}/>;
 else if(balance&&!query.isFetching)content=<ActivityBalanceChange balance={balance}/>;
 else content=<Text style={{...type.body,color:colors.muted}}>Loading balance history…</Text>;
 return <View style={{gap:12,marginBottom:28}}>
  <Text accessibilityRole="header" style={{...type.heading,color:colors.text}}>Recorded balance change</Text>
  {content}
  <Text style={{...type.label,fontWeight:'400',color:colors.muted}}>These figures describe the saved entry. Running balances use complete account history, including fees, refunds and corrections, ordered by when entries affect the account. Editing records recalculates them.</Text>
 </View>;
}

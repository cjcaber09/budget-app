import {Text,View} from 'react-native';
import {type ActivityBalance,type ActivityAccountBalance} from '../domain/activityBalances';
import {useMoneyCents} from '../domain/money';
import {type,useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';

const explanations = {
  unset:'Balance not set. Set this account’s starting balance to track changes.',
  opening:'Already included in the starting balance; this entry does not change it again.',
  scheduled:'Future-dated entry; it has not changed the current balance yet.',
};
function accountAmount(cents:number,account:ActivityAccountBalance,money:(cents:number)=>string) {
  if(account.method==='card'&&account.paymentType==='Credit card')return `${money(Math.abs(cents))} ${cents>0?'credit':'owed'}`;
  return money(cents);
}
export function ActivityBalanceChange({balance,methodId,compact=false}:Readonly<{balance:ActivityBalance;methodId?:string;compact?:boolean}>){
  const colors=useColors(),money=useMoneyCents();
  const accounts=balance.accounts.filter(a=>!methodId||a.methodId===methodId);
  return <View style={{gap:compact?8:16}}>
    {!accounts.length&&<Text style={{...type.label,color:colors.muted}}>Balance history unavailable for this entry.</Text>}
    {accounts.map(account=><View key={account.methodId} style={{gap:6}}>
      <Text style={{...type.label,color:colors.muted}}>{account.name}{balance.kind==='transfer'?' · Transfer balance change':''}</Text>
      {account.state==='applied'?<View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
        <View style={{flexGrow:1,flexBasis:112,gap:3}}><Text style={{...type.label,fontWeight:'400',color:colors.muted}}>Before</Text><Text style={{...type.number,fontSize:compact?13:16,color:colors.text}}>{accountAmount(account.beforeCents!,account,money)}</Text></View>
        <View style={{flexGrow:1,flexBasis:112,gap:3}}><Text style={{...type.label,fontWeight:'400',color:colors.muted}}>After</Text><Text style={{...type.number,fontSize:compact?13:16,color:colors.text}}>{accountAmount(account.afterCents!,account,money)}</Text></View>
      </View>:<Text style={{...type.label,fontWeight:'400',color:colors.muted}}>{explanations[account.state]}</Text>}
    </View>)}
    {balance.kind==='transfer'&&accounts.length>0&&<Text style={{...type.label,fontWeight:'400',color:colors.muted}}>Includes the transfer amount and fee.</Text>}
  </View>;
}
export function BalanceHistoryRetry({onRetry}:Readonly<{onRetry:()=>void}>){
  const colors=useColors();
  return <MotionPressable accessibilityLabel="Retry balance history" onPress={onRetry} style={{minHeight:48,justifyContent:'center',paddingVertical:12}}><Text style={{...type.label,color:colors.primary}}>Balance history unavailable. Retry</Text></MotionPressable>;
}

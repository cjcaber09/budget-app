import {Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {totalCash} from '../domain/totalCash';
import {useMoneyCents} from '../domain/money';
import {type,useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {createRequestId} from '../domain/ocr';
export function TotalCash() {
 const query=usePaymentMethods(),owner=usePreferencesStore(s=>s.profile?.user_id);
 return <TotalCashSummary query={query} owner={owner}/>;
}
export function TotalCashSummary({query,owner}:Readonly<{query:Pick<ReturnType<typeof usePaymentMethods>,'methods'|'isError'|'refetch'>;owner?:string}>){
 const colors=useColors(),money=useMoneyCents(),router=useRouter();
 let result:{cents:number|null;unset:number}|null=null,invalid=false;
 if(owner&&query.methods&&!query.isError){try{result=totalCash(query.methods,owner);}catch{invalid=true;}}
 const error=query.isError||invalid;
 return <View style={{gap:8}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text accessibilityRole="header" style={{...type.heading,color:colors.text,flex:1}}>Total cash</Text><Text accessibilityLiveRegion="polite" style={{...type.number,fontSize:24,color:colors.text,flexShrink:1}}>{error?'Unavailable':result?.cents!=null?money(result.cents):result?.unset?'Balance not set':'Loading…'}</Text></View>
  <Text style={{...type.label,fontWeight:'400',color:colors.muted}}>Current balances · Excludes credit cards, Other and archives.</Text>
  {!!result?.unset&&<MotionPressable style={{minHeight:44,justifyContent:'center'}} onPress={()=>router.push({pathname:'/settings',params:{section:'sources',visit:createRequestId()}})}><Text style={{...type.label,color:colors.primary}}>Set {result.unset===1?'the missing starting balance':`${result.unset} missing starting balances`} in Settings</Text></MotionPressable>}
  {error&&<MotionPressable accessibilityLabel="Retry total cash" style={{minHeight:44,justifyContent:'center'}} onPress={()=>void query.refetch()}><Text style={{...type.label,color:colors.primary}}>Could not load balances. Retry</Text></MotionPressable>}
 </View>;
}

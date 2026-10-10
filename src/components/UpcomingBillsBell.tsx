import {useContext,useState} from 'react';
import {Modal,ScrollView,Text,View} from 'react-native';
import {Bell,X} from 'lucide-react-native';
import {SafeAreaInsetsContext} from 'react-native-safe-area-context';
import {useReducedMotion} from 'react-native-reanimated';
import {MotionPressable} from './MotionPressable';
import {UpcomingBillList} from './UpcomingBillList';
import {QueryState} from './QueryState';
import {type,useColors} from '../styles/theme';
import type {useDashboard} from '../hooks/useDashboard';

export function UpcomingBillsBell({query}:Readonly<{query:Pick<ReturnType<typeof useDashboard>,'data'|'isPending'|'isError'|'refetch'>}>) {
 const colors=useColors();const insets=useContext(SafeAreaInsetsContext);const reduced=useReducedMotion();const [open,setOpen]=useState(false);
 const pending=query.data?.bills.filter(b=>b.state==='outstanding'||b.state==='replacement').length??0;
 const close=()=>setOpen(false);
 return <>
  <MotionPressable accessibilityLabel="Upcoming bills" accessibilityHint={pending?'There are upcoming bills.':'Open the upcoming bills list.'} onPress={()=>setOpen(true)} style={{width:48,minHeight:48,alignItems:'center',justifyContent:'center'}}>
   <Bell size={24} strokeWidth={1.7} color={colors.text}/>
   {pending>0&&<View testID="upcoming-bills-dot" accessible={false} style={{position:'absolute',right:8,bottom:8,width:8,height:8,borderRadius:4,backgroundColor:colors.danger}}/>}
  </MotionPressable>
  {open&&<Modal visible transparent animationType={reduced?'none':'slide'} onRequestClose={close} statusBarTranslucent>
   <View style={{flex:1,justifyContent:'flex-end'}}>
    <MotionPressable accessibilityLabel="Close upcoming bills sheet" onPress={close} style={{position:'absolute',inset:0,backgroundColor:colors.scrim}}/>
    <View accessibilityViewIsModal onAccessibilityEscape={close} style={{backgroundColor:colors.surface,borderTopLeftRadius:20,borderTopRightRadius:20,width:'100%',maxWidth:560,maxHeight:'90%',alignSelf:'center',paddingBottom:Math.max(insets?.bottom??0,16)}}>
     <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:24,paddingTop:12}}><Text accessibilityRole="header" style={{...type.heading,color:colors.text}}>Upcoming bills</Text><MotionPressable accessibilityLabel="Close upcoming bills" onPress={close} style={{width:48,minHeight:48,alignItems:'center',justifyContent:'center'}}><X size={20} color={colors.text}/></MotionPressable></View>
     <ScrollView contentContainerStyle={{paddingHorizontal:24,paddingBottom:24}}><QueryState loading={query.isPending} error={query.isError} retry={()=>void query.refetch()}>{query.data&&<UpcomingBillList key={query.data.month} snapshot={query.data} onNavigate={close}/>}</QueryState></ScrollView>
    </View>
   </View>
  </Modal>}
 </>;
}

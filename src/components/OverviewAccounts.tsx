import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ComponentProps} from 'react';
import {Platform,Text,View} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import Animated,{cancelAnimation,runOnJS,useAnimatedStyle,useReducedMotion,useSharedValue,withSpring,withTiming,type SharedValue} from 'react-native-reanimated';
import {LinearGradient} from 'expo-linear-gradient';
import {ArrowUpRight,ChevronLeft,ChevronRight,CreditCard,Landmark,Wallet} from 'lucide-react-native';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useMoneyCents} from '../domain/money';
import {accountBalance,accountGradient,cashContributor,deckAccounts,nextAccountId,orderedAccounts,survivingAccountId} from '../domain/overviewAccounts';
import type {PaymentMethod} from '../domain/paymentMethods';
import {type,useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {PaymentMethodDialog} from './PaymentMethodPicker';
import {TotalCashSummary} from './TotalCash';

type ScrollGesture=ReturnType<typeof Gesture.Native>;
const peeks=[56,32,18];
const spring={damping:26,stiffness:240,overshootClamping:true};
export function OverviewAccounts({scrollGesture}:Readonly<{scrollGesture:ScrollGesture}>){
 const owner=usePreferencesStore(s=>s.profile?.user_id);
 return <AccountWorkspace key={owner??'loading'} owner={owner} scrollGesture={scrollGesture}/>;
}
function AccountWorkspace({owner,scrollGesture}:Readonly<{owner?:string;scrollGesture:ScrollGesture}>){
 const query=usePaymentMethods(),colors=useColors();
 const accounts=useMemo(()=>orderedAccounts(query.methods??[],owner??''),[query.methods,owner]);
 const [details,setDetails]=useState<string|null>(null);
 const method=query.methods?.find(m=>m.id===details&&m.user_id===owner);
 return <View style={{gap:18}}>
  <TotalCashSummary query={query} owner={owner}/>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}>
   <Text accessibilityRole="header" style={{...type.label,color:colors.muted}}>Your accounts</Text>
   <Text style={{...type.label,color:colors.muted,fontWeight:'400'}}>Current balances</Text>
  </View>
  {!query.methods&&!query.isError&&<View accessibilityLabel="Loading accounts" style={{height:280,borderRadius:16,backgroundColor:colors.surfaceAlt}}/>}
  {query.isError&&<MotionPressable accessibilityLabel="Retry account balances" onPress={()=>void query.refetch()} style={{padding:20,borderRadius:16,backgroundColor:colors.surfaceAlt}}><Text style={{...type.body,color:colors.text}}>Balances unavailable. Retry</Text></MotionPressable>}
  {!query.isError&&query.methods&&accounts.length>0&&<PaymentMethodDeck methods={accounts} scrollGesture={scrollGesture} onOpen={m=>setDetails(m.id)}/>}
  {!query.isError&&query.methods&&accounts.length===0&&<Text style={{...type.body,color:colors.muted}}>No active accounts. Add a payment method in Settings.</Text>}
  {method&&<PaymentMethodDialog initial={method} onClose={()=>setDetails(null)}/>}
 </View>;
}

export function PaymentMethodDeck({methods,scrollGesture,onOpen}:Readonly<{methods:PaymentMethod[];scrollGesture:ScrollGesture;onOpen:(method:PaymentMethod)=>void}>){
 const colors=useColors(),reduced=useReducedMotion();
 const [selection,setSelection]=useState(()=>({id:methods[0]?.id as string|undefined,ids:methods.map(m=>m.id)})),[height,setHeight]=useState(232),[movingFrom,setMovingFrom]=useState<string>();
 const drag=useSharedValue(0),locked=useSharedValue(0),generation=useSharedValue(0),gestureBlocked=useSharedValue(0);
 const stage=useRef<View>(null),focusAfterStep=useRef(false);
 const signature=methods.map(m=>m.id).join(':');
 const ids=useMemo(()=>signature?signature.split(':'):[],[signature]);
 const surviving=survivingAccountId(ids,selection.ids,selection.id);
 const current=surviving===undefined?undefined:String(surviving);
 const moving=movingFrom!==undefined&&movingFrom===current;
 if(signature!==selection.ids.join(':')){setSelection({id:current,ids});setMovingFrom(undefined);}
 const index=Math.max(0,ids.indexOf(current??'')),front=methods[index];
 const visible=deckAccounts(methods,current),reserve=peeks.slice(0,Math.max(0,visible.length-1)).reduce((a,b)=>a+b,0);
 useLayoutEffect(()=>{generation.set(generation.get()+1);cancelAnimation(drag);drag.set(0);locked.set(0);return()=>{generation.set(generation.get()+1);cancelAnimation(drag);};},[signature,drag,locked,generation]);
 useLayoutEffect(()=>{drag.set(0);locked.set(0);},[selection,drag,locked]);
 useEffect(()=>{if(Platform.OS==='web'&&focusAfterStep.current){focusAfterStep.current=false;(stage.current as unknown as HTMLElement|null)?.querySelector<HTMLElement>('[role="button"]')?.focus();}},[current]);
 const finish=useCallback((target:string|undefined,token:number)=>{
  if(token!==generation.get()||!target||!ids.includes(target))return;
  setSelection({id:target,ids});
 },[generation,ids]);
 const transition=useCallback((direction:number)=>{
  if(locked.get()||ids.length<2)return;
  locked.set(1);setMovingFrom(current);
  const target=nextAccountId(ids,current,direction),token=generation.get();
  if(reduced){finish(target,token);return;}
  drag.set(withTiming(direction>0?120:-120,{duration:180},finished=>{if(finished)runOnJS(finish)(target,token);}));
 },[locked,ids,current,generation,reduced,finish,drag]);
 const open=useCallback(()=>{if(front&&!locked.get())onOpen(front);},[front,locked,onOpen]);
 const directionalTouch=Platform.OS!=='web'||typeof CSS!=='undefined'&&CSS.supports('touch-action','pan-x pan-down');
 const pan=useMemo(()=>Gesture.Pan().withTestId('overview-account-pan').enabled(methods.length>1&&directionalTouch).activeOffsetY(12).failOffsetY(-12).failOffsetX([-20,20]).maxPointers(1).shouldCancelWhenOutside(false).blocksExternalGesture(scrollGesture)
  .onBegin(()=>{gestureBlocked.set(locked.get());})
  .onUpdate(event=>{if(!gestureBlocked.get()&&!locked.get()&&!reduced)drag.set(Math.max(0,Math.min(120,event.translationY*.7)));})
  .onEnd((event,success)=>{
   if(!success||gestureBlocked.get()||locked.get())return;
   if(event.translationY>=48||(event.translationY>=12&&event.velocityY>=650))runOnJS(transition)(1);
   else drag.set(withSpring(0,spring));
  }).onFinalize((_event,success)=>{if(!success&&!locked.get())drag.set(withSpring(0,spring));}),[methods.length,directionalTouch,scrollGesture,locked,reduced,drag,transition,gestureBlocked]);
 const tap=useMemo(()=>Gesture.Tap().maxDistance(10).onBegin(()=>{gestureBlocked.set(locked.get());}).onEnd((event,success)=>{if(success&&!gestureBlocked.get()&&!locked.get()&&event.y>=reserve)runOnJS(open)();}),[locked,reserve,open,gestureBlocked]);
 const gesture=useMemo(()=>Gesture.Race(pan,tap),[pan,tap]);
 return <View style={{gap:14}}>
  <GestureDetector gesture={gesture} touchAction={(methods.length>1&&directionalTouch?'pan-x pan-down':'auto') as ComponentProps<typeof GestureDetector>['touchAction']}>
   <View ref={stage} testID="payment-method-deck" collapsable={false} style={{height:height+reserve,overflow:'visible'}}>
    {[...visible].reverse().map(({method,depth})=><AccountCard key={method.id} method={method} depth={depth} reserve={reserve} drag={drag} reduced={reduced}
     onHeight={value=>{if(depth===0)setHeight(old=>Math.abs(old-value)>1?value:old);}} onOpen={open}
     onStep={(direction,keyboard)=>{focusAfterStep.current=!!keyboard;transition(direction);}} disabled={moving}/>)}
   </View>
  </GestureDetector>
  {methods.length>1&&<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
   <Text accessibilityLiveRegion="polite" style={{...type.label,color:colors.muted,fontWeight:'400'}}>{index+1} of {methods.length} · Swipe down for next account</Text>
   <View style={{flexDirection:'row',gap:8}}>{([-1,1] as const).map(direction=><MotionPressable key={direction} accessibilityLabel={direction>0?'Next account':'Previous account'} disabled={moving}
    onPress={()=>transition(direction)} style={{width:48,height:48,borderRadius:24,backgroundColor:colors.surfaceAlt,alignItems:'center',justifyContent:'center'}}>
    {direction>0?<ChevronRight size={20} color={colors.primary}/>:<ChevronLeft size={20} color={colors.primary}/>}</MotionPressable>)}</View>
  </View>}
 </View>;
}

function AccountCard({method,depth,reserve,drag,reduced,onHeight,onOpen,onStep,disabled}:Readonly<{
 method:PaymentMethod;depth:number;reserve:number;drag:SharedValue<number>;reduced:boolean;onHeight:(height:number)=>void;onOpen:()=>void;onStep:(direction:number,keyboard?:boolean)=>void;disabled:boolean;
}>){
 const money=useMoneyCents(),currency=usePreferencesStore(s=>s.profile?.currency??'USD'),balance=accountBalance(method);
 const rank=useSharedValue(depth),[measured,setMeasured]=useState(232),[keyboardFocus,setKeyboardFocus]=useState(false);
 useEffect(()=>{rank.set(reduced?depth:withSpring(depth,spring));},[depth,reduced,rank]);
 const animated=useAnimatedStyle(()=>{
  const d=Math.max(0,Math.min(3,rank.get())),lower=Math.floor(d),fraction=d-lower;
  const positions=[reserve,reserve-56,reserve-88,reserve-106];
  const top=positions[lower]+fraction*((positions[Math.min(3,lower+1)]??0)-positions[lower]);
  const offset=depth===0?drag.get():0,scale=(1-d*.04)*(1-Math.min(Math.abs(offset)/1600,.06));
  return {transform:[{translateY:top-measured*(1-scale)/2+offset},{scale}],opacity:depth===0?1-Math.min(Math.abs(offset)/180,.7):1};
 });
 const Icon=method.method==='bank_account'?Landmark:method.method==='card'?CreditCard:Wallet;
 const front=depth===0;
 const webProps=Platform.OS==='web'?{tabIndex:front?0 as const:-1 as const,onKeyDown:(event:{key:string;preventDefault:()=>void})=>{
  if(disabled||!front)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen();}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();onStep(event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1,true);}
 }}:{};
 return <Animated.View {...webProps} pointerEvents={front?'auto':'none'} accessible={front} accessibilityRole={front?'button':undefined}
  onFocus={()=>setKeyboardFocus(Platform.OS==='web'&&typeof document!=='undefined'&&document.activeElement?.matches(':focus-visible')===true)} onBlur={()=>setKeyboardFocus(false)}
  accessibilityElementsHidden={!front} importantForAccessibility={front?'yes':'no-hide-descendants'} aria-hidden={!front}
  accessibilityLabel={`${method.name}, ${method.payment_type}${method.last_four?', ending '+method.last_four:''}, ${balance.label}${balance.cents===null?'':', '+money(balance.cents)}`}
  accessibilityHint="Open account details. Swipe down for the next account." onAccessibilityTap={front?onOpen:undefined}
  accessibilityActions={front?[{name:'activate'},{name:'increment'},{name:'decrement'}]:[]}
  onAccessibilityAction={event=>{if(disabled||!front)return;const action=event.nativeEvent.actionName;if(action==='activate')onOpen();else onStep(action==='increment'?1:-1);}}
  style={[{position:'absolute',top:0,left:0,right:0,zIndex:20-depth,borderRadius:16,outlineWidth:keyboardFocus&&front?2:0,outlineOffset:4,outlineColor:'#84591B',boxShadow:front?'0px 14px 26px rgba(10, 30, 23, 0.22)':'0px 4px 12px rgba(10, 30, 23, 0.10)'},animated]}>
  <LinearGradient colors={accountGradient(method)} start={{x:0,y:0}} end={{x:1,y:1}} style={{borderRadius:16,overflow:'hidden'}}>
   <View onLayout={event=>{const h=Math.ceil(event.nativeEvent.layout.height);setMeasured(old=>old===h?old:h);onHeight(h);}} style={{padding:20,paddingTop:front?20:10,minHeight:224}}>
    <View pointerEvents="none" style={{position:'absolute',bottom:25,right:12,opacity:.08}}><Icon size={136} color="#FFFFFF" strokeWidth={1}/></View>
    <View style={{flexDirection:'row',alignItems:'flex-start',gap:12}}>
     <View style={{flex:1,gap:2}}><Text style={{...type.heading,fontSize:front?22:18,lineHeight:front?28:22,fontWeight:'800',color:'#FFFFFF'}}>{method.name}</Text><Text style={{...type.label,color:'#FFFFFF',fontWeight:'400'}}>{method.payment_type}</Text></View>
     {method.last_four?<Text style={{...type.number,fontSize:13,color:'#FFFFFF',paddingTop:4}}>•••• {method.last_four}</Text>:<Icon size={23} color="#FFFFFF"/>}
    </View>
    <View style={{marginTop:26,gap:4}}><Text style={{...type.label,color:'#FFFFFF',fontWeight:'400'}}>{balance.label} · {currency}</Text>
     {balance.cents!==null&&<Text style={{...type.number,fontWeight:'700',fontSize:money(balance.cents).length>17?26:34,lineHeight:44,color:'#FFFFFF',letterSpacing:-.7}}>{money(balance.cents)}</Text>}
     {balance.state==='unset'&&<Text style={{...type.body,fontWeight:'600',color:'#FFFFFF'}}>Set a starting balance</Text>}
    </View>
    <View style={{marginTop:26,flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1,gap:1}}>
     <Text style={{...type.label,color:'#FFFFFF',fontWeight:'400'}}>Manually tracked</Text><Text style={{...type.label,color:'#FFFFFF'}}>{cashContributor(method)?'Included in Total cash':'Tracked separately'}</Text>
    </View><ArrowUpRight size={20} color="#FFFFFF"/></View>
   </View>
  </LinearGradient>
 </Animated.View>;
}

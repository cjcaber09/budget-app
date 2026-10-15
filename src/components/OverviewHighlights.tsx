import {useEffect,useRef,useState} from 'react';
import {Platform,Pressable,Text,View,type LayoutRectangle} from 'react-native';
import Animated,{useAnimatedStyle,useReducedMotion,useSharedValue,withSpring,withTiming} from 'react-native-reanimated';
import {useRouter} from 'expo-router';
import {format,parseISO} from 'date-fns';
import {ArrowDownLeft,ArrowLeftRight,ArrowUpRight,ChevronRight,RotateCcw,Tag} from 'lucide-react-native';
import {useOverviewHighlights} from '../hooks/useOverviewHighlights';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {activityKey,type HistoryActivity} from '../domain/activityPages';
import {useMoneyCents} from '../domain/money';
import {createRequestId} from '../domain/ocr';
import type {ReportSection} from '../domain/reports';
import {type,useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {PaymentMethodDialog} from './PaymentMethodPicker';

const tabs=['Recent','Categories','Methods'] as const;
export function OverviewHighlights({month}:Readonly<{month:string}>){
 const owner=usePreferencesStore(s=>s.profile?.user_id);
 return <HighlightsWorkspace key={owner??'loading'} month={month}/>;
}
function HighlightsWorkspace({month}:Readonly<{month:string}>){
 const query=useOverviewHighlights(month),methods=usePaymentMethods(),colors=useColors(),money=useMoneyCents(),router=useRouter();
 const [tab,setTab]=useState(0),[details,setDetails]=useState<string|null>(null);
 const method=methods.methods?.find(m=>m.id===details);
 const categoryRows=query.data?.categories,methodRows=query.data?.methods;
 const link=(label:string,onPress:()=>void)=><MotionPressable onPress={onPress} style={{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><Text style={{...type.label,color:colors.primary}}>{label}</Text><ChevronRight size={16} color={colors.primary}/></MotionPressable>;
 const empty=(text:string)=><Text style={{...type.body,color:colors.muted,paddingVertical:24}}>{text}</Text>;
 const state=<Text style={{...type.body,color:colors.muted,paddingVertical:24}}>{!query.supported?'Choose a supported month to see highlights.':query.isError?'Could not load highlights.':'Loading highlights…'}</Text>;
 const retry=()=>void query.refetch();
 return <View style={{gap:16}} testID="overview-highlights">
  <View style={{gap:4}}><Text accessibilityRole="header" style={{...type.heading,color:colors.text}}>Monthly highlights</Text><Text style={{...type.label,fontWeight:'400',color:colors.muted}}>{format(parseISO(month),'MMMM yyyy')} · Includes future-dated entries</Text></View>
  <HighlightTabs selected={tab} onChange={setTab}/>
  {!query.data||query.isError||!query.supported?<View>{state}{query.isError&&link('Retry highlights',retry)}</View>:<HighlightPanels selected={tab} dataset={JSON.stringify([month,query.data])} panels={[
   <HighlightSection key="recent" section={query.data.recent} retry={retry}>{rows=><View>{rows.length?rows.map(row=><RecentRow key={activityKey(row)} row={row} today={query.today}/>):empty('No transactions recorded this month.')}{link('View all transactions',()=>router.push('/transactions'))}</View>}</HighlightSection>,
   <HighlightSection key="categories" section={categoryRows!} retry={retry}>{rows=><View>{rows.length?rows.map((c,index)=><MotionPressable key={c.key} accessibilityLabel={`${c.name}, net spending ${money(c.spent)}`} onPress={()=>c.id?router.push({pathname:'/budget/[categoryId]',params:{categoryId:c.id,month,visit:createRequestId()}}):router.push({pathname:'/report/[kind]',params:{kind:'cashflow',month,filter:'uncategorized',visit:createRequestId()}})} style={{minHeight:76,paddingVertical:14,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',alignItems:'center',gap:12}}>
    <Text style={{...type.number,fontSize:13,color:colors.muted,width:18}}>{index+1}</Text><View style={{width:8,height:32,borderRadius:4,backgroundColor:c.color}}/>
    <View style={{flex:1,gap:2}}><Text style={{...type.body,fontWeight:'600',color:colors.text}}>{c.name}</Text><Text style={{...type.label,fontWeight:'400',color:colors.muted}}>Net spending after refunds</Text></View><Text style={{...type.number,fontSize:15,color:colors.text,flexShrink:1}}>{money(c.spent)}</Text><ChevronRight size={14} color={colors.subtle}/>
   </MotionPressable>):empty('No positive category spending this month.')}{link('View category reports',()=>router.push('/reports'))}</View>}</HighlightSection>,
   <HighlightSection key="methods" section={methodRows!} retry={retry}>{rows=><View>{rows.length?rows.map((m,index)=><MotionPressable key={m.key} accessibilityLabel={`${m.name}, ${m.paymentType}${m.lastFour?', ending '+m.lastFour:''}, ${m.count} expense payments${m.archived?', archived':''}`} onPress={()=>setDetails(m.id)} style={{minHeight:76,paddingVertical:14,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',alignItems:'center',gap:12}}>
    <Text style={{...type.number,fontSize:13,color:colors.muted,width:18}}>{index+1}</Text><View style={{flex:1,gap:2}}><Text style={{...type.body,fontWeight:'600',color:colors.text}}>{m.name}{m.archived?' · Archived':''}</Text><Text style={{...type.label,fontWeight:'400',color:colors.muted}}>{m.paymentType}{m.lastFour?' · •••• '+m.lastFour:''}</Text></View><Text style={{...type.number,fontSize:15,color:colors.text}}>{m.count} {m.count===1?'payment':'payments'}</Text><ChevronRight size={14} color={colors.subtle}/>
   </MotionPressable>):empty('No expense payments recorded this month.')}{link('View account spending',()=>router.push({pathname:'/report/[kind]',params:{kind:'accounts',month,visit:createRequestId()}}))}</View>}</HighlightSection>,
  ]}/>}
  {details&&!method&&<View><Text style={{...type.body,color:colors.muted}}>{methods.isPending?'Loading account details…':'Account details unavailable.'}</Text>{!methods.isPending&&link('Retry account details',()=>void methods.refetch())}</View>}
  {method&&<PaymentMethodDialog initial={method} onClose={()=>setDetails(null)}/>}
 </View>;
}

function HighlightSection<T>({section,retry,children}:Readonly<{section:ReportSection<T[]>;retry:()=>void;children:(rows:T[])=>React.ReactNode}>){
 const colors=useColors();
 return section.data?children(section.data):<View style={{gap:12,paddingVertical:24}}><Text style={{...type.body,color:colors.muted}}>{section.error}</Text><MotionPressable onPress={retry} style={{minHeight:44,justifyContent:'center'}}><Text style={{...type.label,color:colors.primary}}>Retry this list</Text></MotionPressable></View>;
}

export function HighlightTabs({selected,onChange}:Readonly<{selected:number;onChange:(index:number)=>void}>){
 const colors=useColors(),reduced=useReducedMotion(),[layouts,setLayouts]=useState<Record<number,LayoutRectangle>>({}),[focus,setFocus]=useState<number|null>(null);
 const refs=useRef<(React.ElementRef<typeof Pressable>|null)[]>([]),x=useSharedValue(0),width=useSharedValue(0);
 const target=layouts[selected];
 useEffect(()=>{if(!target)return;x.value=reduced?target.x:withSpring(target.x,{damping:25,stiffness:260,overshootClamping:true});width.value=reduced?target.width:withSpring(target.width,{damping:25,stiffness:260,overshootClamping:true});},[target,reduced,x,width]);
 const indicator=useAnimatedStyle(()=>({transform:[{translateX:x.value}],width:width.value}));
 return <View accessibilityRole="tablist" accessibilityLabel="Monthly highlights" style={{alignSelf:'center',width:'100%',maxWidth:390,padding:5,borderRadius:30,backgroundColor:colors.surfaceAlt,flexDirection:'row'}}>
  <Animated.View testID="highlight-tab-indicator" pointerEvents="none" style={[{position:'absolute',left:0,top:5,bottom:5,borderRadius:25,backgroundColor:colors.primary},indicator]}/>
  {tabs.map((label,index)=><Pressable key={label} ref={ref=>{refs.current[index]=ref;}} accessibilityRole="tab" accessibilityState={{selected:index===selected}} aria-selected={index===selected} accessibilityLabel={label}
   {...(Platform.OS==='web'?{tabIndex:index===selected?0:-1,onKeyDown:(event:{key:string;preventDefault:()=>void})=>{const next=event.key==='Home'?0:event.key==='End'?2:event.key==='ArrowRight'?(selected+1)%3:event.key==='ArrowLeft'?(selected+2)%3:null;if(next!==null){event.preventDefault();onChange(next);refs.current[next]?.focus();}}}:{})}
   onLayout={event=>{const layout=event.nativeEvent.layout;setLayouts(old=>old[index]?.x===layout.x&&old[index]?.width===layout.width?old:{...old,[index]:layout});}}
   onFocus={()=>setFocus(index)} onBlur={()=>setFocus(null)} onPress={()=>onChange(index)}
   style={{flex:1,minHeight:48,paddingHorizontal:6,paddingVertical:12,alignItems:'center',justifyContent:'center',borderRadius:25,borderWidth:2,borderColor:focus===index?colors.warning:'transparent'}}><Text style={{...type.label,fontWeight:'600',color:index===selected?colors.onPrimary:colors.muted}}>{label}</Text></Pressable>)}
 </View>;
}
function HighlightPanels({selected,dataset,panels}:Readonly<{selected:number;dataset:string;panels:React.ReactNode[]}>){
 const [heights,setHeights]=useState<Record<string,number>>({});
 return <View style={{height:Math.max(120,...Object.values(heights))}}>{panels.map((panel,index)=><HighlightPanel key={index} active={index===selected} onHeight={height=>setHeights(old=>old[dataset+index]===height?old:{...Object.fromEntries(Object.entries(old).filter(([key])=>key.startsWith(dataset))),[dataset+index]:height})}>{panel}</HighlightPanel>)}</View>;
}
function HighlightPanel({active,onHeight,children}:Readonly<{active:boolean;onHeight:(height:number)=>void;children:React.ReactNode}>){
 const reduced=useReducedMotion(),opacity=useSharedValue(active?1:0);
 useEffect(()=>{opacity.value=reduced?(active?1:0):withTiming(active?1:0,{duration:150});},[active,reduced,opacity]);
 const style=useAnimatedStyle(()=>({opacity:opacity.value}));
 return <Animated.View pointerEvents={active?'auto':'none'} accessibilityElementsHidden={!active} importantForAccessibility={active?'auto':'no-hide-descendants'} aria-hidden={!active}
  {...(Platform.OS==='web'?{inert:!active}: {})} onLayout={event=>onHeight(Math.ceil(event.nativeEvent.layout.height))} style={[{position:'absolute',left:0,right:0,top:0},style]}>{children}</Animated.View>;
}

function RecentRow({row,today}:Readonly<{row:HistoryActivity;today:string}>){
 const colors=useColors(),money=useMoneyCents(),router=useRouter();
 // These labels come from the same SQL snapshot as the activity, never a separate label fetch.
 const labels=row as unknown as {category?:string;payment_account?:string;payment_type?:string;last_four?:string};
 const transfer=row.type==='transfer',refund=row.type==='refund',income=row.type==='income';
 const name=transfer?'Transfer':refund?'Refund · '+(labels.category||'Uncategorized'):income?'Income':labels.category||'Uncategorized';
 const Icon=transfer?ArrowLeftRight:refund?RotateCcw:income?ArrowDownLeft:Tag;
 const cents=transfer?Math.round(Number(row.amount)*100):Math.round(row.amount*100);
 const date=row.financial_date!,account=transfer?`${row.source_label} → ${row.destination_label}`:[labels.payment_account??'Cash',labels.payment_type,labels.last_four?'•••• '+labels.last_four:null].filter(Boolean).join(' · ');
 const open=()=>transfer?router.push({pathname:'/transfer/[id]',params:{id:row.id,visit:createRequestId()}}):router.push({pathname:'/transaction/[id]',params:{id:row.refund_of??row.id,refundId:refund?row.id:undefined,visit:createRequestId()}});
 return <MotionPressable accessibilityLabel={`${name}, ${money(cents)}${transfer?' received, principal excluded from spending':''}, ${format(parseISO(date),'MMM d, yyyy')}, ${account}${row.note?', '+row.note:''}${date>today?', future-dated entry':''}`} onPress={open} style={{paddingVertical:16,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',alignItems:'flex-start',gap:12}}>
  <View style={{width:36,height:36,borderRadius:10,backgroundColor:colors.surfaceAlt,alignItems:'center',justifyContent:'center'}}><Icon size={18} color={income||refund?colors.success:colors.primary}/></View>
  <View style={{flex:1,gap:3,minWidth:0}}><View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',gap:8,justifyContent:'space-between'}}><Text style={{...type.body,fontWeight:'600',color:colors.text,flexShrink:1}}>{name}</Text><Text style={{...type.number,fontSize:15,color:income||refund?colors.success:colors.text}}>{income||refund?'+':transfer?'':'−'}{money(cents)}</Text></View>
   {!!row.note&&<Text numberOfLines={2} style={{...type.label,fontWeight:'400',color:colors.muted}}>{row.note}</Text>}
   <Text style={{...type.label,fontWeight:'400',color:colors.muted}}>{account}</Text><Text style={{...type.label,fontWeight:'400',color:colors.subtle}}>{format(parseISO(date),'MMM d, yyyy')}{transfer?' · Principal excluded from spending':''}</Text>
   {date>today&&<Text style={{...type.label,color:colors.warning}}>Future-dated entry</Text>}
  </View><ArrowUpRight size={14} color={colors.subtle}/>
 </MotionPressable>;
}

import {useEffect,useState} from 'react';
import {Platform,Text,View,useWindowDimensions} from 'react-native';
import type {BottomTabBarProps} from 'expo-router/build/react-navigation/bottom-tabs';
import {MotionPressable} from './MotionPressable';
import Svg,{Path} from 'react-native-svg';
import Animated,{Easing,ReduceMotion,useAnimatedProps,useAnimatedStyle,useReducedMotion,useSharedValue,withTiming} from 'react-native-reanimated';
import {LayoutDashboard,Receipt,ChartColumn,Settings} from 'lucide-react-native';
import {useColors,type} from '../styles/theme';
import {PRIMARY_TABS,primaryTabIndex,tabCutoutPath,tabCenter,liquidTabPath} from '../domain/tabNavigation';
import {tabBodyHeight} from '../constants/layout';
const AnimatedPath=Animated.createAnimatedComponent(Path);
const icons=[LayoutDashboard,Receipt,ChartColumn,Settings];
const labels=['Overview','Transactions','Reports','Settings'];
function FadeHighlight({selected,x}:{selected:boolean;x:number}){
 const colors=useColors(),opacity=useSharedValue(selected?1:0);
 useEffect(()=>{opacity.value=withTiming(selected?1:0,{duration:160,reduceMotion:ReduceMotion.Never});},[selected,opacity]);
 const style=useAnimatedStyle(()=>({opacity:opacity.value*.18}));
 return <Animated.View pointerEvents="none" style={[{position:'absolute',left:x-20,top:8,width:40,height:40,borderRadius:20,backgroundColor:colors.primary},style]}/>;
}
export function RaisedTabBar({state,descriptors,navigation,insets}:BottomTabBarProps){
 const colors=useColors(),reduced=useReducedMotion(),window=useWindowDimensions();
 const [width,setWidth]=useState(window.width);
 const selected=primaryTabIndex(state),baseHeight=tabBodyHeight(window.fontScale);
 const target=tabCenter(selected,width),head=useSharedValue(target),tail=useSharedValue(target);
 useEffect(()=>{
  // Reassigning timing animations starts at their current presentation values,
  // so rapid taps redirect both ends without snapping to the previous tab.
  if(reduced){head.value=target;tail.value=target;return;}
  head.value=withTiming(target,{duration:230,easing:Easing.out(Easing.cubic)});
  tail.value=withTiming(target,{duration:340,easing:Easing.inOut(Easing.cubic)});
 },[target,reduced,head,tail]);
 const trail=useAnimatedProps(()=>({d:liquidTabPath(head.value,tail.value,width)}));
 // Overlay the scene so the transparent notch reveals page content rather
 // than an empty navigator background below the scene.
 return <View testID="bottom-navigation" onLayout={event=>setWidth(event.nativeEvent.layout.width)} style={{position:'absolute',left:0,right:0,bottom:0,height:baseHeight+insets.bottom,marginTop:4,overflow:'visible'}}>
  <Svg pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" width={width} height={baseHeight+insets.bottom} style={{position:'absolute',top:0}}>
   <Path testID="navigation-surface" d={tabCutoutPath(width/2,width,baseHeight+insets.bottom,30)} fill={colors.surface}/>
   {!reduced&&<AnimatedPath testID="liquid-tab-highlight" animatedProps={trail} d={liquidTabPath(target,target,width)} fill={colors.primary} opacity={.18}/>}
  </Svg>
  {reduced&&PRIMARY_TABS.map((name,index)=><FadeHighlight key={name} selected={selected===index} x={tabCenter(index,width)}/>)}
  {PRIMARY_TABS.map((name,index)=>{
   const route=state.routes.find(r=>r.name===name);if(!route)return null;
   const options=descriptors[route.key].options,focused=selected===index,Icon=icons[index];
   return <MotionPressable key={route.key} role={Platform.OS==='ios'?'button':'tab'} accessibilityRole={Platform.OS==='ios'?'button':'tab'} aria-selected={focused} accessibilityState={{selected:focused}} accessibilityLabel={labels[index]} testID={`nav-${name}`}
    onPress={()=>{const event=navigation.emit({type:'tabPress',target:route.key,canPreventDefault:true});if(!event.defaultPrevented&&state.routes[state.index].key!==route.key)navigation.navigate(route.name,route.params);}}
    onLongPress={()=>navigation.emit({type:'tabLongPress',target:route.key})}
    style={{position:'absolute',left:tabCenter(index,width)-width/10,width:width/5,top:0,height:baseHeight,alignItems:'center',paddingTop:16}}
   >
    <View pointerEvents="none"><Icon size={24} color={focused?colors.primary:colors.muted}/></View>
    <Text pointerEvents="none" style={{...type.label,fontSize:width<360?10:11,lineHeight:16,position:'absolute',top:52,width:'100%',textAlign:'center',color:focused?colors.primary:colors.muted,paddingHorizontal:1}}>{typeof options.tabBarLabel==='string'?options.tabBarLabel:labels[index]}</Text>
   </MotionPressable>;
  })}
 </View>;
}

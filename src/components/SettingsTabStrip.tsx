import {useEffect,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {ChevronLeft,ChevronRight,type LucideIcon} from 'lucide-react-native';
import {MotionPressable} from './MotionPressable';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';

export function SettingsTabStrip<T extends string>({tabs,selected,onSelect}:Readonly<{
 tabs:readonly {id:T;label:string;icon:LucideIcon}[];selected:T;onSelect:(id:T)=>void;
}>){
 const colors=useColors(),form=useFormStyles(),scroll=useRef<ScrollView>(null);
 const positions=useRef<Record<string,{x:number;width:number}>>({});
 const [width,setWidth]=useState(0),[contentWidth,setContentWidth]=useState(0),[offset,setOffset]=useState(0);
 const maxOffset=Math.max(0,contentWidth-width),more=contentWidth>width+1,atEnd=offset>=maxOffset-2;
 function reveal(id:T){
  const item=positions.current[id];if(!item||!width)return;
  const target=item.x<offset?item.x:item.x+item.width>offset+width?item.x+item.width-width:offset;
  if(target!==offset)scroll.current?.scrollTo({x:Math.max(0,target),animated:false});
 }
 useEffect(()=>{reveal(selected);},[selected,width,contentWidth]); // eslint-disable-line react-hooks/exhaustive-deps
 return <View style={{flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border}}>
  <ScrollView ref={scroll} horizontal accessibilityLabel="Settings tabs" showsHorizontalScrollIndicator={false}
   keyboardShouldPersistTaps="handled" style={{flex:1,minWidth:0}} contentContainerStyle={{gap:20}}
   onLayout={event=>setWidth(event.nativeEvent.layout.width)} onContentSizeChange={setContentWidth}
   scrollEventThrottle={32} onScroll={event=>setOffset(event.nativeEvent.contentOffset.x)}>
   {tabs.map(({id,label,icon:Icon})=><MotionPressable key={id} accessibilityRole="tab" accessibilityLabel={label}
    accessibilityState={{selected:selected===id}} aria-selected={selected===id}
    onLayout={event=>{positions.current[id]=event.nativeEvent.layout;}}
    onPress={()=>{onSelect(id);reveal(id);}}
    style={{minHeight:48,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:7,borderBottomWidth:2,borderBottomColor:selected===id?colors.primary:'transparent'}}>
    <Icon size={17} color={selected===id?colors.primary:colors.muted}/><Text style={selected===id?form.chipTextSelected:form.chipText}>{label}</Text>
   </MotionPressable>)}
  </ScrollView>
  {more&&<MotionPressable accessibilityLabel={atEnd?'Back to first settings tabs':'More settings tabs'} style={{width:48,minHeight:48,alignItems:'center',justifyContent:'center'}}
   onPress={()=>scroll.current?.scrollTo({x:atEnd?0:Math.min(maxOffset,offset+width*0.75),animated:false})}>
   {atEnd?<ChevronLeft size={18} color={colors.primary}/>:<ChevronRight size={18} color={colors.primary}/>}
  </MotionPressable>}
 </View>;
}

import {useEffect,useId,useRef,useState} from 'react';
import {Platform,ScrollView,Text,TextInput,View,type TextInputKeyPressEvent,type ViewProps} from 'react-native';
import {Check,Search,X} from 'lucide-react-native';
import {paymentMethodLabel} from '../domain/paymentMethods';
import type {AccountChoice} from './TransferMethodCreation';
import {useFormStyles} from '../styles/forms';
import {type as typography,useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';

interface Props {
 label:string;
 value:string;
 excludedId:string;
 methods:AccountChoice[];
 open:boolean;
 disabled:boolean;
 onOpen:()=>void;
 onClose:()=>void;
 onChange:(id:string)=>void;
 onCreate:()=>void;
}

export function TransferAccountAutocomplete({label,value,excludedId,methods,open,disabled,onOpen,onClose,onChange,onCreate}:Readonly<Props>){
 const form=useFormStyles(),colors=useColors(),listId=useId();
 const input=useRef<TextInput>(null),list=useRef<ScrollView>(null);
 const layouts=useRef(new Map<string,{y:number;height:number}>()),listHeight=useRef(192);
 const [search,setSearch]=useState<string|null>(null),[highlight,setHighlight]=useState(-1);
 const selected=methods.find(method=>method.id===value);
 const selectedLabel=selected?selected.name:value?'Saved account':'';
 const selectedDetails=selected?[selected.payment_type!==selected.name?selected.payment_type:null,selected.last_four?`****${selected.last_four}`:null,selected.archived?'Archived':null].filter(Boolean).join(' · '):'';
 const text=value?selectedLabel:search??'';
 const term=(value?'':search??'').trim().toLowerCase();
 const choices=methods.filter(method=>method.id!==excludedId&&(!method.archived||method.id===value)&&paymentMethodLabel(method).toLowerCase().includes(term));
 const expanded=open&&!disabled;
 const activeId=expanded?choices[highlight]?.id:undefined;
 useEffect(()=>{
  const layout=activeId&&layouts.current.get(activeId);
  if(layout)list.current?.scrollTo({y:Math.max(0,layout.y+layout.height-listHeight.current),animated:false});
 },[activeId]);

 function select(method:AccountChoice){
  if(disabled)return;
  setSearch(null);setHighlight(-1);onChange(method.id);onClose();input.current?.blur();
 }
 function keepInputFocus(event:{preventDefault:()=>void}){
  // Keep web pointer presses on suggestions from blurring/unmounting the list first.
  if(Platform.OS==='web')event.preventDefault();
 }
 function keyPress(event:TextInputKeyPressEvent){
  const key=event.nativeEvent.key;
  if(disabled)return;
  if(key==='Escape'){setSearch(null);onClose();input.current?.blur();return;}
  if(key!=='ArrowDown'&&key!=='ArrowUp')return;
  event.preventDefault();onOpen();
  if(choices.length)setHighlight(index=>{
   if(index<0)return key==='ArrowDown'?0:choices.length-1;
   return (index+(key==='ArrowDown'?1:-1)+choices.length)%choices.length;
  });
 }
 function submit(){
  const choice=choices[highlight]??(choices.length===1?choices[0]:undefined);
  if(expanded&&choice)select(choice);
 }
 const webInputProps=Platform.OS==='web'?{
  'aria-autocomplete':'list' as const,'aria-controls':expanded?listId:undefined,
  'aria-expanded':expanded,'aria-disabled':disabled,
  'aria-activedescendant':activeId?`${listId}-${activeId}`:undefined,
 }:{};
 // RN's Role union omits listbox; RN Web forwards this standard ARIA role.
 const webListProps=Platform.OS==='web'?{role:'listbox' as ViewProps['role']}:{};
 return <View>
  <Text style={form.label}>{label}</Text>
  <View style={{borderWidth:1,borderColor:expanded?colors.primary:colors.border,borderRadius:8,backgroundColor:colors.surface,overflow:'hidden'}}>
   <View style={{flexDirection:'row',alignItems:'center'}}>
    <Search size={18} color={colors.muted} style={{marginLeft:14}} accessible={false}/>
    <TextInput ref={input} accessibilityLabel={label} accessibilityRole="combobox" accessibilityState={{expanded,disabled}} accessibilityHint="Type to search, then select an account."
     {...webInputProps} value={text} editable={!disabled} autoCorrect={false} autoCapitalize="none" autoComplete="off" selectTextOnFocus
     placeholder="Search accounts" placeholderTextColor={colors.subtle} submitBehavior="submit" returnKeyType="done"
     style={[form.input,{flex:1,minWidth:0,borderWidth:0,outlineWidth:0,backgroundColor:'transparent',paddingHorizontal:10}]}
     onFocus={()=>{if(!disabled){if(value)setSearch(null);setHighlight(-1);onOpen();}}} onBlur={onClose} onKeyPress={keyPress} onSubmitEditing={submit}
     onChangeText={next=>{if(disabled)return;setSearch(next);setHighlight(-1);onOpen();if(value)onChange('');}}/>
    {!!text&&<MotionPressable accessibilityLabel={`Clear ${label.toLowerCase()}`} disabled={disabled} onPointerDown={Platform.OS==='web'?keepInputFocus:undefined}
     onPress={()=>{setSearch('');setHighlight(-1);onChange('');onOpen();input.current?.focus();}}
     style={{minWidth:48,minHeight:50,alignItems:'center',justifyContent:'center'}}><X size={18} color={colors.muted}/></MotionPressable>}
   </View>
   {expanded&&<View style={{borderTopWidth:1,borderTopColor:colors.border}}>
    <ScrollView ref={list} nativeID={listId} {...webListProps} accessibilityLabel={`${label} suggestions`} style={{maxHeight:192}} keyboardShouldPersistTaps="always" nestedScrollEnabled
     onLayout={event=>{listHeight.current=event.nativeEvent.layout.height;}}>
     {choices.map((method,index)=><MotionPressable key={method.id} nativeID={`${listId}-${method.id}`} role={Platform.OS==='web'?'option':'button'}
      accessibilityLabel={`Select ${label.toLowerCase()} ${paymentMethodLabel(method)}`} accessibilityState={{selected:method.id===value}} tabIndex={-1}
      onPointerDown={Platform.OS==='web'?keepInputFocus:undefined} onPress={()=>select(method)}
      onLayout={event=>{layouts.current.set(method.id,event.nativeEvent.layout);}}
      style={{paddingHorizontal:14,paddingVertical:12,minHeight:48,flexDirection:'row',alignItems:'center',gap:10,backgroundColor:index===highlight||method.id===value?colors.selected:colors.surface}}>
      <Text style={{...typography.body,color:colors.text,flex:1}}>{paymentMethodLabel(method)}{method.archived?' · Archived':''}</Text>
      {method.id===value&&<Check size={18} color={colors.primary} accessible={false}/>}
     </MotionPressable>)}
     {choices.length===0&&<Text accessibilityLiveRegion="polite" style={[form.subtitle,{marginBottom:0,padding:14}]}>No matching accounts.</Text>}
    </ScrollView>
    <MotionPressable onPointerDown={Platform.OS==='web'?keepInputFocus:undefined} onPress={()=>{input.current?.blur();onCreate();}} style={{minHeight:48,padding:14,borderTopWidth:1,borderTopColor:colors.border}}>
     <Text style={form.chipTextSelected}>Add payment method</Text>
    </MotionPressable>
   </View>}
  </View>
  {!expanded&&!!selectedDetails&&<Text style={[form.subtitle,{marginTop:8,marginBottom:0}]}>{selectedDetails}</Text>}
  {!expanded&&!!search&&!value&&<Text style={[form.subtitle,{marginTop:8,marginBottom:0}]}>Choose an account from the suggestions.</Text>}
 </View>;
}

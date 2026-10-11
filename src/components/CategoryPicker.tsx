import {useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {ChevronRight,Check} from 'lucide-react-native';
import type {Category} from '../types/database';
import {useFormStyles} from '../styles/forms';
import {MotionPressable} from './MotionPressable';
import {ActionSheet} from './ActionSheet';
import {useColors} from '../styles/theme';

export function CategoryPicker({categories,value,onChange,compact=false}:Readonly<{
  categories:Category[];value:string;onChange:(id:string)=>void;compact?:boolean;
}>) {
  const styles=useFormStyles();
  const colors=useColors();const [open,setOpen]=useState(false),[search,setSearch]=useState('');
  const selected=categories.find(category=>category.id===value);
  const choices=categories.filter(category=>category.name.toLowerCase().includes(search.trim().toLowerCase()));
  if(compact)return <>
    <Text style={styles.label}>Category</Text>
    <MotionPressable accessibilityLabel="Choose category" style={[styles.secondaryButton,{marginTop:0,minHeight:50,borderRadius:8,flexDirection:'row',alignItems:'center',gap:12}]} onPress={()=>{setSearch('');setOpen(true);}}>
      <Text style={[styles.chipText,{flex:1}]}>{selected?.name??'Choose category'}</Text><ChevronRight size={18} color={colors.primary}/>
    </MotionPressable>
    <ActionSheet title="Choose category" visible={open} onClose={()=>setOpen(false)}>
      <TextInput accessibilityLabel="Search categories" value={search} onChangeText={setSearch} placeholder="Search categories" placeholderTextColor={colors.subtle} style={styles.input}/>
      {choices.map(category=><MotionPressable key={category.id} accessibilityLabel={`Select category ${category.name}`} accessibilityState={{selected:value===category.id}}
        style={[styles.secondaryButton,{flexDirection:'row',alignItems:'center',gap:12}]} onPress={()=>{onChange(category.id);setOpen(false);}}>
        <Text style={[styles.chipText,{flex:1}]}>{category.name}</Text>{value===category.id&&<Check size={18} color={colors.primary}/>}
      </MotionPressable>)}
      {!choices.length&&<Text style={styles.subtitle}>No matching categories.</Text>}
    </ActionSheet>
  </>;
  return <>
    <Text style={styles.label}>Category</Text>
    <View style={styles.optionRow}>{categories.map(category=><MotionPressable
      key={category.id} accessibilityState={{selected:value===category.id}}
      onPress={()=>onChange(category.id)} style={[styles.chip,value===category.id&&styles.chipSelected]}>
      <Text style={value===category.id?styles.chipTextSelected:styles.chipText}>{category.name}</Text>
    </MotionPressable>)}</View>
  </>;
}

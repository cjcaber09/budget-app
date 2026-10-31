import {useState} from 'react';
import {Text, View} from 'react-native';
import {ActionSheet} from './ActionSheet';
import {MotionPressable} from './MotionPressable';
import {useFormStyles} from '../styles/forms';

/** Offline labels only; no method creation or balances from a cached snapshot. */
export function DraftChoiceField({label,value,onChange,choices,emptyLabel}:Readonly<{
  label:string;value:string|null;onChange:(id:string|null)=>void;
  choices:{id:string;name:string;archived:boolean}[];emptyLabel:string;
}>) {
  const styles=useFormStyles(),[open,setOpen]=useState(false);
  const selected=choices.find(c=>c.id===value);
  return <View>
    <Text style={styles.label}>{label}</Text>
    <MotionPressable accessibilityLabel={'Choose '+label.toLowerCase()} style={styles.secondaryButton} onPress={()=>setOpen(true)}><Text style={styles.chipTextSelected}>{value?selected?selected.name+(selected.archived?' · Archived':''):'Saved selection · review online':emptyLabel}</Text></MotionPressable>
    <ActionSheet title={'Choose '+label.toLowerCase()} visible={open} onClose={()=>setOpen(false)}>
      <Text style={styles.subtitle}>Previously saved choices. Availability will be checked before submission.</Text>
      <MotionPressable style={styles.secondaryButton} onPress={()=>{onChange(null);setOpen(false);}}><Text style={styles.chipTextSelected}>{emptyLabel}</Text></MotionPressable>
      {choices.filter(c=>!c.archived).map(c=><MotionPressable key={c.id} style={styles.secondaryButton} onPress={()=>{onChange(c.id);setOpen(false);}}><Text style={styles.chipTextSelected}>{c.name}</Text></MotionPressable>)}
    </ActionSheet>
  </View>;
}

import {Text,View} from 'react-native';
import type {Category} from '../types/database';
import {useFormStyles} from '../styles/forms';
import {MotionPressable} from './MotionPressable';

export function CategoryPicker({categories,value,onChange}:Readonly<{
  categories:Category[];value:string;onChange:(id:string)=>void;
}>) {
  const styles=useFormStyles();
  return <>
    <Text style={styles.label}>Category</Text>
    <View style={styles.optionRow}>{categories.map(category=><MotionPressable
      key={category.id} accessibilityState={{selected:value===category.id}}
      onPress={()=>onChange(category.id)} style={[styles.chip,value===category.id&&styles.chipSelected]}>
      <Text style={value===category.id?styles.chipTextSelected:styles.chipText}>{category.name}</Text>
    </MotionPressable>)}</View>
  </>;
}

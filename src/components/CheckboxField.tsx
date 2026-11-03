import {Text,View} from 'react-native';
import {Check} from 'lucide-react-native';
import {useColors,type} from '../styles/theme';
import {MotionPressable} from './MotionPressable';

export function CheckboxField({label,accessibilityLabel=label,checked,onChange,disabled=false}:Readonly<{label:string;accessibilityLabel?:string;checked:boolean;onChange:(checked:boolean)=>void;disabled?:boolean}>) {
  const colors=useColors();
  return <MotionPressable role="checkbox" aria-checked={checked} accessibilityLabel={accessibilityLabel} accessibilityRole="checkbox" accessibilityState={{checked,disabled}} disabled={disabled} onPress={()=>onChange(!checked)} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:48,paddingVertical:8}}>
    <View pointerEvents="none" style={{width:24,height:24,borderRadius:5,borderWidth:2,borderColor:checked?colors.primary:colors.controlBorder,backgroundColor:checked?colors.primary:colors.inputBackground,alignItems:'center',justifyContent:'center'}}>{checked&&<Check size={18} color={colors.onPrimary} strokeWidth={3}/>}</View>
    <Text style={{...type.body,color:colors.text,flex:1}}>{label}</Text>
  </MotionPressable>;
}

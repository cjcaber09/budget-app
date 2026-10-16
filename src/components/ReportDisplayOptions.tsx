import {Switch,Text,View} from 'react-native';
import {createThemedStyles,type,useColors} from '../styles/theme';

export function ReportDisplayOptions({hideZeroValues,onChange}:{hideZeroValues:boolean;onChange:(value:boolean)=>void}) {
  const s=useStyles(),colors=useColors();
  return <View style={s.row}>
    <View style={s.copy}><Text style={s.label}>Hide zero values</Text><Text style={s.caption}>Hide rows whose amounts are all zero. Totals and chart dates stay the same.</Text></View>
    <View style={s.control}><Switch accessibilityLabel="Hide zero values" hitSlop={12} value={hideZeroValues} onValueChange={onChange} trackColor={{false:colors.border,true:colors.primary}} thumbColor={colors.surface}/></View>
  </View>;
}

const useStyles=createThemedStyles(c=>({
  row:{flexDirection:'row',alignItems:'center',gap:16},copy:{flex:1,gap:4},
  label:{...type.body,color:c.text,fontWeight:'600'},caption:{...type.label,color:c.muted,fontWeight:'400'},
  control:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},
}));

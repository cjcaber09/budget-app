import { View, Text } from 'react-native';
import { CircleAlert, X } from 'lucide-react-native';
import {MotionPressable} from './MotionPressable';
import { createThemedStyles, type, useColors } from '../styles/theme';

export function AlertBanner({ message, onPress, onDismiss, label }: { message: string; onPress?:()=>void; onDismiss?:()=>void; label?:string }) {
  const styles = useStyles();
  const colors = useColors();
  return <View accessibilityRole="alert" style={styles.banner}>
    {onPress?<MotionPressable accessibilityLabel={label} style={styles.content} onPress={onPress}>
      <CircleAlert size={16} color={colors.warning}/><Text style={styles.text}>{message}</Text>
    </MotionPressable>:<View style={styles.content}><CircleAlert size={16} color={colors.warning}/><Text style={styles.text}>{message}</Text></View>}
    {onDismiss&&<MotionPressable accessibilityLabel={`Dismiss ${message}`} onPress={onDismiss} style={{width:48,height:48,alignItems:'center',justifyContent:'center'}}><X size={18} color={colors.warning}/></MotionPressable>}
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  banner: { backgroundColor: colors.warningBg, borderRadius: 8, paddingLeft: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  content: {flex:1, flexDirection:'row', alignItems:'center', gap:10, minHeight:48, paddingVertical:12},
  text: { ...type.label, color: colors.warning, flex: 1 },
}));

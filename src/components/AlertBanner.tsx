import { View, Text } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { createThemedStyles, type, useColors } from '../styles/theme';

export function AlertBanner({ message }: { message: string }) {
  const styles = useStyles();
  const colors = useColors();
  return <View accessibilityRole="alert" style={styles.banner}><CircleAlert size={16} color={colors.warning} /><Text style={styles.text}>{message}</Text></View>;
}
const useStyles = createThemedStyles(colors => ({
  banner: { backgroundColor: colors.warningBg, borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { ...type.label, color: colors.warning, flex: 1 },
}));

import { View, Text } from 'react-native';
import type { ReactNode } from 'react';
import { createThemedStyles, type } from '../styles/theme';

export function ScreenHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>
    <View style={styles.copy}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
    {action}
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  copy: { flexGrow: 1, flexShrink: 1, minWidth: 200 },
  title: { ...type.title, color: colors.text },
  description: { ...type.body, color: colors.muted, marginTop: 4 },
}));

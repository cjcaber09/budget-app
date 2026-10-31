import { View, Text } from 'react-native';
import { createThemedStyles, type } from '../styles/theme';
import { LoadingSkeleton } from './LoadingSkeleton';
import { MotionPressable } from './MotionPressable';

export function QueryState({ loading, error, retry, empty, children }: { loading?: boolean; error?: boolean; retry?: () => void; empty?: string; children?: React.ReactNode }) {
  const styles = useStyles();
  if (loading) return <LoadingSkeleton />;
  if (error) return <View style={styles.state}>
    <Text accessibilityRole="alert" style={styles.copy}>Couldn’t load your data. Check your connection and try again.</Text>
    <MotionPressable style={styles.retry} onPress={retry}><Text style={styles.retryText}>Try again</Text></MotionPressable>
  </View>;
  if (empty) return <View style={styles.state}><Text style={styles.copy}>{empty}</Text>{children}</View>;
  return <>{children}</>;
}
const useStyles = createThemedStyles(colors => ({
  state: { paddingVertical: 28, alignItems: 'center', gap: 16 },
  copy: { ...type.body, color: colors.muted, textAlign: 'center', maxWidth: 400 },
  retry: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: colors.selected, borderRadius: 8 },
  retryText: { ...type.label, color: colors.primary },
}));

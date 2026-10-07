import { createThemedStyles } from './theme';
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

// Screens retain their own ScrollView/FlatList wrappers and share themed layout.
const useLayoutStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, alignItems: 'center', padding: 24, paddingBottom: 96, backgroundColor: colors.background },
  card: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderRadius: 16, padding: 24 },
  workspace: { width: '100%', maxWidth: 560, gap: 28 },
  section: { backgroundColor: colors.surface, borderRadius: 16, padding: 24 },
}));

export function usePageLayout({ safeTop = false }: { safeTop?: boolean } = {}) {
  const styles = useLayoutStyles();
  const insets = useContext(SafeAreaInsetsContext);
  return {
    ...styles,
    scrollContent: { ...styles.scrollContent, paddingTop: 24 + (safeTop ? insets?.top ?? 0 : 0), paddingBottom: 96 + (insets?.bottom ?? 0) },
  };
}

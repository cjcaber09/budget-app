import { Pressable, Text, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { TAB_BAR_HEIGHT } from '../constants/layout';

const FAB_SIZE = 56;

export function AddTransactionFab() {
  const router = useRouter();

  return (
    <Pressable
      style={styles.fab}
      onPress={() => router.push('/transaction/new' as Href)}
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
    >
      <Text style={styles.fabText}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -FAB_SIZE / 2,
    // Rendered as a sibling to the whole Tabs navigator (not nested inside
    // a single screen), so "bottom" here is relative to the full
    // content+tab-bar height. This places the button's vertical center
    // exactly on the tab bar's top edge, straddling content and tab bar.
    bottom: TAB_BAR_HEIGHT - FAB_SIZE / 2,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 12px rgba(33, 150, 243, 0.45)',
    elevation: 8,
    zIndex: 100,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});

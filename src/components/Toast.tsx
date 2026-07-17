import { Pressable, Text, StyleSheet } from 'react-native';
import { useToastStore } from '../stores/useToastStore';

export function Toast() {
  const message = useToastStore((state) => state.message);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (!message) return null;

  return (
    <Pressable style={styles.toast} onPress={dismissToast}>
      <Text style={styles.text}>{message}</Text>
      <Text style={styles.dismiss}>Dismiss</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: '#323232',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  text: { color: '#fff', flexShrink: 1, marginRight: 12 },
  dismiss: { color: '#90CAF9', fontWeight: '600' },
});

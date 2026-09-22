import { Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export function BackButton() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Text style={styles.text}>‹ Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 8, paddingVertical: 4 },
  text: { color: '#2196F3', fontSize: 17 },
});

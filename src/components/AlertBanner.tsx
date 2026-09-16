import { View, Text, StyleSheet } from 'react-native';

interface Props {
  message: string;
}

export function AlertBanner({ message }: Props) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#FFF3E0', borderRadius: 8, padding: 12, marginBottom: 12 },
  text: { color: '#E65100', fontWeight: '600' },
});

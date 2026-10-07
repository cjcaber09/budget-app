import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wallet } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { createThemedStyles, type, useColors } from '../styles/theme';

export function AuthFrame({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.frame}>
        <View style={styles.brand}><Wallet size={26} strokeWidth={1.6} color={colors.primary} /><Text style={styles.brandText}>Budget Tracker</Text></View>
        <View style={styles.form}>{children}</View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
const useStyles = createThemedStyles(colors => ({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  frame: { width: '100%', maxWidth: 440, gap: 32 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  brandText: { ...type.body, color: colors.text, fontWeight: '700' },
  form: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, width: '100%' },
}));

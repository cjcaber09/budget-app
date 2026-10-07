import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { AuthFrame } from '../../src/components/AuthFrame';
import { MotionPressable } from '../../src/components/MotionPressable';
import { useFormStyles } from '../../src/styles/forms';
import { useColors } from '../../src/styles/theme';

export default function SignInScreen() {
  const styles = useFormStyles();
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function handleSignIn() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message);
    } catch { setError('Couldn’t sign in. Check your connection and try again.'); }
    finally { setSubmitting(false); }
  }
  return <AuthFrame><View>
    <Text accessibilityRole="header" style={[styles.title, { fontSize: 26, lineHeight: 34 }]}>Welcome back.</Text>
    <Text style={styles.subtitle}>Sign in to pick up where you left off.</Text>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Text style={styles.label}>Email</Text><TextInput accessibilityLabel="Email" style={styles.input} placeholder="you@example.com" placeholderTextColor={colors.subtle} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
    <Text style={styles.label}>Password</Text><TextInput accessibilityLabel="Password" style={styles.input} placeholder="Your password" placeholderTextColor={colors.subtle} secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} onSubmitEditing={() => void handleSignIn()} />
    <MotionPressable style={styles.button} onPress={() => void handleSignIn()} disabled={submitting}><Text style={styles.buttonText}>{submitting ? 'Signing in…' : 'Sign In'}</Text></MotionPressable>
    <Link href="/sign-up" style={{ color: colors.primary, fontSize: 14, textAlign: 'center', marginTop: 24, paddingVertical: 12 }}>Don&apos;t have an account? Sign up</Link>
  </View></AuthFrame>;
}

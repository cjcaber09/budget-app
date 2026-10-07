import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { AuthFrame } from '../../src/components/AuthFrame';
import { MotionPressable } from '../../src/components/MotionPressable';
import { useFormStyles } from '../../src/styles/forms';
import { useColors } from '../../src/styles/theme';

export default function SignUpScreen() {
  const styles = useFormStyles();
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  async function handleSignUp() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) { setError(error.message); return; }
      // Auto-confirmed signups are redirected by AuthGate; no misleading email claim.
      if (!data.session) setConfirmationSent(true);
    } catch { setError('Couldn’t create your account. Check your connection and try again.'); }
    finally { setSubmitting(false); }
  }
  const linkStyle = { color: colors.primary, fontSize: 14, textAlign: 'center' as const, marginTop: 24, paddingVertical: 12 };
  if (confirmationSent) return <AuthFrame><View>
    <Text accessibilityRole="header" style={styles.title}>Check your email</Text>
    <Text style={styles.subtitle}>We sent a confirmation link to {email.trim()}. Confirm it, then sign in.</Text>
    <Link href="/sign-in" style={linkStyle}>Back to sign in</Link>
  </View></AuthFrame>;
  return <AuthFrame><View>
    <Text accessibilityRole="header" style={[styles.title, { fontSize: 26, lineHeight: 34 }]}>A clearer month starts here.</Text>
    <Text style={styles.subtitle}>Create your Budget Tracker account.</Text>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Text style={styles.label}>Email</Text><TextInput accessibilityLabel="Email" style={styles.input} placeholder="you@example.com" placeholderTextColor={colors.subtle} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
    <Text style={styles.label}>Password</Text><TextInput accessibilityLabel="Password" style={styles.input} placeholder="Choose a password" placeholderTextColor={colors.subtle} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} onSubmitEditing={() => void handleSignUp()} />
    <MotionPressable style={styles.button} onPress={() => void handleSignUp()} disabled={submitting}><Text style={styles.buttonText}>{submitting ? 'Creating account…' : 'Sign Up'}</Text></MotionPressable>
    <Link href="/sign-in" style={linkStyle}>Already have an account? Sign in</Link>
  </View></AuthFrame>;
}

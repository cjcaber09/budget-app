import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { pageLayout } from '../../src/styles/pageLayout';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSignUp() {
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <View style={styles.screen}>
        <View style={pageLayout.card}>
          <Text style={styles.title}>Check your email</Text>
          <Text>We sent a confirmation link to {email}. Confirm it, then sign in.</Text>
          <Link href="/sign-in" style={styles.link}>
            Back to sign in
          </Link>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={pageLayout.card}>
        <Text style={styles.title}>Sign Up</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Pressable style={styles.button} onPress={handleSignUp} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? 'Creating account...' : 'Sign Up'}</Text>
        </Pressable>
        <Link href="/sign-in" style={styles.link}>
          Already have an account? Sign in
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
  link: { marginTop: 16, textAlign: 'center', color: '#2196F3' },
});

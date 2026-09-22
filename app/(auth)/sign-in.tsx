import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Link, type Href } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { pageLayout } from '../../src/styles/pageLayout';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={pageLayout.card}>
        <Text style={styles.title}>Sign In</Text>
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
        <Pressable style={styles.button} onPress={handleSignIn} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? 'Signing in...' : 'Sign In'}</Text>
        </Pressable>
        {/* `/sign-up` doesn't exist as a route file yet (added in Task 14), so
            expo-router's generated typed-routes union doesn't include it yet.
            This cast is safe now and becomes redundant (not incorrect) once
            that route lands. */}
        <Link href={'/sign-up' as Href} style={styles.link}>
          Don&apos;t have an account? Sign up
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

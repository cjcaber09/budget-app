import { useEffect } from 'react';
import { Slot, useRouter, useSegments, type Href } from 'expo-router';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useSession } from '../src/hooks/useSession';
import { supabase } from '../src/lib/supabase';
import { resetClientState } from '../src/lib/resetClientState';
import { useToastStore } from '../src/stores/useToastStore';
import { Toast } from '../src/components/Toast';
import { ThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColors, useThemeMode } from '../src/styles/theme';
import { ProfileBootstrap } from '../src/hooks/useProfile';
import { usePreferencesStore } from '../src/stores/usePreferencesStore';
import { View,Text } from 'react-native';
import { MotionPressable } from '../src/components/MotionPressable';

function handleQueryError(error: unknown) {
  console.error('Data request failed', { code: (error as { code?: string } | null)?.code });
  const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  useToastStore.getState().showToast(message);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryError }),
  mutationCache: new MutationCache({ onError: (error, _variables, _context, mutation) => {
    const shouldNotify = mutation.meta?.shouldNotify;
    if (typeof shouldNotify === 'function' && !shouldNotify()) return;
    handleQueryError(error);
  } }),
});

function AuthGate() {
  const { session, loading,error,refresh } = useSession();
  const colors=useColors();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || error) return;

    // `(auth)` and `/sign-in` don't exist as route files yet (added in Tasks 13/14),
    // so expo-router's generated typed-routes union doesn't include them yet.
    // These casts are safe now and become redundant (not incorrect) once those routes land.
    const inAuthGroup = (segments[0] as string) === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/sign-in' as Href);
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading,error, segments, router]);

  return <><Slot />{error&&<View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:colors.background,justifyContent:'center',padding:28,gap:20}}><Text accessibilityRole="alert" style={{color:colors.text}}>Could not restore your session. Check your connection and retry.</Text><MotionPressable onPress={()=>void refresh()}><Text style={{color:colors.primary}}>Retry session</Text></MotionPressable></View>}</>;
}

export default function RootLayout() {
  const colors = useColors();
  const dark = useThemeMode() === 'dark';
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event,session) => {
      const owner=usePreferencesStore.getState().profile?.user_id;
      if (event === 'SIGNED_OUT' || (owner && session && owner!==session.user.id)) resetClientState(queryClient);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <ThemeProvider value={{ ...(dark ? DarkTheme : DefaultTheme), colors: { ...(dark ? DarkTheme.colors : DefaultTheme.colors), background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary } }}>
    <QueryClientProvider client={queryClient}>
      <ProfileBootstrap />
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AuthGate />
      <Toast />
    </QueryClientProvider>
    </ThemeProvider>
  );
}

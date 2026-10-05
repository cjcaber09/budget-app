import { useEffect } from 'react';
import { Slot, useRouter, useSegments, type Href } from 'expo-router';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useSession } from '../src/hooks/useSession';
import { supabase } from '../src/lib/supabase';
import { resetClientState } from '../src/lib/resetClientState';
import { useToastStore } from '../src/stores/useToastStore';
import { Toast } from '../src/components/Toast';

function handleQueryError(error: unknown) {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  useToastStore.getState().showToast(message);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryError }),
  mutationCache: new MutationCache({ onError: handleQueryError }),
});

function AuthGate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // `(auth)` and `/sign-in` don't exist as route files yet (added in Tasks 13/14),
    // so expo-router's generated typed-routes union doesn't include them yet.
    // These casts are safe now and become redundant (not incorrect) once those routes land.
    const inAuthGroup = (segments[0] as string) === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/sign-in' as Href);
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') resetClientState(queryClient);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
      <Toast />
    </QueryClientProvider>
  );
}

import { useCallback, useContext, useSyncExternalStore } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';

/** Also works for shared forms rendered without a navigator (previews/tests). */
export function useScreenActive() {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback((changed: () => void) => {
    if (!navigation) return () => {};
    const focus = navigation.addListener('focus', changed), blur = navigation.addListener('blur', changed);
    return () => { focus(); blur(); };
  }, [navigation]);
  return useSyncExternalStore(subscribe, () => navigation?.isFocused() ?? true, () => true);
}

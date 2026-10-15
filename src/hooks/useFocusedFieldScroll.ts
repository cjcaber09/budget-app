import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, Platform, ScrollView, TextInput } from 'react-native';
import { useScreenActive } from './useScreenActive';
import { usePreferencesStore } from '../stores/usePreferencesStore';

/** Scroll after focus and keyboard layout; Android already resizes its window. */
export function useFocusedFieldScroll(visible = true, footerHeight = 0) {
  const screenActive = useScreenActive();
  const enabled = visible && screenActive;
  const owner = usePreferencesStore(state => state.profile?.user_id);
  const scrollRef = useRef<ScrollView>(null);
  const frame = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reveal = useCallback(() => {
    if (frame.current) clearTimeout(frame.current);
    if (!enabled) return;
    frame.current = setTimeout(() => {
      if (Platform.OS === 'web') {
        const input = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null;
        if (!input || !['INPUT', 'TEXTAREA'].includes(input.tagName) || !(scrollRef.current as unknown as HTMLElement | null)?.contains?.(input)) return;
        input.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
      } else {
        const input = TextInput.State.currentlyFocusedInput();
        if (!input) return;
        scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(input, footerHeight + 16, true);
      }
    }, 60);
  }, [enabled, footerHeight]);
  useEffect(() => {
    if (!enabled) return;
    const shown = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardDidChangeFrame' : 'keyboardDidShow', reveal);
    return () => { shown.remove(); if (frame.current) clearTimeout(frame.current); };
  }, [enabled, reveal, owner]);
  return { ref: scrollRef, onFocus: reveal, onLayout: reveal };
}

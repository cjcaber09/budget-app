import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useScreenActive } from '../hooks/useScreenActive';

/** Clamp to the keyboard's screen position, without subtracting adjustResize twice. */
export function KeyboardViewport({ visible = true, style, children }: { visible?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const root = useRef<View>(null), active = useScreenActive();
  const [frame, setFrame] = useState({ top: 0, height: 0 }), [keyboardTop, setKeyboardTop] = useState<number | null>(() => Platform.OS === 'android' ? Keyboard.metrics()?.screenY ?? null : null);
  const measure = () => root.current?.measureInWindow((_x, top, _width, height) => {
    setFrame(previous => previous.top === top && previous.height === height ? previous : { top, height });
  });
  useEffect(() => {
    if (!visible || !active || Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', event => setKeyboardTop(event.endCoordinates.screenY));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null));
    return () => { show.remove(); hide.remove(); };
  }, [visible, active]);
  const height = Platform.OS === 'android' && keyboardTop !== null && frame.height > 0
    ? Math.max(0, Math.min(frame.height, keyboardTop - frame.top)) : undefined;
  return <View ref={root} onLayout={measure} style={{ flex: 1 }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[{ flex: height === undefined ? 1 : undefined, height, justifyContent: 'flex-end' }, style]}>{children}</KeyboardAvoidingView>
  </View>;
}

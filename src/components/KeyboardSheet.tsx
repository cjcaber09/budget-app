import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { type, useColors } from '../styles/theme';
import { useFocusedFieldScroll } from '../hooks/useFocusedFieldScroll';
import { MotionPressable } from './MotionPressable';
import { KeyboardViewport } from './KeyboardViewport';
import { useUpdateBlocker } from '../stores/useUpdateSafetyStore';

type Layer = { title: string; content: ReactNode; onClose: () => void; busy?: boolean };
const Host = createContext<((layer: Layer | null) => void) | null>(null);

/** One native modal, including child account creation. Hidden children stay mounted. */
export function KeyboardSheet({ title, visible = true, onClose, busy = false, children, closeLabel, animationType = 'slide' }: {
  title: string; visible?: boolean; onClose: () => void; busy?: boolean; children: ReactNode; closeLabel?: string; animationType?: 'slide' | 'none';
}) {
  const colors = useColors(), insets = useContext(SafeAreaInsetsContext), reduced = useReducedMotion();
  useUpdateBlocker(visible);
  const [layer, setLayer] = useState<Layer | null>(null);
  const active = layer ?? { title, onClose, busy };
  const close = () => { if (!active.busy) active.onClose(); };
  const scroll = useFocusedFieldScroll(visible && !layer);
  const childScroll = useFocusedFieldScroll(visible && !!layer);
  return <Modal visible={visible} transparent animationType={reduced ? 'none' : animationType} statusBarTranslucent onRequestClose={close}>
    <KeyboardViewport visible={visible}>
      <MotionPressable accessibilityLabel={`Close ${active.title} sheet`} disabled={active.busy} onPress={close} style={{ position: 'absolute', inset: 0, backgroundColor: colors.scrim }} />
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={{ maxHeight: '92%', flexShrink: 1, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(insets?.bottom ?? 0, 16) }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text accessibilityRole="header" style={{ ...type.heading, color: colors.text, flex: 1 }}>{active.title}</Text>
          <MotionPressable accessibilityLabel={layer ? `Close ${active.title}` : closeLabel ?? `Close ${title}`} disabled={active.busy} onPress={close} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><X size={20} color={colors.text} /></MotionPressable>
        </View>
        <Host.Provider value={setLayer}>
          <ScrollView {...scroll} style={{ flexShrink: 1, display: layer ? 'none' : 'flex' }} accessibilityElementsHidden={!!layer} importantForAccessibility={layer ? 'no-hide-descendants' : 'auto'} automaticallyAdjustKeyboardInsets={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>{children}</ScrollView>
          {layer && <ScrollView {...childScroll} style={{ flexShrink: 1 }} automaticallyAdjustKeyboardInsets={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>{layer.content}</ScrollView>}
        </Host.Provider>
      </View>
    </KeyboardViewport>
  </Modal>;
}

/** Render in the existing native sheet when present, otherwise own one. */
export function SheetLayer({ title, onClose, busy, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const host = useContext(Host);
  const layer = useMemo(() => ({ title, onClose, busy, content: children }), [title, onClose, busy, children]);
  useEffect(() => {
    if (!host) return;
    host(layer);
    return () => host(null);
  }, [host, layer]);
  return host ? null : <KeyboardSheet title={title} onClose={onClose} busy={busy}>{children}</KeyboardSheet>;
}

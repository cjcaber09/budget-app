import { useContext, useEffect, useState } from 'react';
import { Text } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useToastStore } from '../stores/useToastStore';
import { createThemedStyles, type, useColors, motion } from '../styles/theme';
import { MotionPressable } from './MotionPressable';
import { TAB_BAR_HEIGHT } from '../constants/layout';

export function Toast() {
  const styles = useStyles();
  const colors = useColors();
  const reduced = useReducedMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const message = useToastStore(state => state.message);
  const dismissToast = useToastStore(state => state.dismissToast);
  const [lastMessage, setLastMessage] = useState<string | null>(message);
  if (message && message !== lastMessage) setLastMessage(message);
  useEffect(() => {
    if (message) return;
    const timer = setTimeout(() => setLastMessage(null), motion.exit);
    return () => clearTimeout(timer);
  }, [message]);
  return <Animated.View accessibilityElementsHidden={!message} importantForAccessibility={message ? 'auto' : 'no-hide-descendants'} pointerEvents={message ? 'auto' : 'none'} style={[styles.toast, { bottom: (insets?.bottom ?? 0) + (TAB_BAR_HEIGHT + 24), opacity: message ? 1 : 0, transform: [{ translateY: reduced || message ? 0 : 8 }], transitionProperty: ['transform', 'opacity'], transitionDuration: reduced ? 0 : message ? motion.enter : motion.exit, transitionTimingFunction: motion.easeOut }]}>
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.text}>{message ?? lastMessage}</Text><MotionPressable disabled={!message} accessibilityLabel="Dismiss notification" style={styles.dismiss} onPress={dismissToast}><X size={17} color={colors.onPrimary} /></MotionPressable>
  </Animated.View>;
}
const useStyles = createThemedStyles(colors => ({
  toast: { position: 'absolute', left: 24, right: 24, maxWidth: 520, alignSelf: 'center', backgroundColor: colors.primary, borderRadius: 12, paddingLeft: 18, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', zIndex: 1000, boxShadow: '0px 6px 18px rgba(16, 38, 25, 0.18)' },
  text: { ...type.body, color: colors.onPrimary, flex: 1 }, dismiss: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
}));

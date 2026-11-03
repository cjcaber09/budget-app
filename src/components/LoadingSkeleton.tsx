import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { createThemedStyles } from '../styles/theme';

/** Decorative placeholders only: never imply a financial value before it loads. */
export function LoadingSkeleton({ label = 'Loading data', variant = 'list' }: Readonly<{ label?: string; variant?: 'list' | 'account' }>) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = reduced ? 1 : withRepeat(withSequence(withTiming(0.5, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
    return () => cancelAnimation(opacity);
  }, [opacity, reduced]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }} aria-busy={true} style={styles.container}>
    <Animated.View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={pulse}>
      {variant === 'account' ? <View style={styles.account}>
        <View style={[styles.bar, styles.accountTitle]} />
        <View style={[styles.bar, styles.accountAmount]} />
        <View style={[styles.bar, styles.accountCaption]} />
      </View> : [0, 1, 2].map(index => <View key={index} style={styles.row}>
        <View style={styles.icon} />
        <View style={styles.details}>
          <View style={[styles.bar, { width: index === 1 ? '60%' : '78%' }]} />
          <View style={[styles.bar, styles.caption]} />
        </View>
        <View style={[styles.bar, styles.amount]} />
      </View>)}
    </Animated.View>
  </View>;
}

const useStyles = createThemedStyles(colors => ({
  container: { width: '100%', paddingVertical: 12 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  details: { flex: 1, gap: 10 },
  bar: { height: 14, borderRadius: 4, backgroundColor: colors.border },
  caption: { width: '45%', height: 10, backgroundColor: colors.surfaceAlt },
  amount: { width: '20%', maxWidth: 80 },
  account: { height: 256, borderRadius: 16, padding: 24, backgroundColor: colors.surfaceAlt, justifyContent: 'center', gap: 24 },
  accountTitle: { width: '45%', height: 18 },
  accountAmount: { width: '65%', height: 38 },
  accountCaption: { width: '55%', height: 12 },
}));

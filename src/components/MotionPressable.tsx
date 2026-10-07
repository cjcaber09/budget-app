import { useState } from 'react';
import { Platform, Pressable, type PressableProps } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { motion } from '../styles/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Feedback only: no entrance animations on repeated navigation or list rows.
export function MotionPressable({ style, disabled, onPressIn, onPressOut, onFocus, onBlur, ...props }: PressableProps) {
  const [pressed, setPressed] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const reduced = useReducedMotion();
  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      accessibilityState={{ ...props.accessibilityState, disabled: !!disabled }}
      pressRetentionOffset={16}
      onPressIn={(event) => { setPressed(true); onPressIn?.(event); }}
      onPressOut={(event) => { setPressed(false); onPressOut?.(event); }}
      onFocus={(event) => { setKeyboardFocus(Platform.OS === 'web' && typeof document !== 'undefined' && document.activeElement?.matches(':focus-visible') === true); onFocus?.(event); }}
      onBlur={(event) => { setKeyboardFocus(false); onBlur?.(event); }}
      style={[
        typeof style === 'function' ? style({ pressed, hovered: false }) : style,
        {
          transitionProperty: ['transform', 'opacity'],
          transitionDuration: reduced || keyboardFocus ? 0 : motion.press,
          transitionTimingFunction: motion.easeOut,
          transform: [{ scale: pressed && !reduced && !keyboardFocus ? 0.98 : 1 }],
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
      ]}
    />
  );
}

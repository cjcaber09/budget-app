import { MotionPressable } from './MotionPressable';
import { useColors } from '../styles/theme';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

export function BackButton() {
  const colors = useColors();
  const router = useRouter();

  return (
    <MotionPressable
      onPress={() => router.back()}
      hitSlop={12}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M15 5L8 12L15 19"
          stroke={colors.primary}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </MotionPressable>
  );
}

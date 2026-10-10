import { motion } from '../src/styles/theme';
// Load the real runtime validator without pulling library source into app tsc.
const { normalizeTimingFunction } = jest.requireActual('../node_modules/react-native-reanimated/src/css/native/normalization/common/settings');
const { parseTimingFunction } = jest.requireActual('../node_modules/react-native-reanimated/src/css/web/utils');

describe('native motion easing', () => {
  it('passes both shared curves through the real native timing validator', () => {
    expect(normalizeTimingFunction(motion.easeOut)).toEqual({
      name: 'cubicBezier', x1: 0.23, y1: 1, x2: 0.32, y2: 1,
    });
    expect(normalizeTimingFunction(motion.easeSheet)).toEqual({
      name: 'cubicBezier', x1: 0.32, y1: 0.72, x2: 0, y2: 1,
    });
  });

  it('preserves the existing CSS curves on web', () => {
    expect(parseTimingFunction(motion.easeOut)).toBe('cubic-bezier(0.23, 1, 0.32, 1)');
    expect(parseTimingFunction(motion.easeSheet)).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
  });
});

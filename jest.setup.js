// Component tests verify behavior, not native worklet execution. Motion is
jest.mock('@react-native-async-storage/async-storage',()=>require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// inspected in the web build; native feel requires a device release build.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component) => component },
    cubicBezier: jest.requireActual('./node_modules/react-native-reanimated/src/css/easing').cubicBezier,
    useReducedMotion: jest.fn(() => true),
    useSharedValue: initial => require('react').useRef({value:initial,get(){return this.value;},set(value){this.value=value;}}).current,
    useAnimatedStyle: callback => callback(),
    useEvent: callback => callback,
    withTiming: (value, _config, callback) => {callback?.(true);return value;},
    withSpring: (value, _config, callback) => {callback?.(true);return value;},
    cancelAnimation: jest.fn(),
    runOnJS: callback => callback,
  };
});
require('react-native-gesture-handler/jestSetup');
// Native picker integration is verified on device; calendar selection logic is tested separately.
jest.mock('@expo/ui/community/datetime-picker', () => ({ __esModule: true, default: props => {
  const React = require('react'); const { View } = require('react-native');
  return React.createElement(View,{...props,testID:'native-date-picker'});
} }));

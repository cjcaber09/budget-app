// Component tests verify behavior, not native worklet execution. Motion is
jest.mock('@react-native-async-storage/async-storage',()=>require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// inspected in the web build; native feel requires a device release build.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component) => component },
    useReducedMotion: jest.fn(() => true),
  };
});
// Native picker integration is verified on device; calendar selection logic is tested separately.
jest.mock('@expo/ui/community/datetime-picker', () => ({ __esModule: true, default: props => {
  const React = require('react'); const { View } = require('react-native');
  return React.createElement(View,{...props,testID:'native-date-picker'});
} }));

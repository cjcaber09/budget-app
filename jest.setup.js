// Component tests verify behavior, not native worklet execution. Motion is
jest.mock('@react-native-async-storage/async-storage',()=>require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo',()=>require('@react-native-community/netinfo/jest/netinfo-mock'));
global.TextEncoder=require('node:util').TextEncoder;
global.TextDecoder=require('node:util').TextDecoder;
jest.mock('expo-crypto',()=>require('./test-utils/cryptoMock.cjs'));
jest.mock('expo-secure-store',()=>{
 const values=new Map();return {WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,getItemAsync:jest.fn(async key=>values.get(key)??null),setItemAsync:jest.fn(async(key,value)=>{values.set(key,value);}),deleteItemAsync:jest.fn(async key=>{values.delete(key);})};
});
jest.mock('expo-local-authentication',()=>({hasHardwareAsync:jest.fn(async()=>true),isEnrolledAsync:jest.fn(async()=>true),authenticateAsync:jest.fn(async()=>({success:true}))}));
jest.mock('expo-screen-capture',()=>({preventScreenCaptureAsync:jest.fn(async()=>{}),allowScreenCaptureAsync:jest.fn(async()=>{}),enableAppSwitcherProtectionAsync:jest.fn(async()=>{}),disableAppSwitcherProtectionAsync:jest.fn(async()=>{})}));
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
    useAnimatedProps: callback => callback(),
    Easing: require('react-native').Easing,
    ReduceMotion: {System:'system',Always:'always',Never:'never'},
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

import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, Platform, TextInput } from 'react-native';
import { useFocusedFieldScroll } from '../../src/hooks/useFocusedFieldScroll';
jest.mock('../../src/hooks/useScreenActive', () => ({ useScreenActive: () => true }));
jest.mock('../../src/stores/usePreferencesStore', () => ({ usePreferencesStore: (selector: (state: unknown) => unknown) => selector({ profile: { user_id: 'owner' } }) }));

test('focus and keyboard layout reveal the input above fixed actions, then cancel on close', () => {
  jest.useFakeTimers();
  const original = Platform.OS; Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const input = {} as ReturnType<typeof TextInput.State.currentlyFocusedInput>;
  const focused = jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(input);
  const callbacks: Record<string, () => void> = {}, removed = jest.fn();
  const listener = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, callback) => { callbacks[event] = callback as () => void; return { remove: removed } as unknown as ReturnType<typeof Keyboard.addListener>; });
  const reveal = jest.fn(), hook = renderHook(({ visible }: {visible: boolean}) => useFocusedFieldScroll(visible, 70), { initialProps: { visible: true } });
  hook.result.current.ref.current = { scrollResponderScrollNativeHandleToKeyboard: reveal } as never;
  act(() => { hook.result.current.onFocus(); jest.advanceTimersByTime(60); });
  expect(reveal).toHaveBeenLastCalledWith(input, 86, true);
  act(() => callbacks.keyboardDidShow());
  hook.rerender({ visible: false }); act(() => jest.runOnlyPendingTimers());
  expect(reveal).toHaveBeenCalledTimes(1); expect(removed).toHaveBeenCalledTimes(1);
  hook.unmount(); listener.mockRestore(); focused.mockRestore(); Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); jest.useRealTimers();
});

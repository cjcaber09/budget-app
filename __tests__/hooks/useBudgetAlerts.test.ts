import { renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useBudgetAlerts } from '../../src/hooks/useBudgetAlerts';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification'),
}));
jest.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ id: 'groceries', name: 'Groceries' }] }),
}));
jest.mock('../../src/hooks/useBudgets', () => ({
  useBudgets: () => ({ data: [{ category_id: 'groceries', amount: 100 }] }),
}));
jest.mock('../../src/hooks/useTransactions', () => ({
  useTransactions: () => ({ data: [{ category_id: 'groceries', amount: 110, type: 'expense' }] }),
}));

const originalPlatform = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
  jest.clearAllMocks();
});

it('does not request or schedule unsupported native notifications on web', () => {
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  renderHook(() => useBudgetAlerts('2026-10-01'));
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('keeps native threshold notifications and avoids repeating the same crossing', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  const { rerender } = renderHook(() => useBudgetAlerts('2026-10-01'));
  await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: { title: 'Budget Alert', body: 'Groceries is over budget' },
    trigger: null,
  }));
  rerender({});
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

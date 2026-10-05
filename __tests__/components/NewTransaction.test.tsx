import { render, screen, fireEvent } from '@testing-library/react-native';
import NewTransactionScreen from '../../app/(tabs)/transaction/new';
import { useScanStore } from '../../src/stores/useScanStore';
import { useToastStore } from '../../src/stores/useToastStore';

const mockRunOcr = jest.fn();

jest.mock('../../src/hooks/useOcr', () => ({
  useOcrScan: () => ({ mutate: mockRunOcr }),
}));

jest.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [{ id: 'cat-1', user_id: 'u1', name: 'Groceries', color: '#4CAF50', icon: 'cart', is_default: true }],
  }),
}));

jest.mock('../../src/hooks/useTransactions', () => ({
  useAddTransaction: () => ({ mutate: jest.fn() }),
}));

jest.mock('../../src/stores/useUiStore', () => ({
  useUiStore: (selector: (state: { selectedMonth: string }) => unknown) =>
    selector({ selectedMonth: '2026-10-01' }),
}));

let mockParams: { visit?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const IMAGE = {
  uri: 'file:///scan.jpg',
  base64: 'QUJD',
  mimeType: 'image/jpeg' as const,
  requestId: '3f8a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b',
};

describe('NewTransactionScreen', () => {
  beforeEach(() => {
    mockRunOcr.mockReset();
    mockParams = { visit: IMAGE.requestId };
    useScanStore.getState().clearPendingImage();
    useToastStore.getState().dismissToast();
  });

  it('scans the pending image exactly once and prefills the note', async () => {
    mockRunOcr.mockImplementation((_variables, options) =>
      options.onSuccess({ scanId: 's1', text: 'TOTAL 12.50', path: 'u1/s1.txt', truncated: false })
    );
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen />);

    expect(await screen.findByDisplayValue('TOTAL 12.50')).toBeTruthy();
    expect(mockRunOcr).toHaveBeenCalledTimes(1);
    expect(mockRunOcr.mock.calls[0][0]).toEqual({
      base64: 'QUJD',
      mimeType: 'image/jpeg',
      requestId: IMAGE.requestId,
    });
    expect(useScanStore.getState().pendingImage).toBeNull();
  });

  it('tells the user when the text was cut off', async () => {
    mockRunOcr.mockImplementation((_variables, options) =>
      options.onSuccess({ scanId: 's1', text: 'LONG TEXT', path: 'u1/s1.txt', truncated: true })
    );
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen />);

    await screen.findByDisplayValue('LONG TEXT');
    expect(useToastStore.getState().message).toBe('That text was long — kept the first 20,000 characters.');
  });

  it('lets the user skip a slow scan and enter details manually', () => {
    mockRunOcr.mockImplementation(() => {});
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen />);

    expect(screen.getByText('Reading text…')).toBeTruthy();
    fireEvent.press(screen.getByText('Skip — enter manually'));
    expect(screen.getByText('Add Transaction')).toBeTruthy();
  });

  it('goes straight to the form when there is no image', () => {
    render(<NewTransactionScreen />);

    expect(mockRunOcr).not.toHaveBeenCalled();
    expect(screen.getByText('Add Transaction')).toBeTruthy();
  });

  it('ignores a pending image that belongs to a different visit (e.g. a crafted deep link)', () => {
    useScanStore.getState().setPendingImage(IMAGE);
    mockParams = { visit: 'not-this-image' };

    render(<NewTransactionScreen />);

    expect(mockRunOcr).not.toHaveBeenCalled();
    expect(screen.getByText('Add Transaction')).toBeTruthy();
  });

  it('starts fresh on the next visit even though the screen stays mounted', () => {
    mockParams = { visit: 'visit-1' };
    const { rerender } = render(<NewTransactionScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '42');
    expect(screen.getByDisplayValue('42')).toBeTruthy();

    mockParams = { visit: 'visit-2' };
    rerender(<NewTransactionScreen />);

    expect(screen.queryByDisplayValue('42')).toBeNull();
  });
});

import { render, screen, fireEvent } from '@testing-library/react-native';
import SettingsScreen from '../../app/(tabs)/settings';

const mockDeleteScan = jest.fn();
let mockScans: { id: string; user_id: string; char_count: number | null; created_at: string }[] = [];

jest.mock('../../src/hooks/useOcr', () => ({
  useOcrScans: () => ({ data: mockScans }),
  useDeleteOcrScan: () => ({ mutate: mockDeleteScan }),
  getOcrDownloadUrl: jest.fn(async () => 'https://example.test/signed'),
}));
jest.mock('../../src/hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('../../src/hooks/useRecurringRules', () => ({ useRecurringRules: () => ({ data: [] }) }));
jest.mock('../../src/lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('Settings — Scanned Receipts', () => {
  beforeEach(() => mockDeleteScan.mockReset());

  it('shows an empty state', () => {
    mockScans = [];
    render(<SettingsScreen />);
    expect(screen.getByText('Scanned Receipts')).toBeTruthy();
    expect(screen.getByText('No scans yet.')).toBeTruthy();
  });

  it('lists scans and deletes one', () => {
    mockScans = [{ id: 'scan-1', user_id: 'u1', char_count: 42, created_at: '2026-10-05T12:00:00.000Z' }];
    render(<SettingsScreen />);

    expect(screen.getByText(/42 chars/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Delete scan'));
    expect(mockDeleteScan).toHaveBeenCalledWith('scan-1');
  });
});
jest.mock('../../src/components/ProfileSettings',()=>({ProfileSettings:()=>null}));

jest.mock('../../src/components/IncomeSources',()=>({IncomeSourcePicker:()=>null,IncomeSourcesSettings:()=>null}));
import { render, screen, fireEvent } from '@testing-library/react-native';
import SettingsScreen from '../../app/(tabs)/settings';

const mockDeleteScan = jest.fn();
const mockLoadMore = jest.fn();
let mockHasMore = false;
let mockLoadingMore = false;
let mockLoadError = false;
let mockScans: { id: string; user_id: string; char_count: number | null; created_at: string }[] = [];

jest.mock('../../src/hooks/useOcr', () => ({
  useOcrScans: () => ({ data: mockScans, hasNextPage: mockHasMore, isFetchingNextPage: mockLoadingMore, isFetchNextPageError: mockLoadError, isError: mockLoadError, fetchNextPage: mockLoadMore }),
  useDeleteOcrScan: () => ({ mutate: mockDeleteScan }),
  getOcrDownloadUrl: jest.fn(async () => 'https://example.test/signed'),
}));
jest.mock('../../src/hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('../../src/hooks/useRecurringRules', () => ({ useRecurringRules: () => ({ data: [] }) }));
jest.mock('../../src/lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('Settings — Scanned Receipts', () => {
  beforeEach(() => {mockDeleteScan.mockReset();mockLoadMore.mockReset();mockHasMore=false;mockLoadingMore=false;mockLoadError=false;});

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
  it('loads more and prevents another request while loading', () => {
    mockScans=[];mockHasMore=true;
    const view=render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Load more scanned receipts'));
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
    mockLoadingMore=true;view.rerender(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Load more scanned receipts'));
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Loading more…')).toBeTruthy();
  });
  it('keeps loaded scans visible on failure and lets the user retry', () => {
    mockScans=[{id:'scan-1',user_id:'u1',char_count:42,created_at:'2026-10-05T12:00:00.000Z'}];mockHasMore=true;mockLoadError=true;
    render(<SettingsScreen />);
    expect(screen.getByText('42 chars')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry load more'));
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
  });
  it('does not offer load more when the history is exhausted',()=>{
    mockScans=[];render(<SettingsScreen />);
    expect(screen.queryByLabelText('Load more scanned receipts')).toBeNull();
  });
});
jest.mock('../../src/components/ProfileSettings',()=>({ProfileSettings:()=>null}));
jest.mock('../../src/components/NotificationSettings',()=>({NotificationSettings:()=>null}));

jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodsSettings:()=>null}));

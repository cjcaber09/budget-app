import {fireEvent,render,screen} from '@testing-library/react-native';
import {AccountActivity} from '../../src/components/AccountActivity';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useUiStore} from '../../src/stores/useUiStore';
const owner='00000000-0000-4000-8000-000000000001';
const mockRetry=jest.fn();let mockFailed=false;
jest.mock('../../src/hooks/useReports',()=>({useReportTransactions:()=>({isPending:false,isError:mockFailed,refetch:mockRetry,data:[{id:'t',user_id:owner,type:'expense',amount:12.5,note:'Weekly groceries',payment_method_id:'cash',category_id:'groceries',financial_date:'2026-10-02',occurred_at:'2026-10-02T00:00:00Z'}]}),useReportTransfers:()=>({isPending:false,isError:false,refetch:mockRetry,data:[]})}));
jest.mock('../../src/hooks/useCategories',()=>({useCategories:()=>({isPending:false,isError:false,refetch:mockRetry,data:[{id:'groceries',name:'Groceries'}]})}));
beforeEach(()=>{mockFailed=false;jest.clearAllMocks();usePreferencesStore.getState().setProfile(defaultProfile(owner));useUiStore.getState().setSelectedMonth('2026-10-01');});
const method:any={id:'cash',user_id:owner,method:'cash'};
test('searches categories/notes and shows specific no-match recovery',()=>{
 render(<AccountActivity method={method} corrections={[]} unavailable={false} refresh={mockRetry} onBack={jest.fn()}/>);
 fireEvent.changeText(screen.getByLabelText('Search account activity'),'weekly groceries');expect(screen.getByText('1 entry matching your search')).toBeTruthy();
 fireEvent.press(screen.getByText('Transfers'));expect(screen.getByText('No matching activity. Clear the search or choose All.')).toBeTruthy();
});
test('failed history never presents a partial list as complete and keeps search through recovery',()=>{
 mockFailed=true;const view=render(<AccountActivity method={method} corrections={[]} unavailable={false} refresh={mockRetry} onBack={jest.fn()}/>);
 fireEvent.changeText(screen.getByLabelText('Search account activity'),'weekly');expect(screen.queryByText('1 entry matching your search')).toBeNull();
 fireEvent.press(screen.getByText('Try again'));expect(mockRetry).toHaveBeenCalled();mockFailed=false;view.rerender(<AccountActivity method={method} corrections={[]} unavailable={false} refresh={mockRetry} onBack={jest.fn()}/>);
 expect(screen.getByLabelText('Search account activity').props.value).toBe('weekly');expect(screen.getByText('1 entry matching your search')).toBeTruthy();
});

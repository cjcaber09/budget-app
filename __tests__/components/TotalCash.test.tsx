import {fireEvent,render,screen} from '@testing-library/react-native';
import {TotalCash} from '../../src/components/TotalCash';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
let mockQuery:any;const mockRetry=jest.fn(),mockPush=jest.fn();
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>mockQuery}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
beforeEach(()=>{jest.clearAllMocks();usePreferencesStore.getState().setProfile({...defaultProfile('owner'),currency:'PHP'});mockQuery={methods:[{id:'cash',user_id:'owner',method:'cash',archived:false,balance:'10.25'}],refetch:mockRetry,isError:false};});
test('renders zero and follows currency changes for identical balances',()=>{
 mockQuery.methods[0].balance='0.00';const view=render(<TotalCash/>);expect(screen.getByText('₱0.00')).toBeTruthy();
 usePreferencesStore.getState().setProfile({...defaultProfile('owner'),currency:'USD'});view.rerender(<TotalCash/>);expect(screen.getByText('$0.00')).toBeTruthy();
});
test('loading, error and unset states never display a fabricated partial total',()=>{
 mockQuery.methods=undefined;const view=render(<TotalCash/>);expect(screen.getByText('Loading…')).toBeTruthy();
 mockQuery.methods=[{id:'cash',user_id:'owner',method:'cash',archived:false,balance:null}];view.rerender(<TotalCash/>);expect(screen.getByText('Balance not set')).toBeTruthy();fireEvent.press(screen.getByText('Set the missing starting balance in Settings'));expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({section:'sources'})}));
 mockQuery.isError=true;view.rerender(<TotalCash/>);expect(screen.getByText('Unavailable')).toBeTruthy();expect(screen.queryByText('₱0.00')).toBeNull();fireEvent.press(screen.getByLabelText('Retry total cash'));expect(mockRetry).toHaveBeenCalled();
});

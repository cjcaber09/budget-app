import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {FinancialResetSettings} from '../../src/components/FinancialReset';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useFinancialResetStore} from '../../src/stores/useFinancialResetStore';
const mockReset=jest.fn();
jest.mock('../../src/lib/financialReset',()=>({financialResetRequest:(...args:unknown[])=>mockReset(...args),FinancialResetError:class extends Error{code:string;constructor(code:string){super(code);this.code=code;}}}));
jest.mock('../../src/lib/resetFinancialClientState',()=>({resetFinancialClientState:jest.fn()}));
jest.mock('../../src/lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:jest.fn()}}})}}}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn(),replace:jest.fn()})}));
beforeEach(()=>{jest.clearAllMocks();usePreferencesStore.setState({profile:defaultProfile('00000000-0000-4000-8000-000000000001')});useFinancialResetStore.setState({pending:null,handled:{},hydrated:true,starting:false,epoch:0});});
it('requires a password and permanent-reset acknowledgment and stores neither password nor consent',async()=>{
 mockReset.mockResolvedValue('pending');render(<FinancialResetSettings/>);fireEvent.press(screen.getByLabelText('Clear all finance records'));
 expect(screen.getByText(/Your account, profile and preferences stay/)).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Confirm clearing all records'));expect(mockReset).not.toHaveBeenCalled();
 fireEvent.changeText(screen.getByLabelText('Reset current password'),'synthetic-password');fireEvent.press(screen.getByLabelText('Confirm clearing all records'));expect(mockReset).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('I understand these records will be permanently deleted.'));fireEvent.press(screen.getByLabelText('Confirm clearing all records'));
 await waitFor(()=>expect(mockReset).toHaveBeenCalledTimes(1));expect(mockReset.mock.calls[0][1]).toBe('reset');expect(useFinancialResetStore.getState().pending).not.toHaveProperty('password');
});
it('cancel clears the password and sends no request',()=>{
 render(<FinancialResetSettings/>);fireEvent.press(screen.getByLabelText('Clear all finance records'));fireEvent.changeText(screen.getByLabelText('Reset current password'),'synthetic-password');fireEvent.press(screen.getByText('Close'));
 fireEvent.press(screen.getByLabelText('Clear all finance records'));expect(screen.getByLabelText('Reset current password').props.value).toBe('');expect(mockReset).not.toHaveBeenCalled();
});

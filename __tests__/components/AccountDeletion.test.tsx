import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {AccountDeletionSettings,PendingDeletionNotice} from '../../src/components/AccountDeletion';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useAccountDeletionStore} from '../../src/stores/useAccountDeletionStore';
const mockDelete=jest.fn();
jest.mock('../../src/lib/accountDeletion',()=>({deletionRequest:(...args:any[])=>mockDelete(...args),DeletionError:class extends Error{code:string;constructor(mockCode:string){super(mockCode);this.code=mockCode;}}}));
jest.mock('../../src/lib/supabase',()=>({supabase:{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>({data:{listener:{unsubscribe:jest.fn()},subscription:{unsubscribe:jest.fn()}}})}}}));
jest.mock('../../src/lib/resetClientState',()=>({resetClientState:jest.fn()}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn(),replace:jest.fn()})}));
beforeEach(()=>{jest.clearAllMocks();usePreferencesStore.setState({profile:defaultProfile('00000000-0000-4000-8000-000000000001')});useAccountDeletionStore.setState({pending:null,starting:false,hydrated:true});});
test('requires acknowledgment and password before sending destructive request',async()=>{
 mockDelete.mockResolvedValue('pending');render(<AccountDeletionSettings/>);fireEvent.press(screen.getByText('Delete account'));fireEvent.press(screen.getByLabelText('Confirm permanent account deletion'));expect(mockDelete).not.toHaveBeenCalled();fireEvent.changeText(screen.getByLabelText('Deletion current password'),'test-password');fireEvent.press(screen.getByText('I understand this permanently deletes my account.'));fireEvent.press(screen.getByLabelText('Confirm permanent account deletion'));await waitFor(()=>expect(mockDelete).toHaveBeenCalled());expect(useAccountDeletionStore.getState().pending).not.toHaveProperty('password');
});
test('missing-session pending notice never reports completed deletion',()=>{
 useAccountDeletionStore.setState({pending:{owner:'old-owner',requestId:'request',accepted:true}});render(<PendingDeletionNotice/>);expect(screen.getByText(/A failed sign-in does not confirm deletion/)).toBeTruthy();expect(screen.queryByText('Account deleted.')).toBeNull();
});

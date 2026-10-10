import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import ForgotPasswordScreen from '../../app/(auth)/forgot-password';
const mockReset=jest.fn(),mockVerify=jest.fn(),mockUpdate=jest.fn(),mockSignOut=jest.fn(),mockReplace=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({email:'tester@example.test'}),useRouter:()=>({replace:mockReplace})}));
jest.mock('../../src/lib/passwordRecovery',()=>({createRecoveryClient:()=>({auth:{resetPasswordForEmail:mockReset,verifyOtp:mockVerify,updateUser:mockUpdate,signOut:mockSignOut}}),recoveryError:()=> 'That code is invalid or expired. Request a new code and try again.',passwordPolicyError:()=> 'Choose a stronger password.'}));
beforeEach(()=>{jest.clearAllMocks();mockReset.mockResolvedValue({error:null});mockVerify.mockResolvedValue({error:null,data:{session:{access_token:'test'}}});mockUpdate.mockResolvedValue({error:null});mockSignOut.mockResolvedValue({error:null});});
test('recovery verifies a code before changing a password and returns to login',async()=>{
 render(<ForgotPasswordScreen/>);fireEvent.press(screen.getByText('Send reset code'));await screen.findByLabelText('Recovery code');
 expect(mockReset).toHaveBeenCalledWith('tester@example.test');fireEvent.changeText(screen.getByLabelText('Recovery code'),'12345678');fireEvent.press(screen.getByText('Verify code'));await screen.findByLabelText('New recovery password');
 expect(mockVerify).toHaveBeenCalledWith({email:'tester@example.test',token:'12345678',type:'recovery'});
 fireEvent.changeText(screen.getByLabelText('New recovery password'),'a-new-password');fireEvent.changeText(screen.getByLabelText('Confirm recovery password'),'a-new-password');fireEvent.press(screen.getByText('Save new password'));
 await screen.findByText('Password updated');expect(mockUpdate).toHaveBeenCalledWith({password:'a-new-password'});
 fireEvent.press(screen.getByText('Back to sign in'));expect(mockReplace).toHaveBeenCalledWith('/sign-in');
});
test('invalid code cannot reveal password fields',async()=>{
 mockVerify.mockResolvedValue({error:{code:'otp_expired'},data:{session:null}});render(<ForgotPasswordScreen/>);fireEvent.press(screen.getByText('Send reset code'));await screen.findByLabelText('Recovery code');fireEvent.changeText(screen.getByLabelText('Recovery code'),'12345678');fireEvent.press(screen.getByText('Verify code'));await screen.findByText('That code is invalid or expired. Request a new code and try again.');expect(screen.queryByLabelText('New recovery password')).toBeNull();expect(mockUpdate).not.toHaveBeenCalled();
});
test('password save success survives a subsequent session revocation failure',async()=>{
 mockSignOut.mockResolvedValue({error:{code:'network'}});render(<ForgotPasswordScreen/>);fireEvent.press(screen.getByText('Send reset code'));await screen.findByLabelText('Recovery code');fireEvent.changeText(screen.getByLabelText('Recovery code'),'12345678');fireEvent.press(screen.getByText('Verify code'));await screen.findByLabelText('New recovery password');fireEvent.changeText(screen.getByLabelText('New recovery password'),'a-new-password');fireEvent.changeText(screen.getByLabelText('Confirm recovery password'),'a-new-password');fireEvent.press(screen.getByText('Save new password'));await waitFor(()=>expect(screen.getByText(/Password updated\. Sign in with your new password\. Other sessions/)).toBeTruthy());expect(screen.queryByText('Could not save the password. Please retry.')).toBeNull();
});


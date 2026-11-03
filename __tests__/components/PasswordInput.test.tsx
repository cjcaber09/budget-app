import {act,fireEvent,render,screen} from '@testing-library/react-native';
import {AppState,type AppStateStatus} from 'react-native';
import {PasswordInput} from '../../src/components/PasswordInput';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';

afterEach(()=>jest.restoreAllMocks());
test('eye icons show and hide the same password without changing its value',()=>{
 const change=jest.fn();render(<PasswordInput accessibilityLabel="New password" value="fictional-password" onChangeText={change}/>);
 expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(true);
 fireEvent.press(screen.getByLabelText('Show new password'));
 expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(false);
 expect(screen.getByLabelText('New password').props.value).toBe('fictional-password');
 fireEvent.press(screen.getByLabelText('Hide new password'));
 expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(true);expect(change).not.toHaveBeenCalled();
});
test('backgrounding, account changes, disabled input and clearing remask passwords',()=>{
 let state:(value:AppStateStatus)=>void=()=>{};
 jest.spyOn(AppState,'addEventListener').mockImplementation((_,listener)=>{state=listener;return {remove:jest.fn()};});
 const view=render(<PasswordInput value="fictional-password"/>);
 fireEvent.press(screen.getByLabelText('Show password'));act(()=>state('background'));
 expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
 fireEvent.press(screen.getByLabelText('Show password'));act(()=>usePreferencesStore.getState().setProfile(defaultProfile('other-owner')));
 expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
 fireEvent.press(screen.getByLabelText('Show password'));view.rerender(<PasswordInput value="fictional-password" editable={false}/>);
 expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
 fireEvent.press(screen.getByLabelText('Show password'));expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
 view.rerender(<PasswordInput value="fictional-password"/>);fireEvent.press(screen.getByLabelText('Show password'));
 view.rerender(<PasswordInput value=""/>);expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
});

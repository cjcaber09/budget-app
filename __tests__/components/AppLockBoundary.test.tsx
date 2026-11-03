import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {Text} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {AppLockBoundary} from '../../src/components/AppLockBoundary';
import {useAppLockStore} from '../../src/stores/useAppLockStore';
import {handleLockAppState} from '../../src/lib/appLock';
beforeEach(async()=>{await SecureStore.setItemAsync('budget-tracker.biometric-lock.v1','enabled');useAppLockStore.setState({loaded:false,enabled:false,locked:true,obscured:false,busy:false,error:''});});
test('holds content until unlock, then hides it again while preserving its mounted state',async()=>{
 render(<AppLockBoundary><Text>Private financial screen</Text></AppLockBoundary>);
 expect(screen.queryByText('Private financial screen')).toBeNull();await screen.findByText('Unlock app');
 fireEvent.press(screen.getByText('Unlock app'));await screen.findByText('Private financial screen');
 await act(async()=>{handleLockAppState('background');handleLockAppState('active');});
 expect(screen.queryByText('Private financial screen')).toBeNull();
 expect(screen.getByText('Private financial screen',{includeHiddenElements:true})).toBeTruthy();
});
test('unknown lock settings fail closed',async()=>{
 await SecureStore.setItemAsync('budget-tracker.biometric-lock.v1','corrupted');render(<AppLockBoundary><Text>Private screen</Text></AppLockBoundary>);
 await waitFor(()=>expect(screen.getByText('Retry secure access')).toBeTruthy());expect(screen.queryByText('Private screen')).toBeNull();
});

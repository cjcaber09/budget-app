import {useState} from 'react';
import {Text} from 'react-native';
import {act,render,screen} from '@testing-library/react-native';
import {KeyboardSheet} from '../../src/components/KeyboardSheet';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useFinancialResetStore} from '../../src/stores/useFinancialResetStore';
import {useAccountDeletionStore} from '../../src/stores/useAccountDeletionStore';
const owner='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{usePreferencesStore.getState().setProfile(defaultProfile(owner));useFinancialResetStore.setState({pending:null,starting:false});useAccountDeletionStore.setState({pending:null,starting:false});});
function Form(){const [open,setOpen]=useState(true);return <KeyboardSheet title="Existing form" visible={open} onClose={()=>setOpen(false)}><Text>Form content</Text></KeyboardSheet>;}
test('cleanup dismisses an existing native sheet without reopening it afterward',()=>{
 render(<Form/>);expect(screen.getByText('Form content')).toBeTruthy();
 act(()=>useFinancialResetStore.setState({starting:true}));expect(screen.queryByText('Form content')).toBeNull();
 act(()=>useFinancialResetStore.setState({starting:false}));expect(screen.queryByText('Form content')).toBeNull();
});
test('the busy cleanup confirmation remains visible while other activity is paused',()=>{
 useFinancialResetStore.setState({starting:true});
 render(<KeyboardSheet title="Clear records" busy allowAccountOperation onClose={()=>{}}><Text>Verifying cleanup</Text></KeyboardSheet>);
 expect(screen.getByText('Verifying cleanup')).toBeTruthy();
});

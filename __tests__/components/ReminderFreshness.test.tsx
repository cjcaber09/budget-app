import {render,screen} from '@testing-library/react-native';
import {Platform} from 'react-native';
import {ReminderFreshness} from '../../src/components/ReminderFreshness';
import {useReminderFreshnessStore} from '../../src/stores/useReminderFreshnessStore';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
const original=Platform.OS;
beforeEach(()=>{Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});usePreferencesStore.getState().setProfile({...defaultProfile('owner'),timezone:'UTC'});useReminderFreshnessStore.setState({owner:'owner',snapshot:{owner:'owner',timezone:'UTC',syncedAt:'2026-10-01T00:00:00Z',scheduledAt:['2099-10-01T00:00:00Z'],mode:'enabled'},syncing:false,error:''});});
afterEach(()=>Object.defineProperty(Platform,'OS',{value:original,configurable:true}));
test('shows successful sync and coverage without hiding a later failure',()=>{
 useReminderFreshnessStore.setState({error:'Could not refresh reminders.'});render(<ReminderFreshness/>);
 expect(screen.getByText(/Last successful sync:/)).toBeTruthy();expect(screen.getByText(/1 upcoming reminder scheduled/)).toBeTruthy();expect(screen.getByText('Could not refresh reminders.')).toBeTruthy();
});
test('never exposes another owner schedule',()=>{useReminderFreshnessStore.setState({owner:'other'});render(<ReminderFreshness/>);expect(screen.getByText('No successful reminder sync recorded yet.')).toBeTruthy();expect(screen.queryByText(/1 upcoming/)).toBeNull();});

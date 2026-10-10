import {render,screen,fireEvent} from '@testing-library/react-native';
import {MonthPicker} from '../../src/components/MonthPicker';
import {Toast} from '../../src/components/Toast';
import {useUiStore} from '../../src/stores/useUiStore';
import {useToastStore} from '../../src/stores/useToastStore';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
beforeEach(()=>{
 jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-11T12:00:00Z'));
 usePreferencesStore.getState().setProfile({user_id:'owner',display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'});
 useUiStore.getState().setSelectedMonth('2026-10-01');useToastStore.getState().dismissToast();
});
afterEach(()=>{jest.useRealTimers();usePreferencesStore.getState().setProfile(null);useToastStore.getState().dismissToast();});
it('blocks next beyond the current month with a dismissible toast, while previous and returning work',()=>{
 render(<><MonthPicker/><Toast/></>);
 fireEvent.press(screen.getByLabelText('Next month'));
 expect(useUiStore.getState().selectedMonth).toBe('2026-10-01');
 expect(screen.getByText('You can only view the current month or earlier.')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Dismiss notification'));expect(useToastStore.getState().message).toBeNull();
 fireEvent.press(screen.getByLabelText('Previous month'));expect(useUiStore.getState().selectedMonth).toBe('2026-09-01');
 fireEvent.press(screen.getByLabelText('Next month'));expect(useUiStore.getState().selectedMonth).toBe('2026-10-01');
});
it('uses the financial timezone at a calendar boundary and also limits controlled report pickers',()=>{
 jest.setSystemTime(new Date('2026-11-01T00:30:00Z'));
 usePreferencesStore.getState().setProfile({...usePreferencesStore.getState().profile!,timezone:'America/Los_Angeles'});
 const change=jest.fn();render(<MonthPicker value="2026-10-01" onChange={change} maxMonth="2028-10-01"/>);
 fireEvent.press(screen.getByLabelText('Next month'));expect(change).not.toHaveBeenCalled();expect(useToastStore.getState().message).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Previous month'));expect(change).toHaveBeenCalledWith('2026-09-01');
});

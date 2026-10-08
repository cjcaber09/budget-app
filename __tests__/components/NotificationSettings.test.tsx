import {act,cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Platform} from 'react-native';
import {NotificationSettings} from '../../src/components/NotificationSettings';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
const mockPermission=jest.fn();const mockUpdate=jest.fn();
jest.mock('../../src/lib/phoneNotifications',()=>({phonePermission:(request:boolean)=>mockPermission(request)}));
jest.mock('../../src/hooks/useProfile',()=>({useUpdateProfile:()=>({mutateAsync:mockUpdate,isPending:false})}));
jest.mock('expo-notifications',()=>({scheduleNotificationAsync:jest.fn().mockResolvedValue('id')}));
const os=Platform.OS;
beforeEach(()=>{Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});mockPermission.mockReset();mockPermission.mockResolvedValue(true);mockUpdate.mockReset();mockUpdate.mockResolvedValue({});usePreferencesStore.getState().setProfile({user_id:'u',display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'});});
afterEach(()=>{cleanup();Object.defineProperty(Platform,'OS',{value:os,configurable:true});usePreferencesStore.getState().setProfile(null);});
function mount(){const client=new QueryClient();return render(<QueryClientProvider client={client}><NotificationSettings/></QueryClientProvider>);}
it('asks permission before saving notification opt-in',async()=>{mount();await waitFor(()=>expect(screen.getByText('Phone notifications are allowed.')).toBeTruthy());fireEvent(screen.getByLabelText('Budget alerts'),'valueChange',true);await waitFor(()=>expect(mockUpdate).toHaveBeenCalledWith({budget_notifications:true}));expect(mockPermission).toHaveBeenCalledWith(true);});
it('leaves opt-in off and offers phone settings when permission is denied',async()=>{mockPermission.mockResolvedValue(false);mount();await waitFor(()=>expect(screen.getByText('Phone notifications are disabled.')).toBeTruthy());fireEvent(screen.getByLabelText('Bill reminders'),'valueChange',true);await waitFor(()=>expect(screen.getByText(/Allow them in your phone settings/)).toBeTruthy());expect(mockUpdate).not.toHaveBeenCalled();expect(screen.getByText('Open phone settings')).toBeTruthy();});
it('does not update another account if it changes during the permission prompt',async()=>{let finish!:(value:boolean)=>void;mockPermission.mockResolvedValueOnce(false).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));mount();await waitFor(()=>expect(screen.getByText('Phone notifications are disabled.')).toBeTruthy());fireEvent(screen.getByLabelText('Budget alerts'),'valueChange',true);await act(async()=>{usePreferencesStore.getState().setProfile({...usePreferencesStore.getState().profile!,user_id:'other'});finish(true);});await waitFor(()=>expect(screen.getByLabelText('Budget alerts').props.disabled).toBe(false));expect(mockUpdate).not.toHaveBeenCalled();});

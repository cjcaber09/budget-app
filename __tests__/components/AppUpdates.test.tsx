import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react-native';
import {AppState,Text,View} from 'react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AppUpdatesProvider,AppUpdatesSettings,UpdateBanner} from '../../src/components/AppUpdates';
import {unavailableUpdate,type AppUpdateSnapshot} from '../../src/lib/appUpdates.types';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {useUpdateBlocker,useUpdateSafetyStore} from '../../src/stores/useUpdateSafetyStore';
import {useScanStore} from '../../src/stores/useScanStore';
import {useHelpStore} from '../../src/stores/useHelpStore';

let mockNative:AppUpdateSnapshot;
const mockCheck=jest.fn(),mockDownload=jest.fn(),mockRestart=jest.fn(),mockFlush=jest.fn();
jest.mock('../../src/lib/appUpdates',()=>({useAppUpdateSnapshot:()=>mockNative,checkAppUpdate:()=>mockCheck(),downloadAppUpdate:()=>mockDownload(),restartAppUpdate:()=>mockRestart()}));
jest.mock('../../src/lib/transactionDraftStorage',()=>({settleTransactionDraftWrites:()=>mockFlush()}));
let client:QueryClient;
function tree(pathname='/',child?:React.ReactNode){return <QueryClientProvider client={client}><AppUpdatesProvider pathname={pathname}><View><UpdateBanner/><AppUpdatesSettings/>{child}</View></AppUpdatesProvider></QueryClientProvider>;}
beforeEach(()=>{
 jest.clearAllMocks();client=new QueryClient({defaultOptions:{mutations:{retry:false}}});
 Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});
 usePreferencesStore.getState().setProfile(defaultProfile('owner'));useUpdateSafetyStore.setState({blockers:[]});useScanStore.getState().clearPendingImage();useHelpStore.getState().reset();
 mockNative={...unavailableUpdate,enabled:true};mockCheck.mockResolvedValue(false);mockDownload.mockResolvedValue(true);mockRestart.mockResolvedValue(undefined);mockFlush.mockResolvedValue(undefined);
});
afterEach(()=>{client.clear();});
const ready=()=>{mockNative={...mockNative,ready:true,pendingKey:'update-1'};};
test('progress uses SDK values, switches to a ready prompt, and never restarts automatically',()=>{
 mockNative={...mockNative,downloading:true,progress:.43};const view=render(tree());
 expect(within(screen.getByTestId('app-update-banner')).getByRole('progressbar').props.accessibilityValue.now).toBe(43);
 mockNative={...mockNative,downloading:false,ready:true,pendingKey:'update-1'};view.rerender(tree());expect(screen.getByText('Update ready')).toBeTruthy();expect(mockRestart).not.toHaveBeenCalled();
 fireEvent.press(within(screen.getByTestId('app-update-banner')).getByText('Later'));expect(screen.queryByTestId('app-update-banner')).toBeNull();expect(screen.getByText('An update is ready to use.')).toBeTruthy();
 mockNative={...mockNative,pendingKey:'update-2'};view.rerender(tree());expect(screen.getByText('Update ready')).toBeTruthy();
});
test('unknown progress stays indeterminate and an idle stale percentage is hidden',()=>{
 mockNative={...mockNative,downloading:true};const view=render(tree());expect(screen.queryByRole('progressbar')).toBeNull();expect(screen.getAllByText('Downloading update…').length).toBe(2);
 mockNative={...mockNative,downloading:false,progress:.9};view.rerender(tree());expect(screen.queryByRole('progressbar')).toBeNull();expect(screen.queryByText('90%')).toBeNull();
});
test('checks and downloads once, waits for the SDK ready state and exposes quiet retry',async()=>{
 let finish!:(available:boolean)=>void;mockCheck.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{finish=resolve;}));const view=render(tree());
 const check=screen.getByText('Check for updates');fireEvent.press(check);fireEvent.press(check);expect(mockCheck).toHaveBeenCalledTimes(1);
 await act(async()=>finish(true));expect(mockDownload).toHaveBeenCalledTimes(1);expect(screen.queryByText('Update ready')).toBeNull();expect(mockRestart).not.toHaveBeenCalled();
 mockNative={...mockNative,available:true,downloadError:new Error('private URL must not appear')};view.rerender(tree());mockDownload.mockRejectedValueOnce(new Error('private transport error'));fireEvent.press(screen.getByText('Retry update'));
 await waitFor(()=>expect(screen.getByText('Could not download the update. Check your connection and retry.')).toBeTruthy());expect(mockCheck).toHaveBeenCalledTimes(1);expect(screen.queryByText(/private/)).toBeNull();expect(screen.queryByTestId('app-update-banner')).toBeNull();
});
test('no available update confirms the current version; unavailable builds do not call APIs',async()=>{
 const view=render(tree());fireEvent.press(screen.getByText('Check for updates'));await waitFor(()=>expect(screen.getByText('You’re up to date.')).toBeTruthy());expect(mockDownload).not.toHaveBeenCalled();
 mockNative={...unavailableUpdate};view.rerender(tree());expect(screen.getByText('Updates are available in the installed phone app.')).toBeTruthy();expect(screen.queryByText('Check for updates')).toBeNull();expect(mockCheck).toHaveBeenCalledTimes(1);
});
test('startup work cannot launch a second native request',()=>{
 mockNative={...mockNative,startup:true};render(tree());fireEvent.press(screen.getByText('Check for updates'));expect(mockCheck).not.toHaveBeenCalled();
});
test('a form blocks restart even after moving to Settings; unmounting it restores the prompt',()=>{
 function Form(){useUpdateBlocker(true);return <Text>Unsaved form</Text>;}
 ready();const view=render(tree('/',<Form/>));expect(screen.queryByTestId('app-update-banner')).toBeNull();expect(screen.getByText('Restart now')).toBeDisabled();
 view.rerender(tree('/settings',<Form/>));expect(screen.getByText('Restart now')).toBeDisabled();view.rerender(tree('/settings'));expect(screen.getByTestId('app-update-banner')).toBeTruthy();
});
test('click rechecks store guards and pending draft writes before restarting; success stays locked',async()=>{
 ready();const view=render(tree());const stale=within(screen.getByTestId('app-update-banner')).getByText('Restart now');
 act(()=>{useUpdateSafetyStore.getState().block('synchronous',true);fireEvent.press(stale);});expect(mockRestart).not.toHaveBeenCalled();expect(mockFlush).not.toHaveBeenCalled();
 act(()=>useUpdateSafetyStore.getState().block('synchronous',false));let flush!:()=>void;mockFlush.mockImplementationOnce(()=>new Promise<void>(resolve=>{flush=resolve;}));fireEvent.press(within(screen.getByTestId('app-update-banner')).getByText('Restart now'));
 act(()=>useScanStore.getState().setPendingImage({uri:'synthetic',base64:'',mimeType:'image/jpeg',requestId:'scan'}));await act(async()=>flush());expect(mockRestart).not.toHaveBeenCalled();
 act(()=>useScanStore.getState().clearPendingImage());view.rerender(tree('/settings'));fireEvent.press(within(screen.getByTestId('app-update-banner')).getByText('Restart now'));await waitFor(()=>expect(mockRestart).toHaveBeenCalledTimes(1));
 expect(screen.getAllByText('Restarting…')[0]).toBeTruthy();for(const button of screen.getAllByText('Restarting…'))fireEvent.press(button);expect(mockRestart).toHaveBeenCalledTimes(1);
});
test('reload failure retains the downloaded update and supports deliberate retry',async()=>{
 ready();mockRestart.mockRejectedValueOnce(new Error('reload failed'));render(tree());fireEvent.press(within(screen.getByTestId('app-update-banner')).getByText('Restart now'));
 await waitFor(()=>expect(screen.getAllByText('Could not restart. Try again, or reopen the app when ready.').length).toBe(2));fireEvent.press(within(screen.getByTestId('app-update-banner')).getByText('Restart now'));await waitFor(()=>expect(mockRestart).toHaveBeenCalledTimes(2));
});
test('late check response after provider unmount does not start a download',async()=>{
 let finish!:(available:boolean)=>void;mockCheck.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{finish=resolve;}));const view=render(tree());fireEvent.press(screen.getByText('Check for updates'));view.unmount();await act(async()=>finish(true));expect(mockDownload).not.toHaveBeenCalled();
});
test('owner changes while draft writes settle cancel the restart',async()=>{
 ready();let finish!:()=>void;mockFlush.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));render(tree());fireEvent.press(within(screen.getByTestId('app-update-banner')).getByText('Restart now'));
 act(()=>usePreferencesStore.getState().setProfile(defaultProfile('another-owner')));await act(async()=>finish());expect(mockRestart).not.toHaveBeenCalled();
});

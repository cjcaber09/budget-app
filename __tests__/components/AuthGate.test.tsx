import {render,screen,fireEvent} from '@testing-library/react-native';
import RootLayout from '../../app/_layout';
const mockRead=jest.fn(),mockReplace=jest.fn(),mockRefresh=jest.fn();
let mockSegments:string[]=[],mockSession:{user:{id:string}}|null=null,mockLoading=true,mockError:string|null=null;
jest.mock('expo-router',()=>({
 useSegments:()=>mockSegments,useRouter:()=>({replace:mockReplace}),
 Navigator:({children}: {children:unknown})=>children,
 Slot:()=>{const {Text}=require('react-native');if(mockSegments[0]==='(auth)')return <Text>Sign-in screen</Text>;mockRead();return <Text>Account screen</Text>;},
 ThemeProvider:({children}: {children:unknown})=>children,DefaultTheme:{colors:{}},DarkTheme:{colors:{}},
}));
jest.mock('../../src/hooks/useSession',()=>({useSession:()=>({session:mockSession,loading:mockLoading,error:mockError,refresh:mockRefresh})}));
jest.mock('../../src/hooks/useProfile',()=>({ProfileBootstrap:()=>null}));
jest.mock('../../src/components/AccountDeletion',()=>({AccountDeletionBoundary:()=>null}));
jest.mock('../../src/components/Toast',()=>({Toast:()=>null}));
jest.mock('expo-status-bar',()=>({StatusBar:()=>null}));
jest.mock('../../src/lib/exportFiles',()=>({clearExportFiles:async()=>{}}));
jest.mock('../../src/lib/resetClientState',()=>({resetClientState:jest.fn()}));
jest.mock('../../src/lib/supabase',()=>({supabase:{auth:{onAuthStateChange:()=>({data:{listener:null,subscription:{unsubscribe:jest.fn()}}})}}}));
beforeEach(()=>{mockRead.mockClear();mockReplace.mockClear();mockRefresh.mockClear();mockSegments=[];mockSession=null;mockLoading=true;mockError=null;});
it('does not mount account routes before session restoration or while redirecting a signed-out user',()=>{
 const view=render(<RootLayout/>);expect(mockRead).not.toHaveBeenCalled();
 mockLoading=false;view.rerender(<RootLayout/>);expect(mockReplace).toHaveBeenCalledWith('/sign-in');expect(mockRead).not.toHaveBeenCalled();
 mockSegments=['(auth)'];view.rerender(<RootLayout/>);expect(screen.getByText('Sign-in screen')).toBeTruthy();expect(mockRead).not.toHaveBeenCalled();
});
it('lets a restored signed-in session mount account routes without waiting for saved preferences',()=>{
 mockLoading=false;mockSession={user:{id:'owner'}};render(<RootLayout/>);
 expect(screen.getByText('Account screen')).toBeTruthy();expect(mockRead).toHaveBeenCalled();
});
it('keeps account reads stopped when session restoration fails and allows retry',()=>{
 mockLoading=false;mockError='Offline';render(<RootLayout/>);expect(mockRead).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Retry session'));expect(mockRefresh).toHaveBeenCalledTimes(1);
});

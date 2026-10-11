import {render,screen,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {FinancialResetBoundary} from '../../src/components/FinancialReset';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useFinancialResetStore} from '../../src/stores/useFinancialResetStore';
import {useToastStore} from '../../src/stores/useToastStore';
const owner='00000000-0000-4000-8000-000000000001';
const requestId='00000000-0000-4000-8000-000000000002';
const mockRequest=jest.fn(),mockClear=jest.fn(),mockReplace=jest.fn();
const mockRouter={replace:mockReplace};
jest.mock('../../src/hooks/useSession',()=>({useSession:()=>({session:{user:{id:owner}}})}));
jest.mock('../../src/lib/financialReset',()=>({financialResetRequest:(...args:unknown[])=>mockRequest(...args),FinancialResetError:class extends Error{code:string;constructor(code:string){super(code);this.code=code;}}}));
jest.mock('../../src/lib/resetFinancialClientState',()=>({resetFinancialClientState:(...args:unknown[])=>mockClear(...args)}));
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:async()=>({data:null,error:null}),auth:{signOut:jest.fn()}}}));
jest.mock('expo-router',()=>({useRouter:()=>mockRouter}));
let client:QueryClient;
beforeEach(()=>{jest.clearAllMocks();client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}});usePreferencesStore.setState({profile:defaultProfile(owner)});useFinancialResetStore.setState({pending:{owner,requestId,accepted:true},handled:{},hydrated:true,starting:false,epoch:0});useToastStore.getState().dismissToast();});
afterEach(()=>client.clear());
function mount(){return render(<QueryClientProvider client={client}><FinancialResetBoundary/></QueryClientProvider>);}
it('leaves activity paused and reports unconfirmed status instead of clearing caches on request failure',async()=>{
 mockRequest.mockRejectedValue(new Error('Offline'));mount();await screen.findByText('Could not confirm the reset. Check your connection and retry.');expect(mockClear).not.toHaveBeenCalled();expect(useFinancialResetStore.getState().pending?.requestId).toBe(requestId);
});
it('distinguishes confirmed server completion from failed device refresh',async()=>{
 mockRequest.mockResolvedValue('completed');mockClear.mockRejectedValueOnce(new Error('Device failure'));mount();await screen.findByText('Records are cleared. Could not refresh this device. Retry.');expect(screen.getByText('Records cleared')).toBeTruthy();expect(mockReplace).not.toHaveBeenCalled();expect(useFinancialResetStore.getState().pending).not.toBeNull();
});
it('marks completion once and refreshes navigation without discarding saved preferences',async()=>{
 mockRequest.mockResolvedValue('completed');mockClear.mockResolvedValue(undefined);mount();await waitFor(()=>expect(useFinancialResetStore.getState().epoch).toBe(1));expect(mockReplace).toHaveBeenCalledWith('/');expect(usePreferencesStore.getState().profile?.user_id).toBe(owner);expect(useFinancialResetStore.getState().handled[owner]).toBe(requestId);
});

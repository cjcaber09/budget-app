import {act,renderHook,waitFor} from '@testing-library/react-native';
import {useSession} from '../../src/hooks/useSession';
const mockGetSession=jest.fn();let mockListener:(event:string,session:unknown)=>void;
jest.mock('../../src/lib/supabase',()=>({supabase:{auth:{getSession:()=>mockGetSession(),onAuthStateChange:(listener:typeof mockListener)=>{mockListener=listener;return {data:{subscription:{unsubscribe:jest.fn()}}};}}}}));
beforeEach(()=>mockGetSession.mockReset());afterEach(()=>jest.useRealTimers());
it('offers recovery after a stalled session lookup and restores a retried session',async()=>{
 jest.useFakeTimers({doNotFake:['queueMicrotask']});mockGetSession.mockImplementation(()=>new Promise(()=>{}));
 const {result}=renderHook(()=>useSession());await act(async()=>{await jest.advanceTimersByTimeAsync(12000);});
 expect(result.current.loading).toBe(false);expect(result.current.error).toMatch(/timed out/);
 mockGetSession.mockResolvedValue({data:{session:{user:{id:'owner'}}},error:null});
 await act(async()=>{await result.current.refresh();});
 expect(result.current.session?.user.id).toBe('owner');expect(result.current.error).toBeNull();expect(result.current.loading).toBe(false);
});
it('does not restore an old lookup result after a sign-out event',async()=>{
 let resolveLookup!:(value:unknown)=>void;mockGetSession.mockImplementation(()=>new Promise(resolve=>{resolveLookup=resolve;}));
 const {result}=renderHook(()=>useSession());await waitFor(()=>expect(mockGetSession).toHaveBeenCalled());
 act(()=>mockListener('SIGNED_OUT',null));
 await act(async()=>{resolveLookup({data:{session:{user:{id:'old-owner'}}},error:null});});
 expect(result.current.session).toBeNull();expect(result.current.loading).toBe(false);
});

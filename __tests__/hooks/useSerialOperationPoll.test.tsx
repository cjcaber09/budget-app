import {act,renderHook} from '@testing-library/react-native';
import {AppState,type AppStateStatus} from 'react-native';
import {useSerialOperationPoll} from '../../src/hooks/useSerialOperationPoll';

beforeEach(()=>jest.useFakeTimers());
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
test('slow checks survive timers and foreground events without overlapping or discarding results',async()=>{
 let resume:(value:AppStateStatus)=>void=()=>{};
 jest.spyOn(AppState,'addEventListener').mockImplementation((_,listener)=>{resume=listener;return {remove:jest.fn()};});
 let finish:(value:boolean)=>void=()=>{};const accepted=jest.fn();
 const task=jest.fn(async(current:()=>boolean)=>{const repeat=await new Promise<boolean>(resolve=>{finish=resolve;});if(current())accepted();return repeat;});
 const {result}=renderHook(()=>useSerialOperationPoll(true,'owner:request',task));
 await act(async()=>{jest.advanceTimersByTime(60000);resume('active');result.current();});
 expect(task).toHaveBeenCalledTimes(1);
 await act(async()=>finish(true));expect(accepted).toHaveBeenCalledTimes(1);
 await act(async()=>jest.advanceTimersByTime(9999));expect(task).toHaveBeenCalledTimes(1);
 await act(async()=>jest.advanceTimersByTime(1));expect(task).toHaveBeenCalledTimes(2);
 await act(async()=>finish(false));expect(accepted).toHaveBeenCalledTimes(2);
});
test('changing operation or unmounting disqualifies old responses',async()=>{
 const checks:{current:()=>boolean;finish:(repeat:boolean)=>void}[]=[];
 const task=jest.fn((current:()=>boolean)=>new Promise<boolean>(finish=>checks.push({current,finish})));
 const view=renderHook((props:{id:string})=>useSerialOperationPoll(true,props.id,task),{initialProps:{id:'owner:first'}});
 view.rerender({id:'other:second'});expect(checks[0].current()).toBe(false);expect(checks[1].current()).toBe(true);
 await act(async()=>checks[0].finish(true));view.unmount();expect(checks[1].current()).toBe(false);
 await act(async()=>{checks[1].finish(true);jest.advanceTimersByTime(30000);});expect(task).toHaveBeenCalledTimes(2);
});

import {useToastStore} from '../../src/stores/useToastStore';
beforeEach(()=>{jest.useFakeTimers();useToastStore.getState().dismissToast();});
afterEach(()=>{useToastStore.getState().dismissToast();jest.useRealTimers();});
test('dismisses after five seconds and resets the deadline for repeated messages',()=>{
 const store=useToastStore.getState();store.showToast('Saved');jest.advanceTimersByTime(4999);expect(useToastStore.getState().message).toBe('Saved');
 store.showToast('Saved');jest.advanceTimersByTime(1);expect(useToastStore.getState().message).toBe('Saved');jest.advanceTimersByTime(4999);expect(useToastStore.getState().message).toBeNull();
});
test('manual dismissal cancels expiry without dismissing a newer toast',()=>{
 const store=useToastStore.getState();store.showToast('Old');jest.advanceTimersByTime(2000);store.dismissToast();store.showToast('New');jest.advanceTimersByTime(3000);expect(useToastStore.getState().message).toBe('New');jest.advanceTimersByTime(2000);expect(useToastStore.getState().message).toBeNull();
});

import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {View} from 'react-native';
import {SpendingGuidance} from '../../src/components/SpendingGuidance';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
import type {DashboardSnapshot} from '../../src/domain/spendingGuidance';
const mockMutate=jest.fn();jest.mock('../../src/hooks/useDashboard',()=>({useSetMonthlyLimit:()=>({mutate:mockMutate,isPending:false})}));
const snapshot:DashboardSnapshot={complete:true,timezone:'UTC',preview:false,today:'2026-10-16',month:'2026-10-01',limitCents:200000,allocatedCents:120000,incomeCents:250000,expenseCents:138000,spentToDateCents:138000,futureRecordedCents:0,discretionaryToDateCents:10000,futureDiscretionaryCents:0,reservedCents:0,bills:[],legacyDuplicates:0,categoryTotals:[]};
beforeEach(()=>{mockMutate.mockReset();act(()=>usePreferencesStore.getState().setProfile(defaultProfile('owner')));});
afterEach(()=>act(()=>usePreferencesStore.getState().setProfile(null)));
const edit=()=>fireEvent.press(screen.getByLabelText('Edit monthly budget'));
test('replaces the displayed amount in place, preserves draft across unavailable refreshes, and cancels to confirmed data',()=>{
 const view=render(<SpendingGuidance snapshot={snapshot}/>);edit();expect(screen.queryByLabelText('Edit monthly budget')).toBeNull();expect(screen.getByLabelText('Monthly budget').props.autoFocus).toBe(true);
 expect(screen.queryByText('$2,000.00')).toBeNull();
 fireEvent.changeText(screen.getByLabelText('Monthly budget'),'3456.00');
 view.rerender(<SpendingGuidance snapshot={undefined} month={snapshot.month} available={false}/>);expect(screen.getByLabelText('Monthly budget').props.value).toBe('3,456.00');expect(screen.queryByText('Safe to spend')).toBeNull();
 view.rerender(<SpendingGuidance snapshot={{...snapshot,limitCents:240000}}/>);expect(screen.getByLabelText('Monthly budget').props.value).toBe('3,456.00');
 fireEvent.press(screen.getByText('Cancel'));expect(screen.queryByLabelText('Monthly budget')).toBeNull();expect(screen.getByText('$2,400.00')).toBeTruthy();expect(mockMutate).not.toHaveBeenCalled();
});
test('validates cap and freezes input, save and cancel throughout the write',()=>{
 render(<SpendingGuidance snapshot={snapshot}/>);edit();fireEvent.changeText(screen.getByLabelText('Monthly budget'),'100');fireEvent.press(screen.getByText('Save budget'));expect(mockMutate).not.toHaveBeenCalled();expect(screen.getByText(/cannot be less than combined/)).toBeTruthy();
 fireEvent.changeText(screen.getByLabelText('Monthly budget'),'2400');fireEvent.press(screen.getByText('Save budget'));expect(mockMutate).toHaveBeenCalledWith('2400.00',expect.any(Object));expect(screen.getByLabelText('Monthly budget').props.editable).toBe(false);expect(screen.getByText('Cancel')).toBeDisabled();
 act(()=>mockMutate.mock.calls[0][1].onError(new Error('Rejected by server')));expect(screen.getByLabelText('Monthly budget').props.editable).toBe(true);expect(screen.getByText('Rejected by server')).toBeTruthy();expect(screen.getByLabelText('Monthly budget').props.value).toBe('2,400');
});
test('confirmed save with failed refresh retries reads only and hides stale guidance',async()=>{
 const refresh=jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined),required=jest.fn();
 render(<SpendingGuidance snapshot={snapshot} refresh={refresh} onRefreshRequired={required}/>);edit();fireEvent.press(screen.getByText('Save budget'));await act(async()=>mockMutate.mock.calls[0][1].onSuccess());
 await waitFor(()=>expect(screen.getByText('Retry refresh')).toBeTruthy());expect(screen.queryByText('Safe to spend')).toBeNull();expect(screen.queryByText('Spent')).toBeNull();expect(required).toHaveBeenLastCalledWith(true);
 fireEvent.press(screen.getByText('Retry refresh'));await waitFor(()=>expect(screen.getByLabelText('Edit monthly budget')).toBeTruthy());expect(refresh).toHaveBeenCalledTimes(2);expect(mockMutate).toHaveBeenCalledTimes(1);expect(required).toHaveBeenLastCalledWith(false);
});
test('unset amount starts blank; callbacks from a previous owner/month cannot refresh a new editor',async()=>{
 const refresh=jest.fn(),view=render(<View><SpendingGuidance key="first" snapshot={{...snapshot,limitCents:null,allocatedCents:0}} refresh={refresh}/></View>);edit();expect(screen.getByLabelText('Monthly budget').props.value).toBe('');fireEvent.changeText(screen.getByLabelText('Monthly budget'),'1500');fireEvent.press(screen.getByText('Save budget'));const success=mockMutate.mock.calls[0][1].onSuccess;
 view.rerender(<View><SpendingGuidance key="second" snapshot={{...snapshot,month:'2026-11-01'}} refresh={refresh}/></View>);await act(async()=>success());expect(refresh).not.toHaveBeenCalled();expect(screen.getByLabelText('Edit monthly budget')).toBeTruthy();
});

import {fireEvent,render,screen} from '@testing-library/react-native';
import {ActivityBalanceChange} from '../../src/components/ActivityBalanceChange';
import {ActivityBalanceDetails} from '../../src/components/ActivityBalanceDetails';
import type {ActivityBalance} from '../../src/domain/activityBalances';
const id='00000000-0000-4000-8000-000000000001';
const balance:ActivityBalance={kind:'transaction',id,accounts:[{methodId:id,name:'Cash',method:'cash',paymentType:'Cash',state:'applied',beforeCents:10000,changeCents:-5000,afterCents:5000}]};
const mockRefetch=jest.fn();
const mockQuery={data:new Map([['transaction:'+id,balance]]),isError:false,isFetching:false,refetch:mockRefetch};
jest.mock('../../src/hooks/useActivityBalances',()=>({useActivityBalances:()=>mockQuery}));
beforeEach(()=>{mockRefetch.mockClear();mockQuery.isError=false;mockQuery.isFetching=false;});
test('shows before and after for a Cash expense of 50',()=>{
 render(<ActivityBalanceChange balance={balance}/>);expect(screen.getByText('Before')).toBeTruthy();expect(screen.getByText('After')).toBeTruthy();expect(screen.getByText('$100.00')).toBeTruthy();expect(screen.getByText('$50.00')).toBeTruthy();
});
test('never shows stale figures during refresh or a failed check and retries locally',()=>{
 const h=render(<ActivityBalanceDetails entry={{kind:'transaction',id}}/>);expect(screen.getByText('$50.00')).toBeTruthy();
 mockQuery.isFetching=true;h.rerender(<ActivityBalanceDetails entry={{kind:'transaction',id}}/>);expect(screen.queryByText('$50.00')).toBeNull();expect(screen.getByText('Loading balance history…')).toBeTruthy();
 mockQuery.isFetching=false;mockQuery.isError=true;h.rerender(<ActivityBalanceDetails entry={{kind:'transaction',id}}/>);expect(screen.queryByText('$50.00')).toBeNull();fireEvent.press(screen.getByLabelText('Retry balance history'));expect(mockRefetch).toHaveBeenCalledTimes(1);
});
test.each(['scheduled','opening','unset'] as const)('%s entries explain why there is no current balance change',state=>{
 render(<ActivityBalanceChange balance={{...balance,accounts:[{...balance.accounts[0],state,beforeCents:null,afterCents:null}]}}/>);expect(screen.queryByText('Before')).toBeNull();expect(screen.queryByText('$0.00')).toBeNull();
 const copy={scheduled:/Future-dated entry/,opening:/Already included in the starting balance/,unset:/Balance not set/};expect(screen.getByText(copy[state])).toBeTruthy();
});
test('labels credit-card debt without presenting it as cash funds',()=>{
 render(<ActivityBalanceChange balance={{...balance,accounts:[{...balance.accounts[0],method:'card',paymentType:'Credit card',beforeCents:-10000,afterCents:-15000}]}}/>);expect(screen.getByText('$100.00 owed')).toBeTruthy();expect(screen.getByText('$150.00 owed')).toBeTruthy();
});

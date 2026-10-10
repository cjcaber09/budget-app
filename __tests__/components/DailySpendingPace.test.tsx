import {render,screen} from '@testing-library/react-native';
import {DailySpendingPace} from '../../src/components/DailySpendingPace';
import type {DashboardSnapshot} from '../../src/domain/spendingGuidance';
const snapshot:DashboardSnapshot={today:'2026-10-10',month:'2026-10-01',timezone:'Asia/Manila',complete:true,preview:false,limitCents:100000,allocatedCents:0,incomeCents:0,expenseCents:40000,spentToDateCents:30000,futureRecordedCents:10000,discretionaryToDateCents:20000,futureDiscretionaryCents:10000,reservedCents:20000,legacyDuplicates:0,bills:[],categoryTotals:[]};
test.each([null,0,100000,50000])('distinguishes allowance %s without changing the authoritative forecast',limit=>{
 render(<DailySpendingPace snapshot={{...snapshot,limitCents:limit}}/>);expect(screen.getByLabelText('Estimated month-end spending: $920.00')).toBeTruthy();
 if(limit===null){expect(screen.queryByText('Monthly allowance')).toBeNull();expect(screen.getByText('Set a monthly allowance on Overview to compare your forecast.')).toBeTruthy();}
 else expect(screen.getByLabelText(`Monthly allowance: $${(limit/100).toLocaleString('en-US',{minimumFractionDigits:2})}`)).toBeTruthy();
 if(limit===0||limit===50000)expect(screen.getByText('Over budget')).toBeTruthy();
});
test.each(['2026-09-01','2026-11-01'])('omits pace for noncurrent month %s',month=>{
 render(<DailySpendingPace snapshot={{...snapshot,month}}/>);expect(screen.queryByText('Daily Spending Pace')).toBeNull();
});

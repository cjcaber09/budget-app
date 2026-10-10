import {render,screen} from '@testing-library/react-native';
import {MonthlyTrendChart} from '../../src/components/MonthlyTrendChart';
test('weekly range and accessible row describe the complete final clipped bucket',()=>{
 render(<MonthlyTrendChart kind="weekly" totals={[{month:'2026-10-01',end:'2026-10-04',total:10},{month:'2026-10-26',end:'2026-10-31',total:20}]}/>);
 expect(screen.getByText('Oct 1 – Oct 31')).toBeTruthy();expect(screen.getByLabelText('Oct 26 to Oct 31: $20.00')).toBeTruthy();
});

test('empty and zero-spending periods render the empty state without a reduction error',()=>{
 const view=render(<MonthlyTrendChart totals={[]}/>);
 expect(screen.getByText('No recorded expenses in this period.')).toBeTruthy();
 view.rerender(<MonthlyTrendChart totals={[{month:'2026-10-01',total:0,cents:0}]}/>);
 expect(screen.getByText('No recorded expenses in this period.')).toBeTruthy();
 expect(screen.getByLabelText('Oct 2026: $0.00')).toBeTruthy();
});

test('the peak scale preserves the largest exact cent amount',()=>{
 render(<MonthlyTrendChart totals={[{month:'2026-09-01',total:2.01,cents:201},{month:'2026-10-01',total:5.99,cents:599}]}/>);
 expect(screen.getAllByText('$5.99',{includeHiddenElements:true}).length).toBeGreaterThan(0);
});

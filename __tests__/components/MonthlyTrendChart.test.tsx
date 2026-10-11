import {fireEvent,render,screen} from '@testing-library/react-native';
import {Circle} from 'react-native-svg';
import {MonthlyTrendChart} from '../../src/components/MonthlyTrendChart';
test('weekly range and accessible row describe the complete final clipped bucket',()=>{
 render(<MonthlyTrendChart kind="weekly" totals={[{month:'2026-10-01',end:'2026-10-04',total:10},{month:'2026-10-26',end:'2026-10-31',total:20}]}/>);
 expect(screen.getByText('Oct 1 – Oct 31')).toBeTruthy();expect(screen.getByLabelText('Oct 26 to Oct 31: $20.00')).toBeTruthy();
});

test('empty and zero-spending periods render the empty state without a reduction error',()=>{
 const view=render(<MonthlyTrendChart totals={[]}/>);
 expect(screen.getByText('No net expenses in this period.')).toBeTruthy();
 view.rerender(<MonthlyTrendChart totals={[{month:'2026-10-01',total:0,cents:0}]}/>);
 expect(screen.getByText('No net expenses in this period.')).toBeTruthy();
 expect(screen.getByLabelText('Oct 2026: $0.00')).toBeTruthy();
});

test('negative net spending remains visible and plotted within bounds on both sides of zero',()=>{
 render(<MonthlyTrendChart totals={[{month:'2026-09-01',total:200,cents:20000},{month:'2026-10-01',total:-100,cents:-10000}]}/>);
 expect(screen.getByLabelText('Oct 2026: -$100.00')).toBeTruthy();expect(screen.getByText('Negative amounts mean refunds exceed spending.')).toBeTruthy();
 fireEvent(screen.getByTestId('spending-trend-plot',{includeHiddenElements:true}),'layout',{nativeEvent:{layout:{width:300}}});
 for(const dot of screen.UNSAFE_getAllByType(Circle)){expect(dot.props.cy).toBeGreaterThanOrEqual(16);expect(dot.props.cy).toBeLessThanOrEqual(158);}
});

test('the peak scale preserves the largest exact cent amount',()=>{
 render(<MonthlyTrendChart totals={[{month:'2026-09-01',total:2.01,cents:201},{month:'2026-10-01',total:5.99,cents:599}]}/>);
 expect(screen.getAllByText('$5.99',{includeHiddenElements:true}).length).toBeGreaterThan(0);
});

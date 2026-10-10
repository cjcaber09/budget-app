import {render,screen} from '@testing-library/react-native';
import {MonthlyTrendChart} from '../../src/components/MonthlyTrendChart';
test('weekly range and accessible row describe the complete final clipped bucket',()=>{
 render(<MonthlyTrendChart kind="weekly" totals={[{month:'2026-10-01',end:'2026-10-04',total:10},{month:'2026-10-26',end:'2026-10-31',total:20}]}/>);
 expect(screen.getByText('Oct 1 – Oct 31')).toBeTruthy();expect(screen.getByLabelText('Oct 26 to Oct 31: $20.00')).toBeTruthy();
});

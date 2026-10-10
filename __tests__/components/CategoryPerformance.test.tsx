import {render,screen} from '@testing-library/react-native';
import {CategoryPerformance} from '../../src/components/CategoryPerformance';
import {decodedReport,category} from '../../test-utils/report';
let mockReport:any;
jest.mock('../../src/hooks/useReports',()=>({useReports:()=>mockReport}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:jest.fn()})}));
beforeEach(()=>{mockReport={data:decodedReport(),supported:true,today:'2026-10-09',isPending:false,isError:false,refetch:jest.fn()};});
test('over-budget detail includes exact overage, share, usage, count and historical trend',()=>{
 render(<CategoryPerformance categoryId={category} month="2026-10-01"/>);expect(screen.getByText('Over by')).toBeTruthy();expect(screen.getByText('$100.00')).toBeTruthy();expect(screen.getByText('120%')).toBeTruthy();expect(screen.getByText('Transactions')).toBeTruthy();
});
test('a near-limit value is not rounded into a reached-budget percentage',()=>{
 mockReport.data.categories.data[0].spent=49999;render(<CategoryPerformance categoryId={category} month="2026-10-01"/>);expect(screen.getByText('Remaining budget')).toBeTruthy();expect(screen.getByText('$0.01')).toBeTruthy();expect(screen.getByText('99.9%')).toBeTruthy();
});
test('unbudgeted categories do not show a made-up remaining balance',()=>{
 mockReport.data.categories.data[0].budget=null;render(<CategoryPerformance categoryId={category} month="2026-10-01"/>);expect(screen.getAllByText('Not budgeted')).toHaveLength(2);
});

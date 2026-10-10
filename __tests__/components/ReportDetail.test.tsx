import {fireEvent,render,screen} from '@testing-library/react-native';
import ReportDetailScreen from '../../app/(tabs)/report/[kind]';
import {decodedReport,owner,category} from '../../test-utils/report';
const mockPush=jest.fn(),mockSetMonth=jest.fn();let mockParams:any,mockReport:any;
const mockCash={id:category,user_id:owner,type:'expense',category_id:null,amount:20,note:'Cash expense',transaction_date:'2026-10-01',occurred_at:'2026-10-01T00:00:00Z',payment_method_id:category,payment_method_kind:'cash'};
const mockCard={...mockCash,id:owner,note:'Card expense',payment_method_kind:'card'};
const mockIncome={...mockCash,id:'income',type:'income',income_source_id:null,note:'Unspecified income',payment_method_kind:'cash'};
jest.mock('../../src/hooks/useReports',()=>({useReports:()=>mockReport,useReportTransactions:()=>({data:[mockCash,mockCard,mockIncome],isPending:false,isError:false,refetch:jest.fn()}),useReportTransfers:()=>({data:[{id:'transfer',transfer_date:'2026-10-01',amount:150000,source_name:'Cash',destination_name:'Bank',note:'Separate transfer'}],isPending:false,isError:false})}));
jest.mock('../../src/stores/useUiStore',()=>({useUiStore:(s:any)=>s({selectedMonth:'2026-09-01',setSelectedMonth:mockSetMonth})}));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn]),useRouter:()=>({push:mockPush,replace:jest.fn()})}));
beforeEach(()=>{jest.clearAllMocks();mockParams={kind:'cashflow',month:'2026-10-01',visit:'1'};mockReport={data:decodedReport(),supported:true,today:'2026-10-09',isPending:false,isError:false,refetch:jest.fn()};});
test('explicit Cash assignments appear in Cash filter while card/income records stay out',()=>{
 mockParams={...mockParams,kind:'accounts',filter:'cash'};render(<ReportDetailScreen/>);expect(screen.getByText('Cash expense')).toBeTruthy();expect(screen.queryByText('Card expense')).toBeNull();expect(screen.queryByText('Unspecified income')).toBeNull();expect(mockSetMonth).toHaveBeenCalledWith('2026-10-01');
});
test('Unspecified income filter selects null assignments and retains edit visit behavior',()=>{
 mockParams={...mockParams,kind:'income',filter:'unspecified'};render(<ReportDetailScreen/>);fireEvent.press(screen.getByText('Unspecified income'));expect(mockPush).toHaveBeenCalledWith({pathname:'/transaction/[id]',params:{id:'income',visit:expect.any(String)}});expect(screen.queryByText('Cash expense')).toBeNull();
});
test('transfers are separate read-only rows outside the recorded cash flow totals',()=>{
 render(<ReportDetailScreen/>);expect(screen.getByText('Separate transfer')).toBeTruthy();expect(screen.getByText('Recorded cash flow')).toBeTruthy();expect(screen.queryByLabelText(/Edit .*transfer/i)).toBeNull();expect(screen.getByText('$900.00')).toBeTruthy();
});
test('changing visits resets the cash-flow type filter',()=>{
 const h=render(<ReportDetailScreen/>);fireEvent.press(screen.getByRole('button',{name:'Expenses'}));expect(screen.queryByText('Unspecified income')).toBeNull();mockParams={...mockParams,visit:'2'};h.rerender(<ReportDetailScreen/>);expect(screen.getByText('Unspecified income')).toBeTruthy();
});
test('invalid comparison money has a retry while history routes remain usable',()=>{
 mockReport.data.comparison={error:'Comparison unavailable'};mockParams={...mockParams,kind:'comparison'};render(<ReportDetailScreen/>);expect(screen.getByText('Comparison unavailable')).toBeTruthy();fireEvent.press(screen.getByText('Retry report'));expect(mockReport.refetch).toHaveBeenCalled();
});

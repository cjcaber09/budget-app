import {fireEvent,render,screen} from '@testing-library/react-native';
import ReportsScreen from '../../app/(tabs)/reports';
import {decodedReport,category} from '../../test-utils/report';
const mockPush=jest.fn(),mockRefetch=jest.fn();let mockMonth='2026-10-01';let mockReport:any;
jest.mock('../../src/components/CsvExport',()=>({CsvExport:()=>null}));
jest.mock('../../src/hooks/useReports',()=>({useReports:()=>mockReport}));
jest.mock('../../src/hooks/useDashboard',()=>({useDashboard:()=>({isPending:false,isError:false})}));
jest.mock('../../src/stores/useUiStore',()=>({useUiStore:(s:any)=>s({selectedMonth:mockMonth,setSelectedMonth:jest.fn()})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,replace:jest.fn()})}));
beforeEach(()=>{jest.clearAllMocks();mockMonth='2026-10-01';mockReport={data:decodedReport(),supported:true,today:'2026-10-09',isPending:false,isError:false,refetch:mockRefetch};});
test('preserves category doughnuts and opens a fresh month-scoped category visit',()=>{
 render(<ReportsScreen/>);expect(screen.getByText('120%',{includeHiddenElements:true})).toBeTruthy();expect(screen.getByText('Over by $100.00')).toBeTruthy();expect(screen.getByText('Expense Trend')).toBeTruthy();expect(screen.getByText('Twelve months ending in your selected month.')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('View Groceries budget'));expect(mockPush).toHaveBeenCalledWith({pathname:'/budget/[categoryId]',params:{categoryId:category,month:mockMonth,visit:expect.any(String)}});
});
test('a category-section failure leaves independently valid trend and links visible',()=>{
 mockReport.data.categories={error:'Category data unavailable'};render(<ReportsScreen/>);expect(screen.queryByText('120%')).toBeNull();expect(screen.getAllByText('Nov 2025',{exact:false})[0]).toBeTruthy();expect(screen.getByLabelText('View Detailed cash flow')).toBeTruthy();fireEvent.press(screen.getAllByText('Retry report')[0]);expect(mockRefetch).toHaveBeenCalled();
});
test('historical selection uses its supplied trend without marking its last point current',()=>{
 mockMonth='2026-08-01';mockReport.data.monthly.data=[{day:'2025-09-01',amount:0,future:false},{day:'2026-08-01',amount:1200,future:false}];render(<ReportsScreen/>);expect(screen.queryByText('Daily Spending Pace')).toBeNull();expect(screen.queryByText('Current month'+String.fromCharCode(8212)+'in progress')).toBeNull();expect(screen.getByText('Sep 2025 '+String.fromCharCode(8211)+' Aug 2026')).toBeTruthy();
});
test('unsupported selections offer recovery without fabricated totals',()=>{mockReport.supported=false;render(<ReportsScreen/>);expect(screen.getByText('Return to current month')).toBeTruthy();expect(screen.queryByText('Budget vs Actual')).toBeNull();});
test('detail links retain selected month with a new visit',()=>{render(<ReportsScreen/>);fireEvent.press(screen.getByLabelText('View Income breakdown'));expect(mockPush).toHaveBeenCalledWith({pathname:'/report/[kind]',params:{kind:'income',month:mockMonth,visit:expect.any(String)}});});

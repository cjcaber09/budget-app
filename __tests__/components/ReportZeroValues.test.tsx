import {act,fireEvent,render,screen,within} from '@testing-library/react-native';
import {Path,Circle} from 'react-native-svg';
import ReportsScreen from '../../app/(tabs)/reports';
import ReportDetailScreen from '../../app/(tabs)/report/[kind]';
import {decodedReport,owner} from '../../test-utils/report';
import {useReportDisplayStore} from '../../src/stores/useReportDisplayStore';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
import type {ReportSnapshot} from '../../src/domain/reports';

let mockParams={kind:'accounts',month:'2026-10-01',visit:'zero-check'};
let mockReport:{data:ReportSnapshot;supported:boolean;today:string;isPending:boolean;isError:boolean;refetch:jest.Mock};
const mockPush=jest.fn();
jest.mock('../../src/components/CsvExport',()=>({CsvExport:()=>null}));
jest.mock('../../src/hooks/useReports',()=>({
  useReports:()=>mockReport,
  useReportTransactions:()=>({data:[],isPending:false,isError:false}),
  useReportTransfers:()=>({data:[],isPending:false,isError:false}),
}));
jest.mock('../../src/hooks/useDashboard',()=>({useDashboard:()=>({isPending:false,isError:false})}));
jest.mock('../../src/stores/useUiStore',()=>({useUiStore:(select:(state:unknown)=>unknown)=>select({selectedMonth:'2026-10-01',setSelectedMonth:jest.fn()})}));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useFocusEffect:(fn:()=>void)=>jest.requireActual<typeof import('react')>('react').useEffect(fn,[fn]),useRouter:()=>({push:mockPush,replace:jest.fn()})}));

beforeEach(()=>{
  jest.clearAllMocks();
  usePreferencesStore.getState().setProfile(null);
  useReportDisplayStore.setState({hideZeroValues:false});
  mockParams={kind:'accounts',month:'2026-10-01',visit:'zero-check'};
  const data=decodedReport();
  data.categories.data!.push(
    {key:'unused',id:'unused',name:'Unused',color:'#55816A',budget:null,spent:0,count:0},
    {key:'allocated',id:'allocated',name:'Allocated',color:'#55816A',budget:10000,spent:0,count:0},
    {key:'refunded',id:'refunded',name:'Refunded',color:'#55816A',budget:null,spent:-1000,count:1},
  );
  data.monthly.data=[{day:'2026-08-01',amount:0,future:false},{day:'2026-09-01',amount:-1000,future:false},{day:'2026-10-01',amount:59000,future:false}];
  data.totals.data={income:150000,expense:59000,net:91000,count:3};
  mockReport={data,supported:true,today:'2026-10-09',isPending:false,isError:false,refetch:jest.fn()};
});

test('defaults off; hiding zeros retains budgets/refunds, exact totals and restores rows when disabled',()=>{
  render(<ReportsScreen/>);
  expect(screen.getByLabelText('Hide zero values').props.value).toBe(false);
  expect(screen.getByLabelText('View Unused budget')).toBeTruthy();
  expect(screen.getByLabelText('View Unused spending')).toBeTruthy();
  expect(screen.getByLabelText('Aug 2026: $0.00')).toBeTruthy();
  const original=JSON.stringify(mockReport.data);
  fireEvent(screen.getByLabelText('Hide zero values'),'valueChange',true);
  expect(screen.queryByLabelText('View Unused budget')).toBeNull();
  expect(screen.queryByLabelText('View Unused spending')).toBeNull();
  expect(screen.getByLabelText('View Allocated budget')).toBeTruthy();
  expect(screen.getByLabelText('View Refunded spending')).toBeTruthy();
  expect(screen.getByLabelText('Sep 2026: -$10.00')).toBeTruthy();
  expect(screen.queryByLabelText('Aug 2026: $0.00')).toBeNull();
  expect(within(screen.getByLabelText('View Account spending')).getByText('$590.00')).toBeTruthy();
  expect(JSON.stringify(mockReport.data)).toBe(original);
  expect(mockReport.refetch).not.toHaveBeenCalled();
  fireEvent(screen.getByLabelText('Hide zero values'),'valueChange',false);
  expect(screen.getByLabelText('View Unused budget')).toBeTruthy();
  expect(screen.getByLabelText('Aug 2026: $0.00')).toBeTruthy();
});

test('trend plot geometry keeps every zero-valued period while only its value rows are filtered',()=>{
  mockParams.kind='trends';render(<ReportDetailScreen/>);
  const plot=screen.getByTestId('spending-trend-plot',{includeHiddenElements:true});
  fireEvent(plot,'layout',{nativeEvent:{layout:{width:300}}});
  const paths=plot.findAllByType(Path).map(path=>path.props.d);
  const circleCount=plot.findAllByType(Circle).length;
  fireEvent(screen.getByLabelText('Hide zero values'),'valueChange',true);
  expect(plot.findAllByType(Path).map(path=>path.props.d)).toEqual(paths);
  expect(plot.findAllByType(Circle)).toHaveLength(circleCount);
  expect(screen.getByText('Aug 2026 – Oct 2026')).toBeTruthy();
  expect(screen.queryByLabelText('Aug 2026: $0.00')).toBeNull();
});

test.each(['income','accounts'])('the shared Reports choice filters zero %s groups without discarding negative values or changing shares',kind=>{
  const field=kind==='income'?'sources':'accounts';
  mockReport.data[field].data!.push({key:'zero',id:null,name:'Zero group',archived:false,amount:0,count:2});
  if(kind==='accounts')mockReport.data.accounts.data!.push({key:'negative',id:null,name:'Refund balance',archived:true,amount:-1000,count:1});
  const main=render(<ReportsScreen/>);
  fireEvent(screen.getByLabelText('Hide zero values'),'valueChange',true);main.unmount();
  mockParams.kind=kind;render(<ReportDetailScreen/>);
  expect(screen.getByLabelText('Hide zero values').props.value).toBe(true);
  expect(screen.queryByLabelText('View Zero group history')).toBeNull();
  if(kind==='accounts')expect(screen.getByLabelText('View Refund balance history')).toBeTruthy();
  fireEvent(screen.getByLabelText('Hide zero values'),'valueChange',false);
  expect(screen.getByLabelText('View Zero group history')).toBeTruthy();
});

test('comparison retains unchanged nonzero spending and previous-only amounts while removing zero pairs',()=>{
  mockParams.kind='comparison';
  mockReport.data.comparison.data!.categories.push(
    {key:'zero',name:'Never spent',current:0,previous:0,delta:0},
    {key:'same',name:'Same spending',current:100,previous:100,delta:0},
    {key:'previous',name:'Previous spending',current:0,previous:100,delta:-100},
  );
  render(<ReportDetailScreen/>);expect(screen.getByText('Never spent')).toBeTruthy();
  fireEvent(screen.getByLabelText('Hide zero values'),'valueChange',true);
  expect(screen.queryByText('Never spent')).toBeNull();
  expect(screen.getByText('Same spending')).toBeTruthy();
  expect(screen.getByText('Previous spending')).toBeTruthy();
  expect(screen.getByText('Net cash flow')).toBeTruthy();
});

test('all-zero categories show filter recovery without claiming categories are missing',()=>{
  mockReport.data.categories.data=mockReport.data.categories.data!.filter(row=>row.key==='unused');
  render(<ReportsScreen/>);fireEvent(screen.getByLabelText('Hide zero values'),'valueChange',true);
  expect(screen.getByText('No nonzero category amounts. Turn off Hide zero values to show all categories.')).toBeTruthy();
  expect(screen.queryByText('Add Category')).toBeNull();
});

test('choice survives preference edits but resets to off on sign-out or account change',()=>{
  act(()=>usePreferencesStore.getState().setProfile(defaultProfile(owner)));
  act(()=>useReportDisplayStore.getState().setHideZeroValues(true));
  act(()=>usePreferencesStore.getState().setProfile({...defaultProfile(owner),display_name:'Updated'}));
  expect(useReportDisplayStore.getState().hideZeroValues).toBe(true);
  act(()=>usePreferencesStore.getState().setProfile(defaultProfile('other-owner')));
  expect(useReportDisplayStore.getState().hideZeroValues).toBe(false);
  act(()=>useReportDisplayStore.getState().setHideZeroValues(true));
  act(()=>usePreferencesStore.getState().setProfile(null));
  expect(useReportDisplayStore.getState().hideZeroValues).toBe(false);
});

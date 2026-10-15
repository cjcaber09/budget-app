let mockTransferSupported=false;
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({transferEntrySupported:mockTransferSupported})}));
import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {CsvExport} from '../../src/components/CsvExport';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
const mockRpc=jest.fn(),mockShare=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:any[])=>mockRpc(...args)}}));
jest.mock('../../src/lib/exportFiles',()=>({shareCsv:(...args:any[])=>mockShare(...args)}));
const owner='00000000-0000-4000-8000-000000000001',month='2026-10-01';
const tx={transaction_id:'tx',financial_date:'2026-10-02',type:'expense',amount:'100',category:'Groceries',search_category:'Groceries',payment_account_id:'cash',payment_account:'Cash',payment_type:'Cash',last_four:null,income_source:'',note:'weekly',spending_source:'manual'};
beforeEach(()=>{mockTransferSupported=false;jest.clearAllMocks();usePreferencesStore.setState({profile:defaultProfile(owner)});mockShare.mockResolvedValue(undefined);});
function response(data:any){mockRpc.mockReturnValue({abortSignal:()=>Promise.resolve({error:null,data})});}
test('transaction export previews the complete matching count before sharing',async()=>{
 response({owner,start:month,end:month,timezone:defaultProfile(owner).timezone,currency:'USD',generated_at:'2026-10-10T00:00:00Z',rows:[tx,{...tx,transaction_id:'income',type:'income'}]});
 render(<CsvExport kind="transactions" month={month} filter="expense" search="weekly"/>);fireEvent.press(screen.getByText('Export CSV'));fireEvent.press(screen.getByText('Prepare export'));await screen.findByText(/1 matching entries/);expect(mockShare).not.toHaveBeenCalled();fireEvent.press(screen.getByText('Share CSV'));await waitFor(()=>expect(mockShare).toHaveBeenCalled());expect(mockShare.mock.calls[0][0]).toContain('"1.00"');
});
test('changing month disqualifies a late export response',async()=>{
 let resolve:any;mockRpc.mockReturnValue({abortSignal:()=>new Promise(r=>{resolve=r;})});
 const view=render(<CsvExport kind="analysis" month={month}/>);fireEvent.press(screen.getByText('Export CSV'));fireEvent.press(screen.getByText('Export spending CSV'));view.rerender(<CsvExport kind="analysis" month="2026-09-01"/>);resolve({error:null,data:{}});await waitFor(()=>expect(screen.getByText('Export CSV')).toBeTruthy());expect(mockShare).not.toHaveBeenCalled();
});
test('failed preparation exposes retry without sharing a partial file',async()=>{
 mockRpc.mockReturnValue({abortSignal:()=>Promise.resolve({error:{code:'network'}})});render(<CsvExport kind="analysis" month={month}/>);fireEvent.press(screen.getByText('Export CSV'));fireEvent.press(screen.getByText('Export spending CSV'));await screen.findByText('Could not prepare the export. Check your connection and retry.');expect(mockShare).not.toHaveBeenCalled();
});
test('transfer export uses the complete filtered activity RPC and neutral accounting effects',async()=>{
 mockTransferSupported=true;
 response({owner,start:month,end:month,timezone:defaultProfile(owner).timezone,currency:'USD',generated_at:'2026-10-15T00:00:00Z',activityVersion:1,filter:'transfer',search:'atm',rows:[{...tx,transaction_id:owner,row_kind:'transfer',type:'transfer',amount:'200000',fee_amount:'1500',income_effect:'0',spending_effect:'0',source_account_id:'00000000-0000-4000-8000-000000000002',destination_account_id:'00000000-0000-4000-8000-000000000003',source_account:'Bank',destination_account:'Cash'}]});
 render(<CsvExport kind="transactions" month={month} filter="transfer" search=" ATM "/>);fireEvent.press(screen.getByText('Export CSV'));fireEvent.press(screen.getByText('Prepare export'));await screen.findByText(/1 matching entries/);
 expect(mockRpc).toHaveBeenCalledWith('activity_export_snapshot',{p_month:month,p_type:'transfer',p_search:'atm'});fireEvent.press(screen.getByText('Share CSV'));await waitFor(()=>expect(mockShare).toHaveBeenCalled());expect(mockShare.mock.calls[0][0]).toContain('"2000.00"');expect(mockShare.mock.calls[0][0]).toContain('"15.00","0.00","0.00"');
});

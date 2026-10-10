import {fireEvent,render,screen} from '@testing-library/react-native';
import {Text,Pressable} from 'react-native';
import {IncomeSourcePicker} from '../../src/components/IncomeSources';
import {TransactionForm} from '../../src/components/TransactionForm';
import {useIncomeSourceDraftStore} from '../../src/stores/useIncomeSourceDraftStore';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {owner,category} from '../../test-utils/report';
let mockQuery:any;const mockSave=jest.fn();
jest.mock('../../src/hooks/useIncomeSources',()=>({useIncomeSources:()=>mockQuery,useSaveIncomeSource:()=>({mutate:mockSave,isPending:false,isError:false})}));
beforeEach(()=>{jest.clearAllMocks();usePreferencesStore.setState({profile:defaultProfile(owner)});useIncomeSourceDraftStore.setState({drafts:{}});mockQuery={data:[{id:category,user_id:owner,name:'Salary',archived:true}],isPending:false,isError:false,refetch:jest.fn()};});
test('retains archived assignment through query failures and clears only explicitly',()=>{
 const onChange=jest.fn();const h=render(<IncomeSourcePicker value={category} onChange={onChange}/>);expect(screen.getByText('Salary · Archived')).toBeTruthy();mockQuery={...mockQuery,isError:true,error:new Error('Unavailable')};h.rerender(<IncomeSourcePicker value={category} onChange={onChange}/>);expect(onChange).not.toHaveBeenCalled();fireEvent.press(screen.getByLabelText('Choose income source'));expect(screen.getByText('Current source: Salary · Archived. It stays assigned unless you replace or clear it.')).toBeTruthy();fireEvent.press(screen.getByText('Unspecified · clear source'));expect(onChange).toHaveBeenCalledWith(null);
});
test('unconfirmed source creation reopens with the same identity and frozen payload',()=>{
 const onChange=jest.fn();render(<IncomeSourcePicker value={null} onChange={onChange}/>);fireEvent.press(screen.getByLabelText('Choose income source'));fireEvent.press(screen.getByText('Add income source'));fireEvent.changeText(screen.getByLabelText('Income source name'),'Freelance');fireEvent.press(screen.getByText('Create source'));const input=mockSave.mock.calls[0][0];expect(input).toEqual({id:expect.any(String),operation:'create',name:'Freelance'});fireEvent.press(screen.getByText('Close'));fireEvent.press(screen.getByText('Add income source'));expect(screen.getByLabelText('Income source name').props.value).toBe('Freelance');expect(screen.getByLabelText('Income source name').props.editable).toBe(false);fireEvent.press(screen.getByText('Retry save'));expect(mockSave.mock.calls[1][0]).toEqual(input);expect(onChange).not.toHaveBeenCalled();
});
test('late creation response after the picker closes cannot assign a source',()=>{
 const onChange=jest.fn();render(<IncomeSourcePicker value={null} onChange={onChange}/>);fireEvent.press(screen.getByLabelText('Choose income source'));fireEvent.press(screen.getByText('Add income source'));fireEvent.changeText(screen.getByLabelText('Income source name'),'Work');fireEvent.press(screen.getByText('Create source'));const callbacks=mockSave.mock.calls[0][1];fireEvent.press(screen.getByText('Close'));callbacks.onSuccess({id:category,user_id:owner,name:'Work',archived:false});expect(onChange).not.toHaveBeenCalled();
});
test('transaction source remains after failed submit and clears on conversion to expense',()=>{
 const submit=jest.fn();render(<TransactionForm categories={[]} initialValues={{type:'income',amount:'20',incomeSourceId:category}} onSubmit={submit} submitLabel="Save" incomeSourceControl={(id,change)=><Pressable onPress={()=>change(null)}><Text>{id??'Unspecified'}</Text></Pressable>}/>);fireEvent.press(screen.getByText('Save'));expect(submit).toHaveBeenCalledWith(expect.objectContaining({incomeSourceId:category}));expect(screen.getByText(category)).toBeTruthy();fireEvent.press(screen.getByText('Expense'));fireEvent.press(screen.getByText('Income'));expect(screen.getByText('Unspecified')).toBeTruthy();fireEvent.press(screen.getByText('Save'));expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({incomeSourceId:null}));
});

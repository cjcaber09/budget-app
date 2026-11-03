import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {TransactionForm} from '../../src/components/TransactionForm';
import {voicePurchaseDraft} from '../../src/domain/voicePurchases';
import type {VoiceProposal} from '../../supabase/functions/voice-entry/shared';
const category={id:'00000000-0000-4000-8000-000000000010',user_id:'owner',name:'Food',color:'#55816A',icon:'tag',is_default:true};
function fields(amount='60.00'){
 const p:VoiceProposal={intent:'entry',type:'expense',transcript:'Rice and eggs',amount:amount?'160.00':'',date:'2026-11-01',currency:'PHP',note:'',categoryId:category.id,paymentMethodId:null,incomeSourceId:null,unresolved:[],purchases:['Rice','Eggs'].map((label,i)=>({label,amount:i?amount:'100.00',priceNeedsReview:!amount&&!!i,quantity:null,unitPrice:null,date:null,currency:null,paymentMethod:null,categoryId:null,type:null}))};
 return voicePurchaseDraft(p)!;
}
function mount(amount='60.00'){
 const draft=fields(amount),save=jest.fn(),persist=jest.fn(),saveDraft=jest.fn();
 render(<TransactionForm categories={[category]} initialValues={draft} initialDraft={draft} summaryCurrency="PHP" persistInitial onDraftChange={persist} draftAction={{onSave:saveDraft,busy:false}} submitLabel="Save expense" onSubmit={save}/>);
 return {draft,save,persist,saveDraft};
}
function editPrice(amount:string){fireEvent.press(screen.getByLabelText('Edit row 2'));fireEvent.changeText(screen.getByLabelText('Row 2 amount'),amount);fireEvent.press(screen.getByLabelText('Save item'));}
test('one reviewed save contains every item and the computed amount and note',()=>{
 const {save}=mount();expect(screen.getByLabelText('Amount').props.editable).toBe(false);expect(screen.getByLabelText('Amount').props.value).toBe('160.00');
 fireEvent.press(screen.getByText('Save expense'));expect(save).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledWith(expect.objectContaining({amount:160,note:'Purchases: Rice, Eggs. Total PHP 160.00.',items:[expect.objectContaining({label:'Rice',amountCents:10000}),expect.objectContaining({label:'Eggs',amountCents:6000})]}));
});
test('keeps missing prices editable and blocks save without showing a partial total',()=>{
 const {save}=mount('');expect(screen.getByText('Total pending price review')).toBeTruthy();expect(screen.getByLabelText('Amount').props.value).toBe('');
 fireEvent.press(screen.getByText('Save expense'));expect(save).not.toHaveBeenCalled();
 editPrice('80');expect(screen.getByLabelText('Amount').props.value).toBe('180.00');fireEvent.press(screen.getByText('Save expense'));expect(save).toHaveBeenCalledWith(expect.objectContaining({amount:180}));
});
test('automatic notes follow committed and unfinished item edits, then preserve a manual override',async()=>{
 const {persist,saveDraft}=mount();
 fireEvent.press(screen.getByLabelText('Edit row 2'));fireEvent.changeText(screen.getByLabelText('Row 2 amount'),'80');
 await waitFor(()=>expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({note:'Purchases: Rice, Eggs. Total PHP 180.00.',voicePurchase:{noteMode:'auto'}})));
 fireEvent.press(screen.getByLabelText('Save item'));expect(screen.getByLabelText('Note').props.value).toContain('180.00');
 fireEvent.changeText(screen.getByLabelText('Note'),'Weekly groceries');editPrice('90');expect(screen.getByLabelText('Note').props.value).toBe('Weekly groceries');
 fireEvent.press(screen.getByText('Save draft'));expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({note:'Weekly groceries',voicePurchase:{noteMode:'manual'},amount:'190.00'}));
});
test('deleting the last purchase clears stale amounts and automatic notes',()=>{
 const {save}=mount();
 for(let i=0;i<2;i++){fireEvent.press(screen.getByLabelText('Edit row 1'));fireEvent.press(screen.getByLabelText('Remove row 1'));}
 expect(screen.getByLabelText('Amount').props.value).toBe('');expect(screen.getByLabelText('Note').props.value).toBe('');
 fireEvent.press(screen.getByText('Save expense'));expect(save).not.toHaveBeenCalled();
});
test('income conversion preserves the prior summary as editable manual text',()=>{
 const {saveDraft}=mount();fireEvent.press(screen.getByText('Income'));fireEvent.changeText(screen.getByLabelText('Note'),'Sales income');
 fireEvent.press(screen.getByText('Save draft'));expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({type:'income',note:'Sales income',voicePurchase:{noteMode:'manual'}}));
});
test('explicitly free voice items remain visible for review',()=>{
 mount('0.00');expect(screen.getByLabelText('Edit row 2')).toBeTruthy();expect(screen.getByLabelText('Amount').props.value).toBe('100.00');
});

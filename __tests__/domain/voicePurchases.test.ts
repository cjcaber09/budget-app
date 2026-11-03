import {validateVoiceProposal,voiceFingerprintInput,type VoicePurchase,type VoiceProposal} from '../../supabase/functions/voice-entry/shared';
import {voicePurchaseDraft,voicePurchaseSummary} from '../../src/domain/voicePurchases';
import {decodeTransactionDraft,type TransactionDraft} from '../../src/domain/transactionDraft';
const category='00000000-0000-4000-8000-000000000010',method='00000000-0000-4000-8000-000000000020';
const choices={categories:[{id:category,name:'Food'}],methods:[{id:method,name:'GCash'}],sources:[]};
const item=(label='Rice',amount='100.00'):VoicePurchase=>({label,amount,priceNeedsReview:false,quantity:null,unitPrice:null,date:null,currency:null,paymentMethod:null,categoryId:null,type:null});
const proposal=(purchases=[item(),item('Eggs','60.00')]):VoiceProposal=>({intent:'entry',type:'expense',transcript:'Rice one hundred, eggs sixty.',amount:'',date:'2026-11-01',currency:'PHP',note:'Purchases',categoryId:category,paymentMethodId:null,incomeSourceId:null,unresolved:[],purchases,groupingIssue:null});
const validate=(p:VoiceProposal)=>validateVoiceProposal(p,choices,'2026-11-01','PHP',2);
test('computes an exact total and hands off every ordered purchase',()=>{
 const normalized=validate(proposal([item('Coffee','0.10'),item('Tea','0.20')]));expect(normalized.amount).toBe('0.30');
 const draft=voicePurchaseDraft(normalized)!;expect(draft.drafts.map(r=>r.label)).toEqual(['Coffee','Tea']);expect(draft.note).toBe('Purchases: Coffee, Tea. Total PHP 0.30.');expect(new Set(draft.drafts.map(r=>r.id)).size).toBe(2);
});
test('missing prices remain blank through both validation passes and encrypted recovery',()=>{
 const once=validate(proposal([item(),item('Bread','')])),twice=validate(once);
 expect(twice.amount).toBe('');expect(twice.purchases![1].amount).toBe('');
 const fields=voicePurchaseDraft(twice)!;
 const draft:TransactionDraft={version:1,owner:category,id:method,startedAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',day:'2026-11-01',currency:'PHP',timezone:'UTC',fields};
 const restored=decodeTransactionDraft(JSON.stringify(draft),category);expect(restored.fields.voicePurchase?.noteMode).toBe('auto');expect(restored.fields.drafts[1].amount).toBe('');expect(restored.fields.note).toContain('Total pending price review.');
 fields.voicePurchase!.noteMode='manual';fields.note='My own note';expect(decodeTransactionDraft(JSON.stringify(draft),category).fields.note).toBe('My own note');
});
test('explicit quantities use exact rounding and conflicting prices stay unresolved',()=>{
 const purchase={...item('Coffee',''),quantity:'2',unitPrice:'50.00'};
 expect(validate(proposal([purchase])).amount).toBe('100.00');
 expect(validate(proposal([{...purchase,quantity:'0.125',unitPrice:'0.04'}])).amount).toBe('0.01');
 const conflict=validate(proposal([{...purchase,amount:'50.00'}]));expect(conflict.purchases![0].amount).toBe('');expect(validate(conflict).purchases![0].amount).toBe('');
 const ambiguous=validate(proposal([{...purchase,priceNeedsReview:true}]));expect(validate(ambiguous).amount).toBe('');
});
test.each([
 [{...item(),date:'2026-10-31'},{...item(),date:'2026-11-01'}],
 [{...item(),paymentMethod:'Cash'},{...item(),paymentMethod:method}],
 [{...item(),paymentMethod:'Unknown wallet A'},{...item(),paymentMethod:'Unknown wallet B'}],
 [{...item(),currency:'USD'},item()],
 [{...item(),type:'income' as const},item()],
])('incompatible context cannot produce a partial grouped expense (%#)',(...rows)=>{
 const result=validate(proposal(rows));expect(result.intent).toBe('multiple');expect(result.groupingIssue).toBe('incompatible_context');expect(result.purchases).toEqual([]);expect(voicePurchaseDraft(result)).toBeNull();
});
test('requires account review for a spoken unmatched method and category choice for mixed categories',()=>{
 const result=validate(proposal([{...item(),paymentMethod:'Unknown wallet',categoryId:category},{...item(),categoryId:method}]));
 expect(result.categoryId).toBeNull();expect(result.reviewFields).toContain('paymentMethod');expect(voicePurchaseDraft(result)?.reviewRequired?.paymentMethod).toBe(true);
 expect(validate(result).categoryId).toBeNull();
 expect(result.purchases!.every(p=>p.categoryId===null||p.categoryId===category)).toBe(true);
});
test('never silently accepts overflow, malformed rows, truncated output or unsupported adjustments',()=>{
 expect(()=>validate(proposal(Array.from({length:21},()=>item())))).toThrow();
 expect(()=>validate(proposal([{...item(),label:'x'.repeat(201)}]))).toThrow();
 expect(()=>validate({...proposal(),purchases:undefined})).toThrow();
 const result=validate({...proposal(),groupingIssue:'unsupported_adjustment'});expect(result.intent).toBe('unclear');expect(result.purchases).toEqual([]);
});
test('free rows are distinct from unknown prices and totals cannot exceed the transaction limit',()=>{
 expect(validate(proposal([item('Free sample','0.00'),item()])).amount).toBe('100.00');
 expect(validate(proposal([item('A','9999999999.99'),item('B','0.01')])).amount).toBe('');
});
test('mismatched spoken totals warn without creating adjustments; notes stay bounded',()=>{
 const result=validate({...proposal(),amount:'999.00'});expect(result.amount).toBe('160.00');expect(result.unresolved.join(' ')).toContain('Spoken total differs');expect(result.purchases).toHaveLength(2);
 const fields=voicePurchaseDraft(validate(proposal(Array.from({length:20},()=>item('x'.repeat(200),'1.00')))))!;
 expect(fields.note.length).toBeLessThanOrEqual(1000);expect(fields.note).toContain('more items');expect(fields.note).toContain('Total PHP 20.00');expect(voicePurchaseSummary([],'PHP')).toBe('');
});
test('version one remains unchanged and version two changes deduplication identity',()=>{
 const legacy={...proposal(),amount:'20.00'};delete legacy.purchases;delete legacy.groupingIssue;
 expect(validateVoiceProposal(legacy,choices,'2026-11-01','PHP')).toEqual(legacy);
 expect(voiceFingerprintInput('id','context','hash',1)).toBe('id:context:hash');expect(voiceFingerprintInput('id','context','hash',2)).not.toBe(voiceFingerprintInput('id','context','hash',1));
});
test('pending save summaries must be frozen and malformed summary metadata is rejected',()=>{
 const fields=voicePurchaseDraft(validate(proposal()))!;
 const draft:TransactionDraft={version:1,owner:category,id:method,startedAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',day:'2026-11-01',currency:'PHP',timezone:'UTC',fields,
  pending:{id:method,type:'expense',categoryId:category,amount:160,note:fields.note,transactionDate:'2026-11-01',occurredAt:'2026-11-01T00:00:00Z',paymentMethodId:null,incomeSourceId:null,paymentDetails:null,items:fields.drafts.map(r=>({kind:'item',label:r.label,amountCents:Number(r.amount)*100,quantity:null,unitPriceCents:null,taxIncluded:false}))}};
 expect(()=>decodeTransactionDraft(JSON.stringify(draft),category)).toThrow(/summary/);
 fields.voicePurchase={noteMode:'manual'};expect(decodeTransactionDraft(JSON.stringify(draft),category).pending).toEqual(draft.pending);
 expect(()=>decodeTransactionDraft(JSON.stringify({...draft,pending:undefined,fields:{...fields,voicePurchase:false}}),category)).toThrow(/summary/);
});

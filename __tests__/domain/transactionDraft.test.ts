import {decodeTransactionDraft,type TransactionDraft} from '../../src/domain/transactionDraft';
import {draftItem} from '../../src/domain/itemDrafts';
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
export const draft=():TransactionDraft=>({version:1,owner,id,updatedAt:'2026-10-13T00:00:00Z',startedAt:'2026-10-13T00:00:00Z',day:'2026-10-13',timezone:'Asia/Manila',currency:'PHP',fields:{type:'income',amount:'12.',note:'Unfinished',categoryId:'',paymentMethodId:null,incomeSourceId:null,transactionDate:'2026-10-13',drafts:[{...draftItem(),label:'',amount:''}]}});
test('incomplete item text survives but unknown properties are discarded',()=>{
 const value:any=draft();value.password='forbidden';value.fields.recoveryCode='forbidden';
 const saved=decodeTransactionDraft(JSON.stringify(value),owner);expect(saved.fields.drafts[0].amount).toBe('');expect(JSON.stringify(saved)).not.toContain('forbidden');
});
test('cross-owner, invalid dates, schema changes and oversized drafts fail closed',()=>{
 expect(()=>decodeTransactionDraft(JSON.stringify(draft()),id)).toThrow();
 for(const value of [{...draft(),version:2},{...draft(),fields:{...draft().fields,transactionDate:'bad'}}])expect(()=>decodeTransactionDraft(JSON.stringify(value),owner)).toThrow();
 expect(()=>decodeTransactionDraft(' '.repeat(256001),owner)).toThrow();
});
test('pending request identity and exact financial values survive',()=>{
 const value=draft();value.fields={...value.fields,amount:'12.50',drafts:[]};value.pending={id,type:'income',amount:12.5,note:'Unfinished',categoryId:null,occurredAt:value.startedAt,transactionDate:value.day,paymentMethodId:null,incomeSourceId:null,paymentDetails:null,items:[]};
 expect(decodeTransactionDraft(JSON.stringify(value),owner).pending).toEqual(value.pending);
 expect(()=>decodeTransactionDraft(JSON.stringify({...value,pending:{...value.pending,id:owner}}),owner)).toThrow();
});

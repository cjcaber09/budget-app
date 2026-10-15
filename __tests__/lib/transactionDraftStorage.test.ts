import AsyncStorage from '@react-native-async-storage/async-storage';
import {saveTransactionDraft,loadTransactionDraft,clearTransactionDraft,transactionDraftGeneration,settleTransactionDraftWrites} from '../../src/lib/transactionDraftStorage';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import type {TransactionDraft} from '../../src/domain/transactionDraft';
const owner='00000000-0000-4000-8000-000000000001';
const id='00000000-0000-4000-8000-000000000002';
const draft=(draftId=id):TransactionDraft=>({version:1,owner,id:draftId,updatedAt:'2026-10-13T00:00:00Z',startedAt:'2026-10-13T00:00:00Z',day:'2026-10-13',timezone:'UTC',currency:'USD',fields:{type:'income',amount:'12',note:'Draft',categoryId:'',paymentMethodId:null,incomeSourceId:null,transactionDate:'2026-10-13',drafts:[]}});
beforeEach(async()=>{await clearTransactionDraft(owner);await AsyncStorage.clear();usePreferencesStore.getState().setProfile(defaultProfile(owner));});
test('survives a reload and rejects other-owner writes',async()=>{
 await saveTransactionDraft(draft());expect((await loadTransactionDraft(owner))?.fields.note).toBe('Draft');
 usePreferencesStore.getState().setProfile(defaultProfile('another-owner'));
 await expect(saveTransactionDraft(draft())).rejects.toThrow();expect(await loadTransactionDraft('another-owner')).toBeNull();
});
test('clearing invalidates late writes from an old form session',async()=>{
 const lease=transactionDraftGeneration(owner);await saveTransactionDraft(draft(),lease);await clearTransactionDraft(owner);
 await expect(saveTransactionDraft(draft(),lease)).rejects.toThrow();expect(await loadTransactionDraft(owner)).toBeNull();
});
test('a late successful old transaction cannot erase a newer draft or cancel its queued edits',async()=>{
 const lease=transactionDraftGeneration(owner),newer=draft('00000000-0000-4000-8000-000000000003');
 await saveTransactionDraft(newer,lease);const clearing=clearTransactionDraft(owner,id);const editing=saveTransactionDraft({...newer,fields:{...newer.fields,note:'Newer edit'}},lease);
 await Promise.all([clearing,editing]);expect((await loadTransactionDraft(owner))?.fields.note).toBe('Newer edit');
});
test('storage failure is reported and preserves the prior draft',async()=>{
 await saveTransactionDraft(draft());jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Full storage'));
 await expect(saveTransactionDraft({...draft(),fields:{...draft().fields,note:'Failed'}})).rejects.toThrow('Full storage');
 expect((await loadTransactionDraft(owner))?.fields.note).toBe('Draft');
});

test('restart waits for queued draft edits to reach storage',async()=>{
 let write!:()=>void;const set=jest.mocked(AsyncStorage.setItem);
 set.mockImplementationOnce(()=>new Promise<void>(resolve=>{write=resolve;}));
 const first=saveTransactionDraft(draft());let settled=false;
 const finishing=settleTransactionDraftWrites().then(()=>{settled=true;});
 await Promise.resolve();await Promise.resolve();expect(settled).toBe(false);
 const final=saveTransactionDraft({...draft(),fields:{...draft().fields,note:'Last queued edit'}});
 write();await Promise.all([first,final,finishing]);expect(settled).toBe(true);expect((await loadTransactionDraft(owner))?.fields.note).toBe('Last queued edit');
});

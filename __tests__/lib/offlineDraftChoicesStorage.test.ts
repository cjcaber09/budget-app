import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadOfflineDraftChoices,saveOfflineDraftChoices,clearOfflineDraftChoices,offlineChoicesGeneration} from '../../src/lib/offlineDraftChoicesStorage';
import {decodeOfflineDraftChoices,type OfflineDraftChoices} from '../../src/domain/offlineDraftChoices';
import {manualDraftSelectionError} from '../../src/domain/manualDraftReview';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
import type {AddTransactionInput} from '../../src/hooks/useTransactions';

const owner='00000000-0000-4000-8000-000000000001',category='00000000-0000-4000-8000-000000000010',cash='00000000-0000-4000-8000-000000000201';
const fixture=():OfflineDraftChoices=>({version:1,owner,savedAt:new Date().toISOString(),currency:'PHP',timezone:'Asia/Manila',categories:[{id:category,user_id:owner,name:'Food',color:'#123456',icon:'tag',is_default:true}],methods:[{id:cash,user_id:owner,method:'cash',name:'Cash',payment_type:'Cash',last_four:null,archived:false}],sources:[]});
beforeEach(async()=>{await AsyncStorage.clear();usePreferencesStore.getState().setProfile(defaultProfile(owner));});

test('persists owner choices and strips balances, files and unexpected fields',async()=>{
  const data=fixture();Object.assign(data.methods[0],{balance:'9999.99',opening_balance:'2000.00',wallet_account_number:'09123456789'});Object.assign(data,{access_token:'must not persist'});
  await saveOfflineDraftChoices(data);const restored=await loadOfflineDraftChoices(owner);
  expect(restored).toEqual({...fixture(),savedAt:data.savedAt});
  expect(JSON.stringify(restored)).not.toMatch(/balance|access_token|opening_balance|wallet_account_number|09123456789/);
});

test('invalid or foreign cached rows are rejected rather than exposed',()=>{
  const data=fixture();data.categories[0].user_id=cash;
  expect(()=>decodeOfflineDraftChoices(JSON.stringify(data),owner)).toThrow();
  expect(()=>decodeOfflineDraftChoices(JSON.stringify(fixture()),cash)).toThrow();
  expect(()=>decodeOfflineDraftChoices('{bad json',owner)).toThrow();
});

test('reset invalidates late writes, including a same-owner session',async()=>{
  const data=fixture(),generation=offlineChoicesGeneration(owner);
  await saveOfflineDraftChoices(data,generation);await clearOfflineDraftChoices(owner);
  await saveOfflineDraftChoices(data,generation);expect(await loadOfflineDraftChoices(owner)).toBeNull();
});

test('account switching cannot write another owner cache',async()=>{
  usePreferencesStore.getState().setProfile(defaultProfile(cash));
  await saveOfflineDraftChoices(fixture());expect(await loadOfflineDraftChoices(owner)).toBeNull();
});

test('a failed cache write preserves the earlier saved snapshot',async()=>{
  const data=fixture();await saveOfflineDraftChoices(data);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Disk full'));
  await expect(saveOfflineDraftChoices({...data,currency:'USD'})).rejects.toThrow('Disk full');
  expect((await loadOfflineDraftChoices(owner))?.currency).toBe('PHP');
});

test('online review rejects missing categories, archived methods and foreign sources',()=>{
  const data=fixture();const input={type:'expense',categoryId:category,paymentMethodId:null} as AddTransactionInput;
  expect(manualDraftSelectionError(input,owner,data.categories,data.methods,[])).toBeNull();
  expect(manualDraftSelectionError(input,owner,[],data.methods,[])).toMatch(/category/);
  expect(manualDraftSelectionError(input,owner,data.categories,[{...data.methods[0],archived:true}],[])).toMatch(/payment method/);
  expect(manualDraftSelectionError({...input,type:'income',incomeSourceId:cash},owner,data.categories,data.methods,[{id:cash,user_id:owner,name:'Old source',archived:true}])).toMatch(/income source/);
  expect(manualDraftSelectionError(input,owner,data.categories,data.methods,[{id:cash,user_id:cash,name:'Foreign',archived:false}])).toMatch(/verify/);
});
test('preserves a valid date preference and rejects unsupported cached formats',()=>{
 const data={...fixture(),dateFormat:'dmy' as const};
 expect(decodeOfflineDraftChoices(JSON.stringify(data),owner).dateFormat).toBe('dmy');
 expect(()=>decodeOfflineDraftChoices(JSON.stringify({...data,dateFormat:'unsupported'}),owner)).toThrow();
});

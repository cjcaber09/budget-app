import {accountBalance,accountGradient,ACCOUNT_GRADIENTS,deckAccounts,nextAccountId,orderedAccounts,survivingAccountId} from '../src/domain/overviewAccounts';
import type {PaymentMethod} from '../src/domain/paymentMethods';
const method=(id:string,extra:Partial<PaymentMethod>={}):PaymentMethod=>({id,user_id:'owner',name:id,method:'bank_account',payment_type:'Savings account',last_four:null,opening_balance:'0.00',baseline_at:null,archived:false,balance:'1.00',has_activity:true,related_bills:[],...extra});
test('balances accept aggregates above the individual cap and reject unsafe cents',()=>{
 expect(accountBalance(method('a',{balance:'10000000000.01'}))).toEqual({label:'Current balance',cents:1000000000001,state:'ready'});
 expect(accountBalance(method('a',{balance:'90071992547409.92'})).state).toBe('invalid');
 expect(accountBalance(method('a',{balance:null})).label).toBe('Balance not set');
});
test.each([['-10.25','Amount owed',1025],['0.00','Amount owed',0],['2.50','Credit balance',250]])('credit %s has truthful semantics',(balance,label,cents)=>{
 expect(accountBalance(method('a',{balance,method:'card',payment_type:'Credit card'}))).toMatchObject({label,cents});
});
test('Cash first, then stable names and ids, excludes archives and other owners',()=>{
 expect(orderedAccounts([method('z'),method('cash',{method:'cash',name:'Cash'}),method('b',{name:'Alpha'}),method('a',{name:'alpha'}),method('hidden',{archived:true}),method('foreign',{user_id:'other'})],'owner').map(m=>m.id)).toEqual(['cash','a','b','z']);
});
test('cycling wraps and removal chooses the next surviving identity',()=>{
 const ids=['a','b','c'];expect(nextAccountId(ids,'a',-1)).toBe('c');expect(nextAccountId(ids,'c',1)).toBe('a');expect(nextAccountId([],'a',1)).toBeUndefined();
 expect(survivingAccountId(['a','c'],ids,'b')).toBe('c');expect(survivingAccountId(['a','b','c'],ids,'b')).toBe('b');
});
test.each([1,2,3,8])('a %i-account deck shows at most four distinct cards',count=>{
 const accounts=Array.from({length:count},(_,i)=>method(String(i))),visible=deckAccounts(accounts,'0');
 expect(visible).toHaveLength(Math.min(4,count));expect(new Set(visible.map(r=>r.method.id)).size).toBe(visible.length);
});
test('account gradients stay stable and have readable white foregrounds',()=>{
 expect(accountGradient(method('a'))).toEqual(accountGradient(method('a',{name:'Renamed',balance:'20.00'})));
 const luminance=(hex:string)=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;};
 for(const palette of ACCOUNT_GRADIENTS)for(const color of palette)expect(1.05/(luminance(color)+.05)).toBeGreaterThanOrEqual(4.5);
});

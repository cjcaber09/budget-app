import {validatePaymentMethod,paymentMethodLabel,isCreditCard,type PaymentMethodValues} from '../../src/domain/paymentMethods';
const base:PaymentMethodValues={id:'id',method:'card',paymentType:'Debit card',name:'Metrobank',lastFour:'',openingBalance:'40300.50'};
test.each(['','NaN','Infinity','1e3','0.001','10000000000.00'])('rejects invalid required balance %s',openingBalance=>expect(validatePaymentMethod({...base,openingBalance})).toBeTruthy());
test.each(['803','80355','1234567890123456','８０３５'])('rejects invalid last digits %s',lastFour=>expect(validatePaymentMethod({...base,lastFour})).toBeTruthy());
test('zero and negative funds balances are valid; credit debt is nonnegative',()=>{expect(validatePaymentMethod({...base,openingBalance:'0'})).toBeNull();expect(validatePaymentMethod({...base,openingBalance:'-50'})).toBeNull();expect(validatePaymentMethod({...base,paymentType:'Credit card',openingBalance:'-50'})).toBeTruthy();});
test('full numbers cannot be hidden in name or type',()=>{expect(validatePaymentMethod({...base,name:'1234 5678 9012 3456'})).toBeTruthy();expect(validatePaymentMethod({...base,paymentType:'1234567890123456'})).toBeTruthy();});
test('label includes only optional last four and funding kind is explicit',()=>{expect(paymentMethodLabel({name:'Metrobank',payment_type:'Debit card',last_four:'8035'})).toContain('****8035');expect(isCreditCard({method:'card',payment_type:'Credit card'})).toBe(true);});

test.each(['','09123456789','+639123456789'])('optional wallet number preserves valid text %s',walletAccountNumber=>{
 expect(validatePaymentMethod({...base,method:'wallet',paymentType:'E-wallet',walletAccountNumber})).toBeNull();
});
test.each(['1234','123456789012345678901','\uff11\uff12\uff13\uff14\uff15','123 456','123abc'])('rejects invalid wallet identifier %s',walletAccountNumber=>{
 expect(validatePaymentMethod({...base,method:'wallet',paymentType:'E-wallet',walletAccountNumber})).toMatch(/e-wallet account number/);
});
test('wallet identifiers are masked in labels and are not permitted on cards',()=>{
 const value={method:'wallet' as const,name:'Wallet',payment_type:'E-wallet',last_four:null,wallet_account_number:'09123456789'};
 expect(paymentMethodLabel(value)).toBe('Wallet · E-wallet · ****6789');expect(paymentMethodLabel(value)).not.toContain('09123456789');
 expect(validatePaymentMethod({...base,walletAccountNumber:'09123456789'})).toBeTruthy();
});

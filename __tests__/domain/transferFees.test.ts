import {transferAmounts,transferEnteredAmount} from '../../src/domain/transferFees';

test('added and deducted fees conserve money, with only the fee leaving accounts',()=>{
 expect(transferAmounts('1000','15','added')).toEqual({entered:100000,fee:1500,received:100000,deducted:101500});
 expect(transferAmounts('1000','15','deducted')).toEqual({entered:100000,fee:1500,received:98500,deducted:100000});
});
test('reopening deducted transfers reconstructs input without charging twice',()=>{
 const entered=transferEnteredAmount('985.00','15.00','deducted');
 expect(entered).toBe('1000.00');expect(transferAmounts(entered,'15.00','deducted')?.received).toBe(98500);
 expect(transferEnteredAmount('1000.00','15.00','added')).toBe('1000.00');
});
test.each([['10','10','deducted'],['10','11','deducted'],['10','-1','added'],['0','0','added'],['10','1.001','added'],['9999999999.99','0.01','added']] as const)('rejects invalid or overflowing transfer %s + fee %s', (amount,fee,mode)=>{
 expect(transferAmounts(amount,fee,mode)).toBeNull();
});
test('zero fees and cent fractions stay exact',()=>{
 expect(transferAmounts('0.10','0.20','added')?.deducted).toBe(30);
 expect(transferAmounts('1000','','deducted')).toEqual({entered:100000,fee:0,received:100000,deducted:100000});
});

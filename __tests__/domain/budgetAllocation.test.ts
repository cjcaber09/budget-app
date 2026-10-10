import {allocationCapacity,allocationError} from '../../src/domain/budgetAllocation';
test('combined allocations may equal the allowance but not exceed it',()=>{
 expect(allocationError(4000,3000,9000,10000)).toBeNull();
 expect(allocationError(4001,3000,9000,10000)).toMatch(/cannot exceed/);
 expect(allocationCapacity(3000,9000,10000)).toBe(4000);
});
test('missing and zero allowances cannot accept positive new budgets',()=>{
 expect(allocationError(1,0,0,null)).toMatch(/Set a monthly allowance/);
 expect(allocationError(1,0,0,0)).toMatch(/cannot exceed/);
 expect(allocationError(0,0,0,null)).toBeNull();
});
test('legacy excess can be reduced until allocations comply',()=>{
 expect(allocationError(5000,6000,13000,10000)).toBeNull();
 expect(allocationError(6000,6000,13000,10000)).toMatch(/cannot exceed/);
 expect(allocationError(5000,6000,13000,null)).toBeNull();
});

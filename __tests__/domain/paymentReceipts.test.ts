import { reconcileReceipt, receiptForClient, receiptTarget, validateCachedReceipt, sumItemCents, type ExtractedReceipt } from '../../supabase/functions/ocr/shared';
import { effectiveDate, localDateKey, localMonthRange, occurrenceForDate } from '../../src/domain/transactionDates';
export function paymentFixture(changes:Partial<ExtractedReceipt>={}):ExtractedReceipt {
  return { merchant:null,text:'Transfer received',items:[],deductions:[],taxes:[],fees:[],total:null,
    transactionType:'income',documentKind:'transfer',paymentStatus:'completed',classificationReason:'Transfer received',ownAccountTransfer:false,
    paymentDetails:{documentKind:'transfer',fromName:'Juan Dela Cruz',fromNumber:'0912 *** 0042',fromNumberType:'phone',reference:'00001234'},
    paymentSummary:{label:'Transfer received',amount:1000,basis:'principal'},principal:1000,netReceived:1000,totalDebited:null,
    receiptDate:'2026-09-01',receiptDateRaw:'September 1, 2026',...changes };
}
it('keeps sender strings and equal payment/total without duplicate money',()=>{
  const receipt=reconcileReceipt(paymentFixture());
  expect(receipt.schemaVersion).toBe(2); expect(receipt.computedTotalCents).toBe(100000);
  expect(receipt.rows).toHaveLength(1); expect(receipt.rows[0].isPaymentSummary).toBe(true);
  expect(receipt.paymentDetails?.fromNumber).toBe('0912 *** 0042');
});
it('counts only recipient fees for income and supports negative printed charges',()=>{
  const receipt=reconcileReceipt(paymentFixture({netReceived:990,fees:[{label:'Recipient fee',amount:-10,chargedTo:'recipient',alreadyReflected:false},{label:'Sender fee',amount:5,chargedTo:'sender',alreadyReflected:false}]}));
  expect(receipt.computedTotalCents).toBe(99000); expect(receipt.matchesTotal).toBe(true);
  expect(receipt.rows[2].affectsTotal).toBe(false);
});
it('does not subtract fees again from a net summary',()=>{
  const receipt=reconcileReceipt(paymentFixture({paymentSummary:{label:'Credited',amount:990,basis:'net'},principal:null,netReceived:990,fees:[{label:'Deducted fee',amount:10,chargedTo:'recipient',alreadyReflected:true}]}));
  expect(receipt.computedTotalCents).toBe(99000); expect(receipt.rows[1].affectsTotal).toBe(false);
});
it('retains salary detail while linking and counting its net payment once',()=>{
  const receipt=reconcileReceipt(paymentFixture({documentKind:'salary',paymentSummary:{label:'Net salary',amount:900,basis:'net'},netReceived:900,items:[{name:'Basic salary',amount:1000}],deductions:[{label:'Withholding',amount:100}]}));
  expect(receipt.rows).toHaveLength(3);
  expect(receipt.rows[0]).toMatchObject({isPaymentSummary:true,amountCents:90000,affectsTotal:true});
  expect(receipt.rows.slice(1).every(row=>row.affectsTotal===false)).toBe(true);
  expect(receipt.computedTotalCents).toBe(90000);
});
it('counts a signed debit positively, adds sender fees, and never reconciles against principal',()=>{
  const receipt=reconcileReceipt(paymentFixture({transactionType:'expense',paymentSummary:{label:'Sent',amount:-1000,basis:'principal'},netReceived:null,totalDebited:null,fees:[{label:'Sender fee',amount:10,chargedTo:'sender',alreadyReflected:false}]}));
  expect(receipt.computedTotalCents).toBe(101000); expect(receipt.rows[0].amountCents).toBe(100000);
  expect(receiptTarget(receipt,'expense')).toBeNull(); expect(receipt.matchesTotal).toBeNull();
});
test.each(['unknown','pending','failed'] as const)('does not establish a completed total for status %s',status=>{
  const receipt=reconcileReceipt(paymentFixture({paymentStatus:status}));
  expect(receipt.transactionType).toBe('unknown'); expect(receipt.computedTotalCents).toBeNull(); expect(receipt.rows).toHaveLength(0);
});
it('keeps own-account transfers and conflicting direction uncertain',()=>{
  expect(reconcileReceipt(paymentFixture({ownAccountTransfer:true})).transactionType).toBe('unknown');
  expect(reconcileReceipt(paymentFixture({paymentSummary:{label:'Debit',amount:-1000,basis:'principal'}})).transactionType).toBe('unknown');
});
it('requires a choice for fees with unknown ownership',()=>{
  const receipt=reconcileReceipt(paymentFixture({fees:[{label:'Fee',amount:10,chargedTo:'unknown',alreadyReflected:false}]}));
  expect(receipt.rows[1].requiresCountingReview).toBe(true); expect(receipt.rows[1].affectsTotal).toBe(false);
});
it('validates caches and projects only safe legacy purchase responses',()=>{
  const receipt=reconcileReceipt(paymentFixture());
  expect(validateCachedReceipt({...receipt,computedTotalCents:900})).toMatchObject({computedTotalCents:100000});
  expect(validateCachedReceipt({...receipt,paymentDetails:{fromNumber:912}})).toBeNull();
  expect(receiptForClient(receipt,1)).toBeNull();
  const legacy=reconcileReceipt({merchant:'Shop',text:'Total',items:[{name:'Bread',amount:10}],deductions:[],taxes:[],fees:[],total:10});
  expect(receiptForClient(legacy,2)).toMatchObject({schemaVersion:2,transactionType:'unknown',receiptDate:null,computedTotalCents:null});
});
it('rejects ambiguous or incomplete receipt dates and accepts explicit complete dates',()=>{
  expect(reconcileReceipt(paymentFixture({receiptDate:'2026-03-04',receiptDateRaw:'03/04/2026'})).receiptDate).toBeNull();
  expect(reconcileReceipt(paymentFixture({receiptDate:'2026-03-04',receiptDateRaw:'03/04'})).receiptDate).toBeNull();
  expect(reconcileReceipt(paymentFixture({receiptDate:'2026-02-30',receiptDateRaw:'February 30, 2026'})).receiptDate).toBeNull();
  expect(reconcileReceipt(paymentFixture({receiptDate:'2024-02-29',receiptDateRaw:'February 29, 2024'})).receiptDate).toBe('2024-02-29');
});
it('stores calendar dates independently from timestamps and retains scan time for its own day',()=>{
  const scan=new Date(2026,9,7,23,59,59).toISOString(); const day=localDateKey(new Date(scan));
  expect(occurrenceForDate(day,scan)).toBe(scan);
  expect(effectiveDate({transaction_date:'2026-09-01',occurred_at:scan})).toBe('2026-09-01');
  expect(localMonthRange('2026-09-01').startDay).toBe('2026-09-01');
  expect(()=>occurrenceForDate('2026-02-30',scan)).toThrow();
});
it('matches the SQL formula for all row kinds and explicit exclusions',()=>{
  const rows=reconcileReceipt(paymentFixture({items:[{name:'Gross salary',amount:1000}],paymentSummary:null,deductions:[{label:'Deduction',amount:10}],taxes:[{label:'Withheld',amount:20,included:false}],fees:[{label:'Fee',amount:5,chargedTo:'recipient'}]})).rows;
  expect(sumItemCents(rows,'income')).toBe(96500);
});

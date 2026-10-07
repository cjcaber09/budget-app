import { decimalToCents, centsToDecimal, reconcileReceipt, sumItemCents, validateCachedReceipt, type ExtractedReceipt } from '../../supabase/functions/ocr/shared';
import { draftItem, parseItemDrafts } from '../../src/domain/itemDrafts';
const receipt = (changes: Partial<ExtractedReceipt> = {}): ExtractedReceipt => ({ merchant: 'Shop', text: 'Receipt', items: [], deductions: [], taxes: [], fees: [], total: null, ...changes });
describe('receipt money', () => {
  test.each([['1.005',101],['-1.005',-101],['0.004',0],['5e-3',1],['1.005e2',10050],['1e-4',0],['9999999999.99',999999999999]])('%s rounds to %s cents', (input, expected) => expect(decimalToCents(input)).toBe(expected));
  test.each(['NaN','Infinity','1e999','10000000000','hello'])('rejects %s', input => expect(decimalToCents(input)).toBeNull());
  it('formats cents without floating point transport', () => expect(centsToDecimal(-101)).toBe('-1.01'));
  it('uses printed line amounts, included tax, deductions, fees and signed adjustments', () => {
    const result = reconcileReceipt(receipt({ items: [{ name: 'Bread', amount: 10, quantity: 2, unitPrice: 3 }],
      deductions: [{ label: 'Coupon', amount: 1 }], taxes: [{ label: 'VAT', amount: 2, included: true }, { label: 'Tax', amount: .5, included: false }], fees: [{ label: 'Delivery', amount: 1 }], total: 10.5 }));
    expect(result.computedTotalCents).toBe(1050);
    expect(result.matchesTotal).toBe(true);
    expect(result.rows[0]).toMatchObject({ quantity: '2', unitPriceCents: 300, amountCents: 1000 });
    expect(sumItemCents([...result.rows, { kind: 'adjustment', label: 'Correction', amountCents: -100, quantity: null, unitPriceCents: null, taxIncluded: false }])).toBe(950);
  });
  it('accepts one cent mismatch but flags two cents', () => {
    expect(reconcileReceipt(receipt({ items: [{ name: 'Item', amount: 1 }], total: 1.01 })).matchesTotal).toBe(true);
    expect(reconcileReceipt(receipt({ items: [{ name: 'Item', amount: 1 }], total: 1.02 })).matchesTotal).toBe(false);
  });
  it('drops bad semantic rows, caps all groups together, and counts each reason', () => {
    const result = reconcileReceipt(receipt({ items: [{ name: ' ', amount: 1 }, { name: 'Bad', amount: -1 }, ...Array.from({ length: 100 }, () => ({ name: 'Good', amount: 1 }))], fees: [{ label: 'Fee', amount: 1 }] }));
    expect(result.rows).toHaveLength(100);
    expect(result.droppedRowCount).toBe(2);
    expect(result.cappedRowCount).toBe(1);
  });
  it('counts Unicode labels as code points, and clears invalid metadata', () => {
    const result = reconcileReceipt(receipt({ items: [{ name: '😀'.repeat(200), amount: 1, quantity: -1, unitPrice: -1 }] }));
    expect(result.rows[0]).toMatchObject({ quantity: null, unitPriceCents: null });
    expect(result.droppedRowCount).toBe(0);
  });
  it('recomputes cached derived fields and rejects malformed or unsupported caches', () => {
    const valid = reconcileReceipt(receipt({ items: [{ name: 'Item', amount: 1 }] }));
    expect(validateCachedReceipt({ ...valid, computedTotalCents: 900 })).toMatchObject({ computedTotalCents: 100 });
    expect(validateCachedReceipt({ ...valid, schemaVersion: 2 })).toBeNull();
    expect(validateCachedReceipt({ ...valid, rows: [{}] })).toBeNull();
  });
  it('keeps invalid manual drafts invalid rather than dropping them', () => {
    expect(parseItemDrafts([draftItem()]).error).toMatch(/Row 1/);
    const valid = draftItem({ kind: 'adjustment', label: 'Correction', amountCents: -101, quantity: null, unitPriceCents: null, taxIncluded: false });
    expect(parseItemDrafts([valid]).rows[0].amountCents).toBe(-101);
  });
});

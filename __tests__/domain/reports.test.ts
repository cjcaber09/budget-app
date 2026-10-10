import {decodeReportSnapshot,reportCents,reportPercentage,reportingMonthSupported} from '../../src/domain/reports';
import {formatMoneyCents} from '../../src/domain/money';
import {rawReport,context} from '../../test-utils/report';
test('aggregate cents exceed the individual limit without losing precision',()=>{
 expect(reportCents('1000000000000')).toBe(1000000000000);
 expect(reportCents('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
 expect(reportCents('-9007199254740991')).toBe(Number.MIN_SAFE_INTEGER);
 expect(formatMoneyCents(Number.MAX_SAFE_INTEGER,'USD')).toBe('$90,071,992,547,409.91');
 expect(formatMoneyCents(Number.MIN_SAFE_INTEGER,'USD')).toBe('-$90,071,992,547,409.91');
 expect(formatMoneyCents(-1,'USD')).toBe('-$0.01');
});
test.each(['1.0','01','NaN','9007199254740992','-9007199254740992',1,null])('rejects invalid cents %s',value=>expect(()=>reportCents(value)).toThrow());
test('a bad comparison delta is local while other sections remain confirmed',()=>{
 const raw=rawReport();raw.comparison.delta.net='9007199254740992';const decoded=decodeReportSnapshot(raw,context);expect(decoded.comparison.error).toMatch('supported range');expect(decoded.totals.data?.expense).toBe(60000);expect(decoded.categories.data).toHaveLength(1);expect(decoded.monthly.data).toHaveLength(2);
});
test('inconsistent valid-looking comparison deltas are rejected before rendering',()=>{const raw=rawReport();raw.comparison.delta.expense='0';expect(decodeReportSnapshot(raw,context).comparison.error).toBeTruthy();});
test.each(['owner','month','timezone','today','start','end'])('rejects a mismatched shared %s context',key=>{const raw=rawReport();raw[key]='changed';expect(()=>decodeReportSnapshot(raw,context)).toThrow('context changed');});
test('negative amounts and malformed states fail only their section',()=>{const raw=rawReport();raw.accounts[0].archived='false';raw.categories[0].spent='-1';const result=decodeReportSnapshot(raw,context);expect(result.accounts.error).toBeTruthy();expect(result.categories.error).toBeTruthy();expect(result.sources.data?.[0].amount).toBe(150000);});
test('period bounds retain twelve valid calendar months and move with financial day',()=>{
 expect(reportingMonthSupported('0001-12-01','2026-10-09')).toBe(true);expect(reportingMonthSupported('0001-11-01','2026-10-09')).toBe(false);
 expect(reportingMonthSupported('2028-10-01','2026-10-31')).toBe(true);expect(reportingMonthSupported('2028-11-01','2026-10-31')).toBe(false);expect(reportingMonthSupported('2028-11-01','2026-11-01')).toBe(true);expect(reportingMonthSupported('2026-02-30','2026-10-09')).toBe(false);
});
test('zero and negative previous values have no percentage',()=>{expect(reportPercentage(50,0)).toBeNull();expect(reportPercentage(50,-20)).toBeNull();expect(reportPercentage(150,100)).toBe(50);});

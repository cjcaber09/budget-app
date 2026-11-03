import {formatDisplayDate} from '../../src/domain/dateFormat';
test('formats calendar dates without timezone shifts or ambiguous parsing',()=>{
 expect(formatDisplayDate('2026-03-10')).toBe('March 10, 2026');
 expect(formatDisplayDate('2026-10-20','mdy')).toBe('10/20/2026');
 expect(formatDisplayDate('2026-10-20','dmy')).toBe('20/10/2026');
 expect(formatDisplayDate('2026-10-20','iso')).toBe('2026-10-20');
 expect(formatDisplayDate('0001-01-01','long')).toBe('January 1, 0001');
 expect(formatDisplayDate('2024-02-29','long')).toBe('February 29, 2024');
 expect(formatDisplayDate('2026-02-29')).toBe('Date unavailable');
});

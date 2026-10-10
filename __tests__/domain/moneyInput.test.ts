import { formatMoneyInput, moneyInputEdit } from '../../src/domain/moneyInput';

test.each([
  ['1000', '1,000'], ['1000000.50', '1,000,000.50'], ['-1234.00', '-1,234.00'],
  ['1000.', '1,000.'], ['1000.0', '1,000.0'], ['', ''], ['-', '-'], ['.', '.'],
  ['0001.20', '0,001.20'], ['12.345', '12.345'], ['not money', 'not money'],
])('formats %s without changing decimal precision or validation', (raw, display) => {
  expect(formatMoneyInput(raw)).toBe(display);
});

test('formats while typing and returns only ungrouped values', () => {
  expect(moneyInputEdit('999', '9999', { start: 3, end: 3 })).toEqual({ value: '9999', selection: { start: 5, end: 5 } });
  expect(moneyInputEdit('1,000', '1,0000', { start: 5, end: 5 })).toEqual({ value: '10000', selection: { start: 6, end: 6 } });
});

test('keeps the caret at a middle insertion rather than jumping to the end', () => {
  expect(moneyInputEdit('1,234.50', '1,9234.50', { start: 2, end: 2 })).toEqual({ value: '19234.50', selection: { start: 2, end: 2 } });
});

test('supports backspace, selecting a range, clearing and pasting', () => {
  expect(moneyInputEdit('1,000', '1,00', { start: 5, end: 5 }).value).toBe('100');
  expect(moneyInputEdit('1,234.50', '1,9.50', { start: 2, end: 5 })).toEqual({ value: '19.50', selection: { start: 2, end: 2 } });
  expect(moneyInputEdit('1,000', '', { start: 0, end: 5 }).value).toBe('');
  expect(moneyInputEdit('', '12,345.60').value).toBe('12345.60');
});

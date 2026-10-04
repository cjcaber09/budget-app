import { estimateBase64Bytes, formatOcrLimitMessage, createRequestId } from '../../src/domain/ocr';
import { isUuid } from '../../supabase/functions/ocr/shared';

describe('estimateBase64Bytes', () => {
  it('accounts for padding', () => {
    expect(estimateBase64Bytes('QUJD')).toBe(3);
    expect(estimateBase64Bytes('QUI=')).toBe(2);
    expect(estimateBase64Bytes('QQ==')).toBe(1);
  });
});

describe('formatOcrLimitMessage', () => {
  it('formats per-user limits in minutes', () => {
    expect(formatOcrLimitMessage('user_hourly', 720)).toBe('Scan limit reached — try again in 12 min.');
  });

  it('never shows less than a minute', () => {
    expect(formatOcrLimitMessage('user_daily', 10)).toBe('Scan limit reached — try again in 1 min.');
  });

  it('formats long waits in hours and uses the global wording', () => {
    expect(formatOcrLimitMessage('global_daily', 3 * 3600)).toBe(
      'Scanning is busy right now — try again in 3 h.'
    );
  });

  it('explains the monthly free-tier cap in days', () => {
    expect(formatOcrLimitMessage('global_monthly', 10 * 86400)).toBe(
      'Monthly scan limit reached — try again in 10 days.'
    );
  });
});

describe('createRequestId', () => {
  it('produces distinct v4 uuids the server accepts', () => {
    const a = createRequestId();
    const b = createRequestId();
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('4');
    expect(a).not.toBe(b);
  });
});

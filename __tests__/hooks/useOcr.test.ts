import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

// The real client throws at import without EXPO_PUBLIC_* env vars.
jest.mock('../../src/lib/supabase', () => ({ supabase: {} }));

import { mapOcrInvokeError, shouldRetryOcrScan } from '../../src/hooks/useOcr';

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError({ status, json: async () => body });
}

describe('mapOcrInvokeError', () => {
  it('turns a 429 into the friendly limit message and does not retry it', async () => {
    const error = await mapOcrInvokeError(
      httpError(429, { error: 'rate_limited', reason: 'user_hourly', retryAfterSeconds: 720 })
    );
    expect(error.message).toBe('Scan limit reached — try again in 12 min.');
    expect(error.retryable).toBe(false);
  });

  it('uses the global wording for the global cap', async () => {
    const error = await mapOcrInvokeError(
      httpError(429, { error: 'rate_limited', reason: 'global_daily', retryAfterSeconds: 7200 })
    );
    expect(error.message).toBe('Scanning is busy right now — try again in 2 h.');
  });

  it('retries a scan that is still in progress', async () => {
    const error = await mapOcrInvokeError(httpError(409, { error: 'in_progress' }));
    expect(error.retryable).toBe(true);
  });

  it('retries network and timeout failures', async () => {
    const error = await mapOcrInvokeError(new FunctionsFetchError(new Error('timeout')));
    expect(error.message).toBe("Couldn't reach the scanner. Check your connection and try again.");
    expect(error.retryable).toBe(true);
  });

  it('falls back to a generic, non-retryable message for anything else', async () => {
    for (const input of [httpError(502, { error: 'ocr_failed' }), new Error('boom')]) {
      const error = await mapOcrInvokeError(input);
      expect(error.message).toBe("Couldn't read text from that image.");
      expect(error.retryable).toBe(false);
    }
  });
});

describe('shouldRetryOcrScan', () => {
  it('retries a retryable error once, and never a non-retryable one', () => {
    expect(shouldRetryOcrScan(0, { retryable: true })).toBe(true);
    expect(shouldRetryOcrScan(1, { retryable: true })).toBe(false);
    expect(shouldRetryOcrScan(0, { retryable: false })).toBe(false);
    expect(shouldRetryOcrScan(0, new Error('boom'))).toBe(false);
  });
});

import {
  MAX_IMAGE_BYTES,
  MAX_OCR_TEXT_CHARS,
  sniffImageType,
  decodeBase64,
  validateImagePayload,
  clampOcrText,
  isUuid,
  ocrScanPath,
  timingSafeEqual,
} from '../../supabase/functions/ocr/shared';

// Minimal headers: JPEG FF D8 FF E0, PNG 89 50 4E 47 0D 0A 1A 0A, WebP "RIFF" + 4 bytes + "WEBP".
const JPEG_B64 = '/9j/4A==';
const PNG_B64 = 'iVBORw0KGgo=';
const WEBP_B64 = 'UklGRgAAAABXRUJQ';
const REQUEST_ID = '3f8a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b';

describe('sniffImageType', () => {
  it('recognizes jpeg, png and webp headers', () => {
    expect(sniffImageType(decodeBase64(JPEG_B64)!)).toBe('image/jpeg');
    expect(sniffImageType(decodeBase64(PNG_B64)!)).toBe('image/png');
    expect(sniffImageType(decodeBase64(WEBP_B64)!)).toBe('image/webp');
  });

  it('returns null for anything else', () => {
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
  });
});

describe('decodeBase64', () => {
  it('returns null for invalid base64', () => {
    expect(decodeBase64('!!!')).toBeNull();
  });
});

describe('validateImagePayload', () => {
  it('accepts a matching jpeg payload and returns its decoded bytes', () => {
    expect(validateImagePayload({ imageBase64: JPEG_B64, mimeType: 'image/jpeg', requestId: REQUEST_ID })).toEqual({
      ok: true,
      imageBase64: JPEG_B64,
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      mimeType: 'image/jpeg',
      requestId: REQUEST_ID,
    });
  });

  it('rejects a missing or malformed body', () => {
    const invalid = { ok: false, error: 'invalid_request' };
    expect(validateImagePayload(null)).toEqual(invalid);
    expect(validateImagePayload({ imageBase64: JPEG_B64, requestId: REQUEST_ID })).toEqual(invalid);
    expect(validateImagePayload({ imageBase64: '!!!', mimeType: 'image/jpeg', requestId: REQUEST_ID })).toEqual(invalid);
    expect(validateImagePayload({ imageBase64: JPEG_B64, mimeType: 'image/jpeg' })).toEqual(invalid);
    expect(validateImagePayload({ imageBase64: JPEG_B64, mimeType: 'image/jpeg', requestId: 'abc' })).toEqual(invalid);
  });

  it('rejects unsupported types', () => {
    expect(validateImagePayload({ imageBase64: JPEG_B64, mimeType: 'image/gif', requestId: REQUEST_ID })).toEqual({
      ok: false,
      error: 'unsupported_type',
    });
  });

  it('rejects bytes that do not match the declared type', () => {
    expect(validateImagePayload({ imageBase64: PNG_B64, mimeType: 'image/jpeg', requestId: REQUEST_ID })).toEqual({
      ok: false,
      error: 'type_mismatch',
    });
  });

  it('rejects payloads over the size limit before decoding', () => {
    const tooBig = 'A'.repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4);
    expect(validateImagePayload({ imageBase64: tooBig, mimeType: 'image/jpeg', requestId: REQUEST_ID })).toEqual({
      ok: false,
      error: 'too_large',
    });
  });
});

describe('clampOcrText', () => {
  it('leaves text under the limit untouched', () => {
    expect(clampOcrText('TOTAL 12.50')).toEqual({ text: 'TOTAL 12.50', truncated: false });
  });

  it('cuts text over the limit and flags it', () => {
    const result = clampOcrText('x'.repeat(MAX_OCR_TEXT_CHARS + 50));
    expect(result.text).toHaveLength(MAX_OCR_TEXT_CHARS);
    expect(result.truncated).toBe(true);
  });

  it('never splits a surrogate pair at the cut', () => {
    const result = clampOcrText('a'.repeat(MAX_OCR_TEXT_CHARS - 1) + '😀' + 'b');
    expect(result.text).toBe('a'.repeat(MAX_OCR_TEXT_CHARS - 1));
    expect(result.truncated).toBe(true);
  });
});

describe('isUuid', () => {
  it('accepts uuids only', () => {
    expect(isUuid(REQUEST_ID)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe('ocrScanPath', () => {
  it('builds the per-user object path', () => {
    expect(ocrScanPath('u1', 's1')).toBe('u1/s1.txt');
  });
});

describe('timingSafeEqual', () => {
  it('compares strings without early exit semantics leaking into results', () => {
    expect(timingSafeEqual('secret-value', 'secret-value')).toBe(true);
    expect(timingSafeEqual('secret-value', 'secret-valuf')).toBe(false);
    expect(timingSafeEqual('secret', 'secret-value')).toBe(false);
  });
});

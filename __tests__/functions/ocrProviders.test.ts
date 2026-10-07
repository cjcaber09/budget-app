import {
  VISION_URL,
  buildVisionBody,
  parseVisionResponse,
  DEFAULT_GEMINI_MODEL,
  geminiUrl,
  buildGeminiBody,
  parseGeminiResponse,
  readWithFallback,
  type OcrProviderName,
  type ProviderResult,
} from '../../supabase/functions/ocr/ocrProviders';

describe('Vision request and response', () => {
  it('asks for exactly one feature and only the text', () => {
    expect(buildVisionBody('QUJD')).toEqual({
      requests: [{ image: { content: 'QUJD' }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }],
    });
    expect(VISION_URL).toContain('fields=responses(fullTextAnnotation/text,error)');
  });

  it('returns the text, or empty text when the image has none', () => {
    expect(parseVisionResponse(200, { responses: [{ fullTextAnnotation: { text: 'TOTAL 12.50\n' } }] })).toEqual({
      ok: true,
      text: 'TOTAL 12.50\n',
    });
    expect(parseVisionResponse(200, { responses: [{}] })).toEqual({ ok: true, text: '' });
  });

  it('fails with the most specific reason code Google gives', () => {
    expect(
      parseVisionResponse(403, {
        error: { code: 403, status: 'PERMISSION_DENIED', details: [{ reason: 'BILLING_DISABLED' }] },
      })
    ).toEqual({ ok: false, status: 403, reason: 'BILLING_DISABLED' });
    expect(parseVisionResponse(200, { responses: [{ error: { code: 3, message: 'Bad image data.' } }] })).toEqual({
      ok: false,
      status: 200,
      reason: 'code_3',
    });
    expect(parseVisionResponse(500, null)).toEqual({ ok: false, status: 500, reason: 'http_error' });
    expect(parseVisionResponse(200, { responses: [] })).toEqual({ ok: false, status: 200, reason: 'no_response' });
  });
});

describe('Gemini request and response', () => {
  it('targets generateContent on the given model', () => {
    expect(geminiUrl(DEFAULT_GEMINI_MODEL)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
    );
  });

  it('sends the image inline with a transcription prompt and deterministic settings', () => {
    const body = buildGeminiBody('QUJD', 'image/jpeg');
    expect(body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
    expect(body.contents[0].parts[1].text).toMatch(/transcribe/i);
    expect(body.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 8192 });
  });

  it('joins the answer parts, skipping thought parts and a wrapping code fence', () => {
    expect(
      parseGeminiResponse(200, {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: 'reasoning', thought: true }, { text: 'COFFEE SHOP\n' }, { text: 'TOTAL 12.50' }] },
          },
        ],
      })
    ).toEqual({ ok: true, text: 'COFFEE SHOP\nTOTAL 12.50' });
    expect(
      parseGeminiResponse(200, {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '```text\nTOTAL 12.50\n```' }] } }],
      })
    ).toEqual({ ok: true, text: 'TOTAL 12.50' });
  });

  it('accepts an empty answer and output cut at the token limit', () => {
    expect(parseGeminiResponse(200, { candidates: [{ finishReason: 'STOP', content: {} }] })).toEqual({
      ok: true,
      text: '',
    });
    expect(
      parseGeminiResponse(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'LONG' }] } }] })
    ).toEqual({ ok: true, text: 'LONG' });
  });

  it('fails on HTTP errors, blocked prompts, other finish reasons, and missing candidates', () => {
    expect(parseGeminiResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } })).toEqual({
      ok: false,
      status: 429,
      reason: 'RESOURCE_EXHAUSTED',
    });
    expect(parseGeminiResponse(200, { promptFeedback: { blockReason: 'SAFETY' } })).toEqual({
      ok: false,
      status: 200,
      reason: 'blocked_SAFETY',
    });
    expect(
      parseGeminiResponse(200, { candidates: [{ finishReason: 'RECITATION', content: { parts: [{ text: 'x' }] } }] })
    ).toEqual({ ok: false, status: 200, reason: 'RECITATION' });
    expect(parseGeminiResponse(200, { candidates: [] })).toEqual({ ok: false, status: 200, reason: 'no_candidate' });
  });
});

function attempt(name: OcrProviderName, result: ProviderResult | Error) {
  return {
    name,
    run: jest.fn(async (): Promise<ProviderResult> => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('readWithFallback', () => {
  it('uses the first provider that succeeds and never calls the rest', async () => {
    const vision = attempt('vision', { ok: true, text: 'A' });
    const gemini = attempt('gemini', { ok: true, text: 'B' });

    await expect(readWithFallback([vision, gemini])).resolves.toEqual({ provider: 'vision', text: 'A', failures: [] });
    expect(gemini.run).not.toHaveBeenCalled();
  });

  it('falls back to the next provider and records why the first one failed', async () => {
    const vision = attempt('vision', { ok: false, status: 403, reason: 'BILLING_DISABLED' });
    const gemini = attempt('gemini', { ok: true, text: 'B' });

    await expect(readWithFallback([vision, gemini])).resolves.toEqual({
      provider: 'gemini',
      text: 'B',
      failures: [{ name: 'vision', status: 403, reason: 'BILLING_DISABLED' }],
    });
  });

  it('treats a thrown error (network, timeout) as a failure and moves on', async () => {
    const outcome = await readWithFallback([
      attempt('vision', new Error('fetch failed')),
      attempt('gemini', { ok: true, text: 'B' }),
    ]);

    expect(outcome.provider).toBe('gemini');
    expect(outcome.failures).toEqual([{ name: 'vision', status: 0, reason: 'network_error' }]);
  });

  it('records an aborted (timed-out) provider call as a timeout and moves on', async () => {
    const outcome = await readWithFallback([
      attempt('vision', Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
      attempt('gemini', { ok: true, text: 'B' }),
    ]);

    expect(outcome.provider).toBe('gemini');
    expect(outcome.failures).toEqual([{ name: 'vision', status: 0, reason: 'timeout' }]);
  });

  it('reports no text when every provider fails', async () => {
    await expect(
      readWithFallback([
        attempt('vision', { ok: false, status: 500, reason: 'http_error' }),
        attempt('gemini', { ok: false, status: 429, reason: 'RESOURCE_EXHAUSTED' }),
      ])
    ).resolves.toEqual({
      provider: null,
      text: null,
      failures: [
        { name: 'vision', status: 500, reason: 'http_error' },
        { name: 'gemini', status: 429, reason: 'RESOURCE_EXHAUSTED' },
      ],
    });
  });
});

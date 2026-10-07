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

describe('Gemini structured receipt request and response', () => {
  const receipt = { merchant: 'Shop', text: 'TOTAL 12.50', items: [{ name: 'Coffee', amount: 12.5 }], deductions: [], taxes: [], fees: [], total: 12.5,
    transactionType:'expense',documentKind:'purchase',paymentStatus:'completed',classificationReason:'Purchase receipt',ownAccountTransfer:false,paymentDetails:null,paymentSummary:null,
    principal:null,netReceived:null,totalDebited:12.5,receiptDate:null,receiptDateRaw:null };
  const answer = (value: unknown, finishReason = 'STOP') => ({ candidates: [{ finishReason, content: { parts: [{ text: 'reasoning', thought: true }, { text: JSON.stringify(value) }] } }] });
  it('requests supported structured JSON with a bounded output budget', () => {
    expect(geminiUrl(DEFAULT_GEMINI_MODEL)).toContain('generateContent');
    const body = buildGeminiBody('QUJD', 'image/jpeg');
    expect(body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
    expect(body.generationConfig).toMatchObject({ temperature: 0, maxOutputTokens: 16384, responseMimeType: 'application/json' });
    expect(body.generationConfig.responseJsonSchema.required).toContain('items');
  });
  it('returns structurally valid JSON, ignoring thought parts', () => {
    expect(parseGeminiResponse(200, answer(receipt))).toEqual({ ok: true, text: receipt.text, receipt });
  });
  it('accepts a wrapping JSON fence', () => {
    const body = answer(receipt);
    body.candidates[0].content.parts[1].text = '\`\`\`json\n' + JSON.stringify(receipt) + '\n\`\`\`';
    expect(parseGeminiResponse(200, body)).toMatchObject({ ok: true, receipt });
  });
  it('leaves semantic invalid values to the reconciler', () => {
    expect(parseGeminiResponse(200, answer({ ...receipt, items: [{ name: '', amount: -2 }] }))).toMatchObject({ ok: true });
  });
  test.each([{}, { ...receipt, items: 'wrong' }, { ...receipt, items: [{ name: 'Coffee', amount: '12.5' }] }, { ...receipt, taxes: [{ label: 'VAT', amount: 1 }] }])('rejects wrong structural fields', value => {
    expect(parseGeminiResponse(200, answer(value))).toMatchObject({ ok: false, reason: 'invalid_receipt_json' });
  });
  it('rejects even valid JSON at MAX_TOKENS and falls back to Vision', async () => {
    const failure = parseGeminiResponse(200, answer(receipt, 'MAX_TOKENS'));
    expect(failure).toMatchObject({ ok: false, reason: 'MAX_TOKENS' });
    const outcome = await readWithFallback([attempt('gemini', failure), attempt('vision', { ok: true, text: 'Fallback' })]);
    expect(outcome).toMatchObject({ provider: 'vision', text: 'Fallback' });
    expect(outcome.receipt).toBeUndefined();
  });
  it('rejects blocked, missing, empty and malformed output', () => {
    expect(parseGeminiResponse(200, { promptFeedback: { blockReason: 'SAFETY' } })).toMatchObject({ ok: false, reason: 'blocked_SAFETY' });
    expect(parseGeminiResponse(200, { candidates: [] })).toMatchObject({ ok: false, reason: 'no_candidate' });
    expect(parseGeminiResponse(429, { error: { status: 'RESOURCE_EXHAUSTED' } })).toMatchObject({ ok: false, reason: 'RESOURCE_EXHAUSTED' });
    expect(parseGeminiResponse(200, { candidates: [{ finishReason: 'STOP', content: {} }] })).toMatchObject({ ok: false });
  });
  it('parses a bounded large receipt with 100 detailed rows and the full transcription', () => {
    const large = { ...receipt, text: 'Receipt line\n'.repeat(1500), items: Array.from({ length: 100 }, (_, i) => ({ name: 'Purchased item ' + i, quantity: 2, unitPrice: 6.25, amount: 12.5 })) };
    expect(JSON.stringify(large).length).toBeLessThan(256 * 1024);
    expect(parseGeminiResponse(200, answer(large))).toMatchObject({ ok: true, receipt: large });
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

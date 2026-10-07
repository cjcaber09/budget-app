// Imported by the Deno edge function (index.ts) AND by the app/Jest. Keep it one
// file with no imports: the root tsconfig has no allowImportingTsExtensions, and
// Deno needs `.ts` specifiers, so any import here would break one side.

export const OCR_BUCKET = 'budget-tracker-ocr';
// The client sends ≤ 1600px JPEGs (a few hundred KB); this only bounds abuse.
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_OCR_TEXT_CHARS = 20_000;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export type OcrLimitReason = 'user_hourly' | 'user_daily' | 'global_daily' | 'global_monthly';

export interface OcrScanResult {
  scanId: string;
  text: string;
  path: string;
  truncated: boolean;
  receipt: ReconciledReceipt | null;
}

export type TransactionItemKind = 'item' | 'deduction' | 'tax' | 'fee' | 'adjustment';
export interface TransactionItemInput {
  affectsTotal?: boolean;
  isPaymentSummary?: boolean;
  requiresCountingReview?: boolean;
  feeParty?: 'sender' | 'recipient' | 'unknown' | null;
  kind: TransactionItemKind;
  label: string;
  amountCents: number;
  quantity: string | null;
  unitPriceCents: number | null;
  taxIncluded: boolean;
}
export interface ExtractedReceipt {
  transactionType?: 'income' | 'expense' | 'unknown';
  documentKind?: DocumentKind;
  paymentStatus?: 'completed' | 'pending' | 'failed' | 'unknown';
  classificationReason?: string | null;
  ownAccountTransfer?: boolean;
  paymentDetails?: PaymentDetails | null;
  paymentSummary?: { label: string; amount: number; basis: 'principal' | 'net' | 'unknown' } | null;
  principal?: number | null;
  netReceived?: number | null;
  totalDebited?: number | null;
  receiptDate?: string | null;
  receiptDateRaw?: string | null;
  merchant: string | null;
  text: string;
  items: { name: string; quantity?: number; unitPrice?: number; amount: number }[];
  deductions: { label: string; amount: number; alreadyReflected?: boolean }[];
  taxes: { label: string; amount: number; included: boolean; alreadyReflected?: boolean }[];
  fees: { label: string; amount: number; chargedTo?: 'sender' | 'recipient' | 'unknown'; alreadyReflected?: boolean }[];
  total: number | null;
}
export interface ReconciledReceipt {
  schemaVersion: 1 | 2;
  transactionType?: 'income' | 'expense' | 'unknown';
  documentKind?: DocumentKind;
  paymentStatus?: 'completed' | 'pending' | 'failed' | 'unknown';
  classificationReason?: string | null;
  paymentDetails?: PaymentDetails | null;
  receiptDate?: string | null;
  receiptDateRaw?: string | null;
  principalCents?: number | null;
  netReceivedCents?: number | null;
  totalDebitedCents?: number | null;
  merchant: string | null;
  rows: TransactionItemInput[];
  totalCents: number | null;
  computedTotalCents: number | null;
  matchesTotal: boolean | null;
  droppedRowCount: number;
  cappedRowCount: number;
}
export type DocumentKind = 'purchase' | 'salary' | 'transfer' | 'payment' | 'unknown';
export interface PaymentDetails {
  documentKind: DocumentKind;
  fromName: string | null;
  fromNumber: string | null;
  fromNumberType: 'phone' | 'account' | 'unknown';
  reference: string | null;
}
export function validPaymentDetails(value: unknown): value is PaymentDetails | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as PaymentDetails;
  return Object.keys(data).length === 5 && ['documentKind', 'fromName', 'fromNumber', 'fromNumberType', 'reference'].every(key => key in data)
    && ['purchase','salary','transfer','payment','unknown'].includes(data.documentKind)
    && ['phone','account','unknown'].includes(data.fromNumberType)
    && [data.fromName,data.fromNumber,data.reference].every(text => text === null || (typeof text === 'string' && !!text.trim() && [...text].length <= 200));
}
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export const MAX_MONEY_CENTS = 999999999999;
export const MAX_RECEIPT_ROWS = 100;

/** Decimal digit arithmetic, including exponents; ties round away from zero. */
export function decimalToCents(value: string | number): number | null {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value).trim());
  if (!match) return null;
  const exponent = Number(match[4] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return null;
  const digits = match[2] + (match[3] ?? '');
  const point = match[2].length + exponent + 2;
  const whole = point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0');
  const next = point < 0 ? '0' : digits[point] ?? '0';
  let cents = BigInt(whole) + (next >= '5' ? 1n : 0n);
  if (match[1] === '-') cents = -cents;
  if (cents > BigInt(MAX_MONEY_CENTS) || cents < -BigInt(MAX_MONEY_CENTS)) return null;
  return Number(cents);
}
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_MONEY_CENTS) throw new Error('Invalid money amount');
  const magnitude = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, '0')}`;
}
export function sumItemCents(rows: TransactionItemInput[], type: 'income' | 'expense' = 'expense'): number {
  return rows.reduce((sum, row) => sum + (row.affectsTotal === false || (row.kind === 'tax' && row.taxIncluded) ? 0
    : row.kind === 'deduction' || (type === 'income' && (row.kind === 'fee' || row.kind === 'tax')) ? -row.amountCents : row.amountCents), 0);
}

export function validItem(row: TransactionItemInput): boolean {
  return ['item', 'deduction', 'tax', 'fee', 'adjustment'].includes(row.kind)
    && typeof row.label === 'string' && row.label.trim().length > 0 && [...row.label].length <= 200
    && Number.isSafeInteger(row.amountCents) && Math.abs(row.amountCents) <= MAX_MONEY_CENTS
    && (row.kind === 'adjustment' || row.amountCents >= 0)
    && typeof row.taxIncluded === 'boolean' && (!row.taxIncluded || row.kind === 'tax')
    && (row.affectsTotal === undefined || typeof row.affectsTotal === 'boolean')
    && (row.isPaymentSummary === undefined || typeof row.isPaymentSummary === 'boolean')
    && (!row.isPaymentSummary || (row.kind === 'item' && row.amountCents > 0 && row.affectsTotal !== false))
    && (row.feeParty === undefined || row.feeParty === null || (row.kind === 'fee' && ['sender','recipient','unknown'].includes(row.feeParty)))
    && (row.quantity === null || (row.kind === 'item' && /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(row.quantity) && Number(row.quantity) > 0))
    && (row.unitPriceCents === null || (row.kind === 'item' && Number.isSafeInteger(row.unitPriceCents) && row.unitPriceCents >= 0 && row.unitPriceCents <= MAX_MONEY_CENTS));
}

export function reconcileReceipt(receipt: ExtractedReceipt): ReconciledReceipt {
  if (receipt.transactionType !== undefined) return reconcilePaymentReceipt(receipt);
  const rows: TransactionItemInput[] = [];
  let droppedRowCount = 0;
  let cappedRowCount = 0;
  for (const [kind, group] of [ ['item', receipt.items], ['deduction', receipt.deductions], ['tax', receipt.taxes], ['fee', receipt.fees] ] as const) {
    for (const source of group) {
      const value = source as { name?: string; label?: string; amount: number; quantity?: number; unitPrice?: number; included?: boolean };
      const amountCents = decimalToCents(value.amount);
      const quantity = typeof value.quantity === 'number' && Number.isFinite(value.quantity) ? String(value.quantity) : null;
      const unitPriceCents = typeof value.unitPrice === 'number' ? decimalToCents(value.unitPrice) : null;
      const row: TransactionItemInput = { kind, label: String(value.name ?? value.label ?? '').trim(), amountCents: amountCents ?? NaN,
        quantity: kind === 'item' && quantity && /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(quantity) && Number(quantity) > 0 ? quantity : null,
        unitPriceCents: kind === 'item' && unitPriceCents !== null && unitPriceCents >= 0 ? unitPriceCents : null,
        taxIncluded: kind === 'tax' && value.included === true };
      if (!validItem(row)) { droppedRowCount++; continue; }
      if (rows.length >= MAX_RECEIPT_ROWS) { cappedRowCount++; continue; }
      rows.push(row);
    }
  }
  const convertedTotal = receipt.total === null ? null : decimalToCents(receipt.total);
  const totalCents = convertedTotal !== null && convertedTotal > 0 ? convertedTotal : null;
  const computedTotalCents = sumItemCents(rows);
  return { schemaVersion: 1, merchant: typeof receipt.merchant === 'string' ? receipt.merchant.trim() || null : null,
    rows, totalCents, computedTotalCents, matchesTotal: totalCents === null || rows.length === 0 ? null : Math.abs(totalCents - computedTotalCents) <= 1,
    droppedRowCount, cappedRowCount };
}

/** Cached derived fields are recomputed; malformed/versioned envelopes degrade to text. */
export function validateCachedReceipt(value: unknown): ReconciledReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const cached = value as ReconciledReceipt;
  if (cached.schemaVersion === 2) return validatePaymentCache(cached);
  if (cached.schemaVersion !== 1 || !Array.isArray(cached.rows) || cached.rows.length > MAX_RECEIPT_ROWS
    || !cached.rows.every(row => row && validItem(row))
    || !(cached.merchant === null || typeof cached.merchant === 'string')
    || !(cached.totalCents === null || (Number.isSafeInteger(cached.totalCents) && cached.totalCents > 0 && cached.totalCents <= MAX_MONEY_CENTS))
    || ![cached.droppedRowCount, cached.cappedRowCount].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  const computedTotalCents = sumItemCents(cached.rows);
  return { ...cached, computedTotalCents, matchesTotal: cached.totalCents === null || cached.rows.length === 0 ? null : Math.abs(cached.totalCents - computedTotalCents) <= 1 };
}

export type ImagePayloadResult =
  | { ok: true; imageBase64: string; bytes: Uint8Array; mimeType: AllowedImageType; requestId: string }
  | { ok: false; error: 'invalid_request' | 'unsupported_type' | 'too_large' | 'type_mismatch' };

function positiveMoney(value: number | null | undefined): number | null {
  const cents = typeof value === 'number' ? decimalToCents(Math.abs(value)) : null;
  return cents !== null && cents > 0 ? cents : null;
}
export function receiptTarget(receipt: ReconciledReceipt | null | undefined, type: 'income' | 'expense' | null): number | null {
  if (!receipt || !type) return null;
  if (receipt.schemaVersion === 1) return type === 'expense' ? receipt.totalCents : null;
  return (type === 'income' ? receipt.netReceivedCents : receipt.totalDebitedCents) ?? null;
}
export function reconcilePaymentReceipt(receipt: ExtractedReceipt): ReconciledReceipt {
  const legacy = reconcileReceipt({ merchant: receipt.merchant, text: receipt.text, items: receipt.items,
    deductions:receipt.deductions.map(row=>({...row,amount:Math.abs(row.amount)})),taxes:receipt.taxes.map(row=>({...row,amount:Math.abs(row.amount)})),fees:receipt.fees.map(row=>({...row,amount:Math.abs(row.amount)})), total: receipt.total });
  let transactionType = receipt.transactionType ?? 'unknown';
  if (receipt.ownAccountTransfer || receipt.paymentStatus !== 'completed'
    || (transactionType === 'income' && ((receipt.paymentSummary?.amount ?? 0)<0 || (receipt.netReceived ?? 0)<0))) transactionType = 'unknown';
  const hasEarnings = legacy.rows.some(row => row.kind === 'item');
  const summary = receipt.paymentSummary;
  const useSummary = !!summary && receipt.paymentStatus === 'completed' && (!hasEarnings || ['salary','transfer','payment'].includes(receipt.documentKind ?? ''));
  const netSummary = useSummary && summary?.basis === 'net';
  const rows: TransactionItemInput[] = [];
  let droppedRowCount = legacy.droppedRowCount;
  let cappedRowCount = legacy.cappedRowCount;
  if (useSummary && summary) {
    const amountCents = positiveMoney(summary.amount);
    const row: TransactionItemInput = { kind: 'item', label: summary.label.trim(), amountCents: amountCents ?? NaN, quantity: null, unitPriceCents: null, taxIncluded: false, affectsTotal: true, isPaymentSummary: true };
    if (validItem(row)) rows.push(row); else droppedRowCount++;
  }
  // Match normalized rows back to their group in order, including semantic drops.
  for (const [kind, sources] of [['item',receipt.items],['deduction',receipt.deductions],['tax',receipt.taxes],['fee',receipt.fees]] as const) {
    for (const source of sources) {
      const normalized = {...source,amount:kind === 'item' ? source.amount : Math.abs(source.amount)};
      const one = reconcileReceipt({ merchant: null, text: '', items: kind === 'item' ? [normalized as ExtractedReceipt['items'][number]] : [],
        deductions: kind === 'deduction' ? [normalized as ExtractedReceipt['deductions'][number]] : [], taxes: kind === 'tax' ? [normalized as ExtractedReceipt['taxes'][number]] : [], fees: kind === 'fee' ? [normalized as ExtractedReceipt['fees'][number]] : [], total: null });
      const row = one.rows[0];
      if (!row) continue;
      const charge = source as { alreadyReflected?: boolean; chargedTo?: 'sender'|'recipient'|'unknown' };
      let affectsTotal = !(row.kind === 'tax' && row.taxIncluded) && !charge.alreadyReflected && !(netSummary && kind !== 'item') && !(useSummary && kind === 'item');
      let requiresCountingReview = false;
      if (kind === 'fee' && affectsTotal && receipt.documentKind !== 'purchase') {
        const party = transactionType === 'income' ? 'recipient' : transactionType === 'expense' ? 'sender' : null;
        if (!party || !charge.chargedTo || charge.chargedTo === 'unknown') { affectsTotal = false; requiresCountingReview = true; }
        else affectsTotal = charge.chargedTo === party;
      }
      if (rows.length >= MAX_RECEIPT_ROWS) { cappedRowCount++; continue; }
      rows.push({ ...row, affectsTotal, isPaymentSummary: false, requiresCountingReview, feeParty: kind === 'fee' ? charge.chargedTo ?? 'unknown' : null });
    }
  }
  // Legacy reconciler's cap counted rows too; this loop owns the combined cap instead.
  cappedRowCount -= legacy.cappedRowCount;
  const netReceivedCents = positiveMoney(receipt.netReceived);
  const totalDebitedCents = positiveMoney(receipt.totalDebited);
  const target = transactionType === 'income' ? netReceivedCents : transactionType === 'expense' ? totalDebitedCents : null;
  const computedTotalCents = transactionType === 'unknown' ? null : sumItemCents(rows, transactionType);
  return { schemaVersion: 2, merchant: receipt.merchant?.trim() || null, rows, totalCents: target,
    computedTotalCents, matchesTotal: target === null || computedTotalCents === null || !rows.length ? null : Math.abs(target-computedTotalCents) <= 1,
    droppedRowCount, cappedRowCount, transactionType, documentKind: receipt.documentKind ?? 'unknown', paymentStatus: receipt.paymentStatus ?? 'unknown',
    classificationReason: receipt.classificationReason ?? null, paymentDetails: validPaymentDetails(receipt.paymentDetails ?? null) ? receipt.paymentDetails ?? (['salary','transfer','payment'].includes(receipt.documentKind ?? '') ? {documentKind:receipt.documentKind!,fromName:null,fromNumber:null,fromNumberType:'unknown',reference:null}:null) : null,
    principalCents: positiveMoney(receipt.principal), netReceivedCents, totalDebitedCents,
    receiptDate: usableReceiptDate(receipt.receiptDate,receipt.receiptDateRaw,receipt.text), receiptDateRaw: receipt.receiptDateRaw ?? null };
}
function usableReceiptDate(day: unknown,raw: string|null|undefined,text: string): string|null {
  if (!isCalendarDate(day)) return null;
  if (raw) {
    if (!/(?:^|\D)\d{4}(?:\D|$)/.test(raw)) return null;
    const numeric = /^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{4}$/.exec(raw.trim());
    if (numeric && Number(numeric[1])<=12 && Number(numeric[2])<=12 && numeric[1]!==numeric[2]
      && !/(?:MM[\/.-]DD|DD[\/.-]MM)/i.test(text)) return null;
  }
  return day;
}
function validatePaymentCache(cached: ReconciledReceipt): ReconciledReceipt | null {
  if (!['income','expense','unknown'].includes(cached.transactionType ?? '') || !['purchase','salary','transfer','payment','unknown'].includes(cached.documentKind ?? '')
    || !['completed','pending','failed','unknown'].includes(cached.paymentStatus ?? '') || !validPaymentDetails(cached.paymentDetails)
    || !(cached.receiptDate === null || isCalendarDate(cached.receiptDate))
    || !(cached.receiptDateRaw === null || typeof cached.receiptDateRaw === 'string')
    || !(cached.classificationReason === null || typeof cached.classificationReason === 'string')
    || !(cached.merchant === null || typeof cached.merchant === 'string')
    || !Array.isArray(cached.rows) || cached.rows.length > MAX_RECEIPT_ROWS || !cached.rows.every(row => row && validItem(row)
      && typeof row.affectsTotal === 'boolean' && typeof row.isPaymentSummary === 'boolean'
      && (row.requiresCountingReview === undefined || typeof row.requiresCountingReview === 'boolean'))
    || cached.rows.filter(row => row.isPaymentSummary).length > 1
    || ![cached.principalCents,cached.netReceivedCents,cached.totalDebitedCents].every(n => n === null || (Number.isSafeInteger(n) && n! > 0 && n! <= MAX_MONEY_CENTS))
    || ![cached.droppedRowCount,cached.cappedRowCount].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  const type = cached.paymentStatus === 'completed' ? cached.transactionType! : 'unknown';
  const totalCents = receiptTarget(cached, type === 'unknown' ? null : type);
  const computedTotalCents = type === 'unknown' ? null : sumItemCents(cached.rows,type);
  return { ...cached, transactionType: type, totalCents, computedTotalCents, matchesTotal: totalCents === null || computedTotalCents === null || !cached.rows.length ? null : Math.abs(totalCents-computedTotalCents)<=1 };
}
export function receiptForClient(receipt: ReconciledReceipt | null, version: 1 | 2): ReconciledReceipt | null {
  if (!receipt) return null;
  if (version === 2) {
    if (receipt.schemaVersion === 2) return receipt;
    return { ...receipt, schemaVersion: 2, transactionType: 'unknown', documentKind: 'unknown', paymentStatus: 'completed',
      classificationReason: 'This older scan needs a transaction type.', paymentDetails: null, receiptDate: null, receiptDateRaw: null,
      principalCents: null, netReceivedCents: null, totalDebitedCents: receipt.totalCents, totalCents: null, computedTotalCents: null, matchesTotal: null,
      rows: receipt.rows.map(row => ({ ...row, affectsTotal: !(row.kind === 'tax' && row.taxIncluded), isPaymentSummary: false })) };
  }
  if (receipt.schemaVersion === 1) return receipt;
  if (receipt.transactionType !== 'expense' || receipt.documentKind !== 'purchase' || receipt.paymentStatus !== 'completed'
    || receipt.paymentDetails || receipt.rows.some(row => row.isPaymentSummary || (row.affectsTotal === false && !(row.kind === 'tax' && row.taxIncluded)))) return null;
  return { schemaVersion: 1, merchant: receipt.merchant, rows: receipt.rows.map(({ affectsTotal: _a,isPaymentSummary: _s,requiresCountingReview: _r,feeParty:_p,...row }) => row),
    totalCents: receipt.totalDebitedCents ?? null, computedTotalCents: sumItemCents(receipt.rows), matchesTotal: receipt.matchesTotal,
    droppedRowCount: receipt.droppedRowCount, cappedRowCount: receipt.cappedRowCount };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function ocrScanPath(userId: string, scanId: string): string {
  return `${userId}/${scanId}.txt`;
}

function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function decodeBase64(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function validateImagePayload(body: unknown): ImagePayloadResult {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'invalid_request' };
  const { imageBase64, mimeType, requestId } = body as Record<string, unknown>;
  if (
    typeof imageBase64 !== 'string' ||
    typeof mimeType !== 'string' ||
    imageBase64.length === 0 ||
    !isUuid(requestId)
  ) {
    return { ok: false, error: 'invalid_request' };
  }
  if (!isAllowedImageType(mimeType)) return { ok: false, error: 'unsupported_type' };
  if (imageBase64.length > MAX_BASE64_LENGTH) return { ok: false, error: 'too_large' };

  const bytes = decodeBase64(imageBase64);
  if (!bytes) return { ok: false, error: 'invalid_request' };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: 'too_large' };
  if (sniffImageType(bytes) !== mimeType) return { ok: false, error: 'type_mismatch' };

  return { ok: true, imageBase64, bytes, mimeType, requestId };
}

export function clampOcrText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_OCR_TEXT_CHARS) return { text, truncated: false };
  let end = MAX_OCR_TEXT_CHARS;
  // Don't cut an emoji (two UTF-16 units) in half.
  const lastCode = text.charCodeAt(end - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) end -= 1;
  return { text: text.slice(0, end), truncated: true };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

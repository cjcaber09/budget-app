import { decimalToCents, validItem, type TransactionItemInput, type TransactionItemKind } from '../../supabase/functions/ocr/shared';
import { createRequestId } from './ocr';
export interface ItemDraft {
  affectsTotal: boolean;
  isPaymentSummary: boolean;
  requiresCountingReview: boolean;
  feeParty: 'sender'|'recipient'|'unknown'|null;
  id: string;
  kind: TransactionItemKind;
  label: string;
  amount: string;
  negative: boolean;
  quantity: string | null;
  unitPriceCents: number | null;
  taxIncluded: boolean;
}
export function draftItem(row?: TransactionItemInput): ItemDraft {
  return { id: createRequestId(), kind: row?.kind ?? 'item', label: row?.label ?? '',
    affectsTotal: row?.affectsTotal ?? true, isPaymentSummary: row?.isPaymentSummary ?? false, requiresCountingReview: row?.requiresCountingReview ?? false, feeParty: row?.feeParty ?? null,
    amount: row ? (Math.abs(row.amountCents) / 100).toFixed(2) : '', negative: (row?.amountCents ?? 0) < 0,
    quantity: row?.quantity ?? null, unitPriceCents: row?.unitPriceCents ?? null, taxIncluded: row?.taxIncluded ?? false };
}
export function parseItemDrafts(drafts: ItemDraft[]): { rows: TransactionItemInput[]; error: string | null } {
  const rows: TransactionItemInput[] = [];
  if (drafts.length > 100) return { rows, error: 'A transaction can have up to 100 rows.' };
  for (const [index, draft] of drafts.entries()) {
    if (draft.requiresCountingReview) return { rows:[],error:`Row ${index+1}: choose whether this charge affects your total.` };
    const magnitude = /^(?:\d+)(?:\.\d{0,2})?$/.test(draft.amount) ? decimalToCents(draft.amount) : null;
    const row: TransactionItemInput = { kind: draft.kind, label: draft.label.trim(),
      amountCents: magnitude === null ? NaN : draft.kind === 'adjustment' && draft.negative ? -magnitude : magnitude,
      quantity: draft.quantity, unitPriceCents: draft.unitPriceCents, taxIncluded: draft.taxIncluded };
    if (draft.affectsTotal !== true || draft.isPaymentSummary || draft.feeParty) Object.assign(row,{affectsTotal:draft.affectsTotal,isPaymentSummary:draft.isPaymentSummary,feeParty:draft.feeParty});
    if (!validItem(row)) return { rows: [], error: `Row ${index + 1}: enter a label (up to 200 characters) and a valid amount with up to two decimal places.` };
    rows.push(row);
  }
  return { rows, error: null };
}

import {isUuid} from '../../supabase/functions/ocr/shared';
import type {Transaction} from '../types/database';

export type BalanceActivityKind = 'transaction' | 'transfer' | 'refund' | 'correction';
export interface BalanceActivity {kind: BalanceActivityKind; id: string}
export interface ActivityAccountBalance {
  methodId: string; name: string; method: string; paymentType: string;
  state: 'applied' | 'unset' | 'opening' | 'scheduled';
  beforeCents: number | null; afterCents: number | null; changeCents: number;
}
export interface ActivityBalance extends BalanceActivity {accounts: ActivityAccountBalance[]}
export const balanceActivityKey = (entry: BalanceActivity) => `${entry.kind}:${entry.id}`;
export function transactionBalanceActivity(transaction: Pick<Transaction,'id'|'type'|'transfer_id'>): BalanceActivity {
  return transaction.transfer_id ? {kind:'transfer',id:transaction.transfer_id} : {kind:transaction.type==='refund'?'refund':'transaction',id:transaction.id};
}

function exactCents(value: unknown): number {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid balance amount.');
  const cents = BigInt(value);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Balance exceeds the supported range.');
  return Number(cents);
}

export function decodeActivityBalances(value: unknown, context: {owner: string; timezone: string; today: string}, requested: BalanceActivity[]): ActivityBalance[] {
  const data = value as Record<string, unknown> | null;
  const fail = (): never => {throw new Error('Account balance history could not be read. Retry.');};
  if (!data || data.owner !== context.owner || data.timezone !== context.timezone || data.today !== context.today || data.reconciled !== true || !Array.isArray(data.rows)) return fail();
  const expected = new Set(requested.map(balanceActivityKey));
  if (data.rows.length !== expected.size || data.rows.length > 100) return fail();
  const seen = new Set<string>();
  return data.rows.map(value => {
    const row = value as ActivityBalance;
    if (!row) return fail();
    const key = balanceActivityKey(row);
    if (!expected.has(key) || seen.has(key) || !isUuid(row.id) || !Array.isArray(row.accounts) || row.accounts.length > (row.kind === 'transfer' ? 2 : 1)) return fail();
    seen.add(key);
    const methods = new Set<string>();
    const accounts = row.accounts.map(value => {
      const account = value as unknown as Record<string, unknown>;
      if (!account || !isUuid(account.methodId) || methods.has(account.methodId) || typeof account.name !== 'string' || !account.name || typeof account.paymentType !== 'string' || !['cash','card','bank_account','wallet','other'].includes(String(account.method)) || !['applied','unset','opening','scheduled'].includes(String(account.state))) return fail();
      methods.add(account.methodId);
      const changeCents = exactCents(account.changeCents);
      let beforeCents: number | null = null, afterCents: number | null = null;
      if (account.state === 'applied') {
        beforeCents = exactCents(account.beforeCents); afterCents = exactCents(account.afterCents);
        if (BigInt(beforeCents) + BigInt(changeCents) !== BigInt(afterCents)) return fail();
      } else if (account.beforeCents !== null || account.afterCents !== null) return fail();
      return {...account, beforeCents, afterCents, changeCents} as unknown as ActivityAccountBalance;
    });
    return {kind: row.kind, id: row.id, accounts};
  });
}

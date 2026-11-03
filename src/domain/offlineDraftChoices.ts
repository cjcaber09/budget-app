import type {Category} from '../types/database';
import type {IncomeSource} from '../hooks/useIncomeSources';
import type {PaymentMethod} from './paymentMethods';
import {currencies, type Currency} from '../stores/usePreferencesStore';
import {isUuid} from '../../supabase/functions/ocr/shared';
import {DATE_FORMATS,type DateFormat} from './dateFormat';

export type DraftMethod = Pick<PaymentMethod, 'id' | 'user_id' | 'method' | 'name' | 'payment_type' | 'last_four' | 'archived'>;
export interface OfflineDraftChoices {
  version: 1; owner: string; savedAt: string; currency: Currency; timezone: string; dateFormat?:DateFormat;
  categories: Category[]; methods: DraftMethod[]; sources: IncomeSource[];
}
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
export function decodeOfflineDraftChoices(raw: string, owner: string): OfflineDraftChoices {
  if (raw.length > 2000000) throw new Error('Saved choices are too large.');
  const d = JSON.parse(raw) as OfflineDraftChoices;
  if (d?.version !== 1 || d.owner !== owner || !isUuid(owner) || !text(d.savedAt, 50) || !Number.isFinite(Date.parse(d.savedAt)) || !currencies.includes(d.currency) || !text(d.timezone, 100)) throw new Error('Saved choices could not be read.');
  new Intl.DateTimeFormat('en', {timeZone: d.timezone}).format(new Date());
  if(d.dateFormat!==undefined&&!DATE_FORMATS.includes(d.dateFormat))throw new Error('Saved date format could not be read.');
  for (const rows of [d.categories, d.methods, d.sources]) {
    if (!Array.isArray(rows) || rows.length > 5000 || rows.some(row => !row || row.user_id !== owner || !isUuid(row.id) || !text(row.name, 200)) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Saved choices could not be read.');
  }
  if (d.categories.some(c => !/^#[a-f\d]{6}$/i.test(c.color) || !text(c.icon, 100) || typeof c.is_default !== 'boolean') ||
    d.methods.some(m => !['cash', 'card', 'bank_account', 'wallet', 'other'].includes(m.method) || !text(m.payment_type, 100) || !(m.last_four === null || typeof m.last_four === 'string' && /^\d{4}$/.test(m.last_four)) || typeof m.archived !== 'boolean') ||
    d.sources.some(s => typeof s.archived !== 'boolean')) throw new Error('Saved choices could not be read.');
  // Whitelist labels and IDs. Never cache balances, activity, files or auth here.
  return {version: 1, owner, savedAt: d.savedAt, currency: d.currency, timezone: d.timezone,...(d.dateFormat?{dateFormat:d.dateFormat}:{}),
    categories: d.categories.map(c => ({id:c.id,user_id:owner,name:c.name,color:c.color,icon:c.icon,is_default:c.is_default})),
    methods: d.methods.map(m => ({id:m.id,user_id:owner,method:m.method,name:m.name,payment_type:m.payment_type,last_four:m.last_four,archived:m.archived})),
    sources: d.sources.map(s => ({id:s.id,user_id:owner,name:s.name,archived:s.archived}))};
}

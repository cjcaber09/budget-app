import {decimalToCents,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';
export type PaymentMethodKind='cash'|'card'|'bank_account'|'wallet'|'other';
export interface PaymentMethod {
  id:string;user_id:string;method:PaymentMethodKind;payment_type:string;name:string;last_four:string|null;
  opening_balance:string|null;baseline_at:string|null;archived:boolean;balance:string|null;
  has_activity:boolean;related_bills:{id:string;label:string}[];
}
export interface PaymentMethodValues {id:string;method:PaymentMethodKind;paymentType:string;name:string;lastFour:string;openingBalance:string;confirmOpening?:boolean}
export interface PaymentTransfer {id:string;source_id:string;destination_id:string;amount:string;transfer_date:string;note:string|null}
export interface BalanceCorrection {id:string;method_id:string;target_balance:string;delta:string;note:string|null;created_at:string}
export function isCreditCard(value:Pick<PaymentMethod,'method'|'payment_type'>) {return value.method==='card'&&value.payment_type==='Credit card';}
export const CARD_PRIVACY_NOTE='We store only the optional last four digits of your card. Never enter your full card number, PIN, or CVV.';
export function paymentMethodLabel(value:Pick<PaymentMethod,'name'|'payment_type'|'last_four'>) {
  return `${value.name} · ${value.payment_type}${value.last_four?` · ****${value.last_four}`:''}`;
}
export function validatePaymentMethod(value:PaymentMethodValues) {
  if(!value.name.trim()||value.name.trim().length>100)return 'Enter a name or bank up to 100 characters.';
  if(!value.paymentType.trim()||value.paymentType.trim().length>80)return 'Enter a payment type up to 80 characters.';
  if(/(?:\d[ -]?){13,}/.test(value.name+ ' '+value.paymentType))return 'Use a bank or account name, not a full card number.';
  if(value.lastFour&&!/^\d{4}$/.test(value.lastFour))return 'Enter exactly four digits, or leave the last digits blank.';
  const cents=/^-?\d+(?:\.\d{0,2})?$/.test(value.openingBalance)?decimalToCents(value.openingBalance):null;
  if(cents===null||Math.abs(cents)>MAX_MONEY_CENTS)return 'Enter a valid initial balance with up to two decimal places.';
  if(value.method==='card'&&!['Debit card','Prepaid card','Credit card'].includes(value.paymentType))return 'Choose Debit card, Prepaid card or Credit card.';
  if(value.method==='card'&&value.paymentType==='Credit card'&&cents<0)return 'Enter the amount owed as zero or a positive value.';
  return null;
}

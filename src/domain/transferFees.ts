import {centsToDecimal,decimalToCents,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';

export type TransferFeeMode = 'added'|'deducted';
function inputCents(value:string) {
  return /^\d+(?:\.\d{0,2})?$/.test(value)?decimalToCents(value):null;
}
/** Input amount is what the user enters; persisted principal is always received money. */
export function transferAmounts(amount:string,fee:string,mode:TransferFeeMode) {
  if(mode!=='added'&&mode!=='deducted')return null;
  const entered=inputCents(amount),charge=inputCents(fee||'0');
  if(entered===null||charge===null||entered<=0||charge<0||entered>MAX_MONEY_CENTS||charge>MAX_MONEY_CENTS) return null;
  const received=mode==='deducted'?entered-charge:entered;
  const deducted=received+charge;
  if(received<=0||deducted>MAX_MONEY_CENTS||!Number.isSafeInteger(deducted))return null;
  return {entered,fee:charge,received,deducted};
}
export function transferEnteredAmount(principal:string,fee='0.00',mode:TransferFeeMode='added') {
  if(mode!=='added'&&mode!=='deducted')throw new Error('Transfer fee mode could not be read. Refresh and retry.');
  const received=inputCents(principal),charge=inputCents(fee);
  if(received===null||charge===null||received<=0||received+charge>MAX_MONEY_CENTS)throw new Error('Transfer amounts could not be read. Refresh and retry.');
  return centsToDecimal(mode==='deducted'?received+charge:received);
}

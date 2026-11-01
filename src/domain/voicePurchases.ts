import type {VoiceProposal} from '../../supabase/functions/voice-entry/shared';
import {decimalToCents,centsToDecimal,sumItemCents,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';
import {draftItem,parseItemDrafts,type ItemDraft} from './itemDrafts';
import type {TransactionDraftFields} from './transactionDraft';
export function voicePurchaseSummary(rows:ItemDraft[],currency:string):string{
 if(!rows.length)return '';
 const parsed=parseItemDrafts(rows),total=sumItemCents(parsed.rows,'expense');
 const ending=parsed.error||total<=0||total>MAX_MONEY_CENTS?'Total pending price review.':`Total ${currency} ${centsToDecimal(total)}.`;
 const labels=rows.map(r=>(r.label.trim()||'Unnamed item').replace(/(?:\d[ -]?){13,}/g,'[redacted]')+(r.quantity&&Number(r.quantity)!==1?` ×${r.quantity}`:''));
 let names='';let included=0;
 for(const label of labels){const next=names?names+', '+label:label;const remaining=labels.length-included-1;const suffix=remaining?` (+${remaining} more items)`:'';
  if(`Purchases: ${next}${suffix}. ${ending}`.length>1000)break;
  names=next;included++;
 }
 return `Purchases: ${names}${included<labels.length?` (+${labels.length-included} more items)`:''}. ${ending}`;
}
export function voicePurchaseDraft(proposal:VoiceProposal):TransactionDraftFields|null{
 if(proposal.intent!=='entry'||proposal.type!=='expense'||!proposal.purchases?.length)return null;
 const drafts=proposal.purchases.map(p=>({...draftItem(),label:p.label,amount:p.amount,quantity:p.quantity,unitPriceCents:p.unitPrice===null?null:decimalToCents(p.unitPrice)}));
 return {voicePurchase:{noteMode:'auto'},type:'expense',amount:proposal.amount,note:voicePurchaseSummary(drafts,proposal.currency),categoryId:proposal.categoryId??'',paymentMethodId:proposal.paymentMethodId,incomeSourceId:null,transactionDate:proposal.date,drafts,
  ...(proposal.reviewFields?.includes('paymentMethod')?{reviewRequired:{paymentMethod:true,incomeSource:false}}:{})};
}

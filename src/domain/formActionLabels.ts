export function incomeSourceActionLabel(saving:boolean,retrying:boolean,editing:boolean){
 if(saving)return 'Saving…';
 if(retrying)return 'Retry save';
 if(editing)return 'Save name';
 return 'Create source';
}
export function paymentMethodActionLabel(saving:boolean,editing:boolean){
 if(saving)return 'Saving…';
 if(editing)return 'Save payment method';
 return 'Create payment method';
}
export function setupActionLabel(saving:boolean,refresh:boolean,step:number,confirmCurrency:boolean){
 if(saving)return 'Saving…';
 if(refresh)return 'Refresh saved values';
 if(step===4)return 'Finish setup';
 if(step===0&&confirmCurrency)return 'Confirm currency & continue';
 return 'Continue';
}
export function transferActionLabel(saving:boolean,editing:boolean){
 if(saving)return 'Saving…';
 if(editing)return 'Save transfer changes';
 return 'Record transfer';
}
export function itemCountingStatus(reviewRequired:boolean,affectsTotal:boolean){
 if(reviewRequired)return 'Choose whether this row affects the total.';
 if(affectsTotal)return 'Counted in total';
 return 'Informational — excluded from total';
}

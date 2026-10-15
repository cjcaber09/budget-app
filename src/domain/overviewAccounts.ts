import {isCreditCard,paymentBalanceCents,type PaymentMethod} from './paymentMethods';

export const ACCOUNT_GRADIENTS = [
 ['#064E3B','#047857'],['#1E3A8A','#1D4ED8'],['#4C1D95','#7C3AED'],
 ['#831843','#BE185D'],['#78350F','#B45309'],['#134E4A','#0F766E'],
] as const;

export function accountGradient(method:PaymentMethod){
 let hash=0;for(const char of method.id)hash=(Math.imul(hash,31)+char.charCodeAt(0))|0;
 return ACCOUNT_GRADIENTS[method.method==='cash'?0:1+(hash>>>0)%5];
}
export function cashContributor(method:PaymentMethod){
 return !method.archived&&(method.method==='cash'||method.method==='bank_account'||method.method==='wallet'||method.method==='card'&&['Debit card','Prepaid card'].includes(method.payment_type));
}
export function accountBalance(method:PaymentMethod):{label:string;cents:number|null;state:'ready'|'unset'|'invalid'}{
 if(method.balance===null)return {label:'Balance not set',cents:null,state:'unset'};
 const cents=paymentBalanceCents(method.balance);
 if(cents===null)return {label:'Balance unavailable',cents:null,state:'invalid'};
 if(isCreditCard(method))return {label:cents>0?'Credit balance':'Amount owed',cents:Math.abs(cents),state:'ready'};
 return {label:'Current balance',cents,state:'ready'};
}
export function orderedAccounts(methods:PaymentMethod[],owner:string){
 return methods.filter(m=>m.user_id===owner&&!m.archived).sort((a,b)=>Number(b.method==='cash')-Number(a.method==='cash')||a.name.toLowerCase().localeCompare(b.name.toLowerCase())||a.id.localeCompare(b.id));
}
export function nextAccountId(ids:string[],current:string|undefined,direction:number){
 if(!ids.length)return undefined;
 const index=Math.max(0,ids.indexOf(current??''));
 return ids[(index+direction%ids.length+ids.length)%ids.length];
}
export function survivingAccountId(ids:string[],previous:string[],selected:string|undefined){
 if(selected&&ids.includes(selected))return selected;
 const start=previous.indexOf(selected??'');
 if(start>=0){for(let step=1;step<=previous.length;step++){const id=previous[(start+step)%previous.length];if(ids.includes(id))return id;}}
 return ids[0];
}
export function deckAccounts(methods:PaymentMethod[],selected:string|undefined){
 const index=Math.max(0,methods.findIndex(m=>m.id===selected));
 return Array.from({length:Math.min(4,methods.length)},(_,depth)=>({method:methods[(index+depth)%methods.length],depth}));
}

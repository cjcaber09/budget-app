// Import-free validation shared by the Edge Function, client and Jest.
export const VOICE_MAX_BYTES=2*1024*1024;
export interface VoiceChoice {id:string;name:string}
export interface VoiceChoices {categories:VoiceChoice[];methods:VoiceChoice[];sources:VoiceChoice[]}
export interface VoicePurchase {
 label:string;amount:string;quantity:string|null;unitPrice:string|null;priceNeedsReview:boolean;
 date:string|null;currency:string|null;paymentMethod:string|null;categoryId:string|null;type:'expense'|'income'|null;
}
export type VoiceGroupingIssue='incompatible_context'|'unsupported_adjustment'|'unclear_context'|'too_many_purchases';
export interface VoiceProposal {
 intent:'entry'|'transfer'|'multiple'|'unclear';transcript:string;type:'income'|'expense'|null;
 amount:string;date:string;currency:string;note:string;categoryId:string|null;paymentMethodId:string|null;incomeSourceId:string|null;
 unresolved:string[];
 reviewFields?:('paymentMethod'|'incomeSource')[];
 purchases?:VoicePurchase[];
 groupingIssue?:VoiceGroupingIssue|null;
 categoryNeedsReview?:boolean;
}
export function validVoiceDay(day:unknown):day is string{
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 const date=new Date(day+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day;
}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function validateLegacyProposal(value:unknown,choices:VoiceChoices,day:string,currency:string):VoiceProposal{
 const v=value as VoiceProposal;
 if(!v||!['entry','transfer','multiple','unclear'].includes(v.intent)||typeof v.transcript!=='string'||v.transcript.length>6000||typeof v.note!=='string'||v.note.length>1000||!['income','expense',null].includes(v.type)||typeof v.amount!=='string'||v.amount.length>40||typeof v.currency!=='string'||v.currency.length>3||!Array.isArray(v.unresolved)||v.unresolved.some(s=>typeof s!=='string'||s.length>120)||v.unresolved.length>12)throw new Error('Voice response could not be read. Record again or enter manually.');
 const warnings=[...v.unresolved];
 if(v.reviewFields!==undefined&&(!Array.isArray(v.reviewFields)||v.reviewFields.length>2||v.reviewFields.some(f=>f!=='paymentMethod'&&f!=='incomeSource')))throw new Error('Voice review requirements could not be read.');
 const reviewFields=new Set<'paymentMethod'|'incomeSource'>(Array.isArray(v.reviewFields)?v.reviewFields.filter(f=>f==='paymentMethod'||f==='incomeSource'):[]);
 let amount=v.amount;
 if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>9999999999.99){amount='';warnings.push('Enter a clear positive amount.');}
 if(v.currency&&v.currency!==currency){amount='';warnings.push('Spoken currency differs from your profile. Enter the amount in your profile currency.');}
 const pick=(id:unknown,list:VoiceChoice[],label:string,field?:'paymentMethod'|'incomeSource')=>{if(id===null){return null;}if(!uuid(id)||!list.some(c=>c.id===id)){warnings.push(`Choose ${label}.`);if(field){reviewFields.add(field);}return null;}return id;};
 const categoryId=pick(v.categoryId,choices.categories,'a category');
 const paymentMethodId=pick(v.paymentMethodId,choices.methods,'a payment method','paymentMethod');
 const incomeSourceId=v.type==='expense'?null:pick(v.incomeSourceId,choices.sources,'an income source','incomeSource');
 if(v.type==='expense'){reviewFields.delete('incomeSource');}
 if(!validVoiceDay(v.date))warnings.push('Date was unclear; using the day recording started.');
 return {intent:v.intent,transcript:v.transcript,type:v.type,amount,date:validVoiceDay(v.date)?v.date:day,currency,note:v.note.replace(/(?:\d[ -]?){13,}/g,'[redacted]'),categoryId,paymentMethodId,incomeSourceId,unresolved:[...new Set(warnings)],...(reviewFields.size?{reviewFields:[...reviewFields]}:{})};
}
const MAX_CENTS=999999999999;
const redact=(text:string)=>text.replace(/(?:\d[ -]?){13,}/g,'[redacted]');
export function voiceMoneyCents(value:string):number|null{
 if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return cents<=MAX_CENTS?cents:null;
}
export function voiceDecimal(cents:number){return `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;}
export function voiceFingerprintInput(id:string,context:string,audioHash:string,version:1|2){
 const legacy=id+':'+context+':'+audioHash;
 return version===1?legacy:'voice-proposal-v2:'+legacy;
}
function purchaseShape(p:VoicePurchase){
 if(!p||typeof p.label!=='string'||[...p.label].length>200||typeof p.amount!=='string'||p.amount.length>40||typeof p.priceNeedsReview!=='boolean'||![null,'expense','income'].includes(p.type))return false;
 return (['quantity','unitPrice','date','currency','paymentMethod','categoryId'] as const).every(field=>p[field]===null||typeof p[field]==='string'&&p[field]!.length<=120);
}
function quantityValue(value:string|null){
 if(value===null)return null;
 return /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(value)&&Number(value)>0?value:null;
}
function quantityLineAmount(quantity:string,unit:number){
 const [whole,fraction='']=quantity.split('.');const thousandths=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
 const computed=(thousandths*BigInt(unit)+500n)/1000n;
 return computed>BigInt(MAX_CENTS)?null:Number(computed);
}
function purchasePrice(p:VoicePurchase,warnings:string[],index:number){
 const quantity=quantityValue(p.quantity),unit=p.unitPrice===null?null:voiceMoneyCents(p.unitPrice);
 let amount=voiceMoneyCents(p.amount);
 const invalid=p.priceNeedsReview||quantity!==p.quantity||p.unitPrice!==null&&unit===null;
 if(invalid)amount=null;
 else if(quantity!==null&&unit!==null){
  const computed=quantityLineAmount(quantity,unit);
  if(computed===null||p.amount!==''&&amount!==computed){amount=null;warnings.push('Item '+(index+1)+': unit and line prices disagree.');}
  else amount=computed;
 }
 return {amount,quantity,unit};
}
function normalizePurchase(value:unknown,warnings:string[],index:number):VoicePurchase{
 const p=value as VoicePurchase;if(!purchaseShape(p))throw new Error('Invalid purchase details.');
 const label=redact(p.label.trim()),{amount,quantity,unit}=purchasePrice(p,warnings,index);
 if(!label||amount===null)warnings.push('Item '+(index+1)+': enter a description and clear line price.');
 // Only label/price/quantity enter drafts; context stays in memory.
 return {label,amount:amount===null?'':voiceDecimal(amount),priceNeedsReview:amount===null,quantity,unitPrice:unit===null?null:voiceDecimal(unit),date:p.date,currency:p.currency,paymentMethod:p.paymentMethod===null?null:redact(p.paymentMethod),categoryId:p.categoryId,type:p.type};
}
function methodContext(value:string,choices:VoiceChoices){
 const normalized=value.trim().toLocaleLowerCase();const matches=choices.methods.filter(m=>m.id===value||m.name.trim().toLocaleLowerCase()===normalized);
 if(normalized==='cash'||matches.length===1&&matches[0].name.trim().toLocaleLowerCase()==='cash')return {key:'cash',id:null,matched:true};
 return matches.length===1?{key:matches[0].id,id:matches[0].id,matched:true}:{key:'unmatched:'+normalized,id:null,matched:false};
}
function groupContext(purchases:VoicePurchase[],raw:VoiceProposal,base:VoiceProposal,choices:VoiceChoices,currency:string){
 const dates=new Set(purchases.map(p=>p.date).filter(v=>v!==null));
 const currencies=new Set(purchases.map(p=>p.currency).filter(v=>v!==null));
 const methods=purchases.filter(p=>p.paymentMethod!==null).map(p=>methodContext(p.paymentMethod!,choices));
 if(raw.paymentMethodId&&base.paymentMethodId)methods.push(methodContext(base.paymentMethodId,choices));
 let issue=raw.groupingIssue??null;
 const conflicting=dates.size>1||currencies.size>1||[...currencies].some(c=>c!==currency)||!!raw.currency&&raw.currency!==currency||new Set(methods.map(m=>m.key)).size>1||purchases.some(p=>p.type==='income')||purchases.length>0&&raw.type!=='expense';
 if(!issue&&conflicting)issue='incompatible_context';
 if(!issue&&[...dates].some(d=>!validVoiceDay(d)))issue='unclear_context';
 return {issue,date:dates.size===1?[...dates][0]!:base.date,method:methods[0]};
}
function purchaseCategory(purchases:VoicePurchase[],base:VoiceProposal,choices:VoiceChoices,warnings:string[]){
 const ids=new Set(purchases.map(p=>p.categoryId).filter(id=>id!==null));
 const invalid=[...ids].some(id=>!choices.categories.some(c=>c.id===id));
 if(ids.size>1||invalid){warnings.push('Choose one category for this combined expense.');return null;}
 return ids.size===1?[...ids][0]:base.categoryId;
}
function purchaseTotal(purchases:VoicePurchase[],spoken:string,warnings:string[]){
 const cents=purchases.map(p=>voiceMoneyCents(p.amount));
 const total=cents.reduce<number>((sum,n)=>sum+(n??0),0);
 if(cents.some(n=>n===null)||purchases.some(p=>!p.label))return '';
 if(total>MAX_CENTS||total<=0){warnings.push('Items must total a positive amount within the supported range.');return '';}
 const stated=voiceMoneyCents(spoken);
 if(stated!==null&&stated!==total)warnings.push('Spoken total differs from the items. Review the calculated total.');
 return voiceDecimal(total);
}
export function validateVoiceProposal(value:unknown,choices:VoiceChoices,day:string,currency:string,version:1|2=1):VoiceProposal{
 if(version===1)return validateLegacyProposal(value,choices,day,currency);
 const raw=value as VoiceProposal;
 if(!raw||!Array.isArray(raw.purchases)||raw.purchases.length>20||!Object.prototype.hasOwnProperty.call(raw,'groupingIssue')||![null,'incompatible_context','unsupported_adjustment','unclear_context','too_many_purchases'].includes(raw.groupingIssue??null)||raw.categoryNeedsReview!==undefined&&typeof raw.categoryNeedsReview!=='boolean')throw new Error('Invalid purchase list.');
 const base=validateLegacyProposal(raw.purchases.length?{...raw,amount:'1.00'}:raw,choices,day,currency);
 const warnings=[...base.unresolved],purchases=raw.purchases.map((p,i)=>normalizePurchase(p,warnings,i));
 const context=groupContext(purchases,raw,base,choices,currency);
 if(context.issue)return {...base,intent:context.issue==='incompatible_context'?'multiple':'unclear',amount:'',purchases:[],groupingIssue:context.issue,unresolved:[...new Set(warnings)].slice(0,12)};
 if(!purchases.length)return {...base,purchases:[],groupingIssue:null};
 const inferredCategory=purchaseCategory(purchases,base,choices,warnings),categoryNeedsReview=raw.categoryNeedsReview||inferredCategory===null;
 const categoryId=categoryNeedsReview?null:inferredCategory,reviewFields=new Set(base.reviewFields??[]);
 if(context.method&&!context.method.matched){reviewFields.add('paymentMethod');warnings.push('Choose the payment method mentioned in your recording.');}
 const amount=purchaseTotal(purchases,raw.amount,warnings);
 const ownedPurchases=purchases.map(p=>({...p,categoryId:choices.categories.some(c=>c.id===p.categoryId)?p.categoryId:null}));
 return {...base,amount,date:context.date,categoryId,categoryNeedsReview,paymentMethodId:context.method?context.method.id:base.paymentMethodId,incomeSourceId:null,purchases:ownedPurchases,groupingIssue:null,unresolved:[...new Set(warnings)].slice(0,12),...(reviewFields.size?{reviewFields:[...reviewFields]}:{})};
}
export function decodeVoiceAudio(base64:unknown):Uint8Array{
 if(typeof base64!=='string'||base64.length>Math.ceil(VOICE_MAX_BYTES/3)*4||!base64.length||base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('Invalid recording.');
 const raw=atob(base64);if(raw.length>VOICE_MAX_BYTES||raw.length<12)throw new Error('Invalid recording.');
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw new Error('Record a new M4A audio clip.');
 return bytes;
}

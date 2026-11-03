import {decodeVoiceAudio,validateVoiceProposal,VOICE_MAX_BYTES,type VoiceProposal} from '../../supabase/functions/voice-entry/shared';
const category='00000000-0000-4000-8000-000000000001';
const choices={categories:[{id:category,name:'Food'}],methods:[],sources:[]};
const proposal:VoiceProposal={intent:'entry',transcript:'Gumastos ako ng 150 sa food kahapon.',type:'expense',amount:'150.00',date:'2026-10-31',currency:'PHP',note:'Food',categoryId:category,paymentMethodId:null,incomeSourceId:null,unresolved:[]};
test('preserves exact money and provided owner choices',()=>{expect(validateVoiceProposal(proposal,choices,'2026-11-01','PHP')).toEqual(proposal);});
test('unknown IDs and conflicting currency require correction',()=>{
 const result=validateVoiceProposal({...proposal,currency:'USD',categoryId:'00000000-0000-4000-8000-000000000002'},choices,'2026-11-01','PHP');
 expect(result.amount).toBe('');expect(result.categoryId).toBeNull();expect(result.unresolved).toHaveLength(2);
});
test.each(['1e3','-2','0','1.234','99999999999.99'])('rejects unsafe money %s',amount=>{expect(validateVoiceProposal({...proposal,amount},choices,'2026-11-01','PHP').amount).toBe('');});
test('preserves unsupported transfer intent for explicit rejection and does not invent direction',()=>{expect(validateVoiceProposal({...proposal,intent:'transfer',type:null},choices,'2026-11-01','PHP')).toMatchObject({intent:'transfer',type:null});});
test('invalid dates fall back visibly and bounded output is mandatory',()=>{
 expect(validateVoiceProposal({...proposal,date:'2026-02-30'},choices,'2026-11-01','PHP').date).toBe('2026-11-01');
 expect(()=>validateVoiceProposal({...proposal,transcript:'x'.repeat(6001)},choices,'2026-11-01','PHP')).toThrow();
});
test('validates transport size, base64, and M4A signature',()=>{
 expect(()=>decodeVoiceAudio('!')).toThrow();expect(()=>decodeVoiceAudio('A'.repeat(Math.ceil(VOICE_MAX_BYTES/3)*4+4))).toThrow();
 expect(()=>decodeVoiceAudio(btoa('not a recording'))).toThrow();
 expect(decodeVoiceAudio(btoa('\0\0\0\x18ftypM4A '))).toHaveLength(12);
});

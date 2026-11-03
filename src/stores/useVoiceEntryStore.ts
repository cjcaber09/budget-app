import {create} from 'zustand';
import type {VoiceProposal} from '../../supabase/functions/voice-entry/shared';
export interface VoiceEntryContext {owner:string;visit:string;startedAt:string;day:string;timezone:string;currency:string;generation:number;draftGeneration:number}
export interface PendingVoiceEntry {context:VoiceEntryContext;proposal:VoiceProposal}
export const useVoiceEntryStore=create<{pending:PendingVoiceEntry|null;set:(pending:PendingVoiceEntry|null)=>void}>(set=>({pending:null,set:pending=>set({pending})}));

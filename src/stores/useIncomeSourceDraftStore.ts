import {create} from 'zustand';
import type {SaveIncomeSource} from '../hooks/useIncomeSources';
export interface SourceDraft {id:string;name:string;pending?:SaveIncomeSource}
export const useIncomeSourceDraftStore=create<{drafts:Record<string,SourceDraft>;set:(owner:string,draft:SourceDraft)=>void;clear:(owner?:string)=>void}>(set=>({
 drafts:{},
 set:(owner,draft)=>set(s=>({drafts:{...s.drafts,[owner]:draft}})),
 clear:owner=>set(s=>{if(!owner)return {drafts:{}};const drafts={...s.drafts};delete drafts[owner];return {drafts};}),
}));

import {useCallback,useState} from 'react';
import {Linking,Text,View} from 'react-native';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Paperclip,Trash2,ExternalLink,RotateCcw} from 'lucide-react-native';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {pickProofFile,uploadProof,proofMatches,type ProofParent,type ProofFile,type SavedAttachment} from '../lib/transactionAttachments';
import {prepareProofImage} from '../lib/prepareProofImage';
import {createRequestId} from '../domain/ocr';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';

export function useProofDraft(){
 const currentOwner=usePreferencesStore(s=>s.profile?.user_id);
 const [owner,setOwner]=useState(currentOwner);
 // Defaults can arrive after a deep-linked form mounts. Bind once, never to a second owner.
 if(!owner&&currentOwner)setOwner(currentOwner);
 const [file,setFile]=useState<ProofFile|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [savedId,setSavedId]=useState<string|null>(null);
 const [savedKind,setSavedKind]=useState<ProofParent['kind']>('transaction');
 const client=useQueryClient();
 const upload=async(id:string,kind:ProofParent['kind']=savedKind)=>{
  setSavedKind(kind);
  setSavedId(id);setBusy(true);setError(null);
  try{if(!owner||usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('Sign in again.');if(!file)return true;await uploadProof({kind,id},file,owner);await client.invalidateQueries({queryKey:['attachments',owner,kind,id]});setFile(null);return true;}
  catch(e){setError(e instanceof Error?e.message:'Could not upload the attachment.');return false;}
  finally{setBusy(false);}
 };
 const choose=async()=>{setBusy(true);setError(null);try{const picked=await pickProofFile();if(picked&&usePreferencesStore.getState().profile?.user_id===owner)setFile(picked);}catch(e){setError(e instanceof Error?e.message:'Could not read the file.');}finally{setBusy(false);}};
 const prepareScan=useCallback(async(uri:string)=>{setBusy(true);setError(null);try{const image=await prepareProofImage(uri,'Receipt');if(usePreferencesStore.getState().profile?.user_id===owner)setFile({id:createRequestId(),...image});}catch{setError('Could not prepare the receipt image. Attach it again or continue without it.');}finally{setBusy(false);}},[owner]);
 return {file,busy,error,savedId,choose,upload,prepareScan,clear:()=>{setFile(null);setError(null);}};
}
export function ProofPicker({draft,disabled=false}:Readonly<{draft:ReturnType<typeof useProofDraft>;disabled?:boolean}>){
 const form=useFormStyles(),colors=useColors();
 return <View style={{gap:8}}><Text style={form.label}>Attachment (optional)</Text>
  <MotionPressable accessibilityLabel="Add attachment" disabled={disabled||draft.busy} style={[form.secondaryButton,{flexDirection:'row',gap:8,justifyContent:'center'}]} onPress={()=>void draft.choose()}><Paperclip size={18} color={colors.primary}/><Text style={form.chipTextSelected}>{draft.busy?'Preparing file…':draft.file?'Replace file':'Attach image or PDF'}</Text></MotionPressable>
  {draft.file&&<View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={[form.subtitle,{flex:1}]}>{draft.file.name} · {Math.ceil(draft.file.bytes.length/1024)} KB</Text><MotionPressable accessibilityLabel="Remove selected attachment" disabled={disabled||draft.busy} onPress={draft.clear} style={{minHeight:48,minWidth:48,alignItems:'center',justifyContent:'center'}}><Trash2 size={18} color={colors.danger}/></MotionPressable></View>}
  {draft.error&&<Text accessibilityRole="alert" style={form.error}>{draft.error}</Text>}
 </View>;
}
export function AttachmentRetry({draft,onDone}:Readonly<{draft:ReturnType<typeof useProofDraft>;onDone:()=>void}>){
 const form=useFormStyles(),colors=useColors();
 return <View style={{gap:12}}><Text style={form.subtitle}>Transaction saved. Your attachment has not been uploaded.</Text>{draft.error&&<Text accessibilityRole="alert" style={form.error}>{draft.error}</Text>}
 <MotionPressable disabled={draft.busy} style={[form.button,{flexDirection:'row',gap:8,justifyContent:'center'}]} onPress={()=>{if(draft.savedId)void draft.upload(draft.savedId).then(ok=>{if(ok)onDone();});}}><RotateCcw size={18} color={colors.onPrimary}/><Text style={form.buttonText}>{draft.busy?'Uploading…':'Retry attachment'}</Text></MotionPressable>
 <MotionPressable disabled={draft.busy} style={form.secondaryButton} onPress={onDone}><Text style={form.chipTextSelected}>Finish without attachment</Text></MotionPressable></View>;
}
export function SavedAttachments({transactionId,transferId}:Readonly<{transactionId?:string;transferId?:string}>){
 const parent:ProofParent={kind:transferId?'transfer':'transaction',id:transferId??transactionId!};
 const owner=usePreferencesStore(s=>s.profile?.user_id),form=useFormStyles(),colors=useColors(),client=useQueryClient();
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[deleting,setDeleting]=useState<string|null>(null);
 const query=useQuery({queryKey:['attachments',owner,parent.kind,parent.id],enabled:!!owner&&!!parent.id,queryFn:async()=>{const r=await supabase.from('transaction_attachments').select('*').eq('user_id',owner!).eq(parent.kind==='transfer'?'transfer_id':'transaction_id',parent.id).order('created_at');if(r.error||!r.data?.every((row:SavedAttachment)=>proofMatches(row,parent,owner!)))throw new Error('Could not load attachments.');return r.data as SavedAttachment[];}});
 const action=async(row:SavedAttachment,remove=false)=>{setBusy(true);setError(null);try{
  if(usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('Sign in again.');
  if(remove){const r=await supabase.rpc('delete_transaction_attachment',{p_id:row.id});if(r.error)throw new Error('Could not remove the attachment.');setDeleting(null);await client.invalidateQueries({queryKey:['attachments',owner,parent.kind,parent.id]});}
  else {const r=await supabase.storage.from('budget-tracker-proofs').createSignedUrl(row.object_path,60);if(r.error||!r.data?.signedUrl)throw new Error('Could not open the attachment.');if(usePreferencesStore.getState().profile?.user_id!==owner)return;await Linking.openURL(r.data.signedUrl);}
 }catch(e){setError(e instanceof Error?e.message:'Could not change the attachment.');}finally{setBusy(false);}};
 return <View style={{gap:8}}>{query.isError&&<MotionPressable onPress={()=>void query.refetch()}><Text style={form.error}>Could not load attachments. Retry</Text></MotionPressable>}
 {(query.data??[]).map(row=><View key={row.id}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><MotionPressable disabled={busy||row.status!=='ready'} accessibilityLabel={`Open attachment ${row.file_name}`} style={{flex:1,minHeight:48,flexDirection:'row',alignItems:'center',gap:8}} onPress={()=>void action(row)}><ExternalLink size={18} color={colors.primary}/><Text style={[form.subtitle,{flex:1}]}>{row.file_name}{row.status==='pending'?' · Upload incomplete':''}</Text></MotionPressable><MotionPressable disabled={busy} accessibilityLabel={`Delete attachment ${row.file_name}`} onPress={()=>setDeleting(row.id)} style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}}><Trash2 size={18} color={colors.danger}/></MotionPressable></View>{deleting===row.id&&<View style={{flexDirection:'row',gap:12}}><MotionPressable disabled={busy} style={[form.secondaryButton,{flex:1}]} onPress={()=>void action(row,true)}><Text style={form.chipTextSelected}>Remove file</Text></MotionPressable><MotionPressable disabled={busy} style={[form.secondaryButton,{flex:1}]} onPress={()=>setDeleting(null)}><Text style={form.chipTextSelected}>Keep file</Text></MotionPressable></View>}</View>)}
 {error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}</View>;
}

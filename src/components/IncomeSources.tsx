import {useState,useRef,useEffect,type ReactNode} from 'react';
import {Modal,View,Text,TextInput,ScrollView} from 'react-native';
import {useIncomeSources,useSaveIncomeSource,type IncomeSource,type SaveIncomeSource} from '../hooks/useIncomeSources';
import {useIncomeSourceDraftStore} from '../stores/useIncomeSourceDraftStore';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {createRequestId} from '../domain/ocr';
import {useFormStyles} from '../styles/forms';
import {useColors,type} from '../styles/theme';
import {usePageLayout} from '../styles/pageLayout';
import {MotionPressable} from './MotionPressable';
import {QueryState} from './QueryState';

function SourceForm({source,onSaved,onCancel}:{source?:IncomeSource;onSaved:(s:IncomeSource)=>void;onCancel:()=>void}) {
 const form=useFormStyles(),owner=usePreferencesStore(s=>s.profile?.user_id)??'';
 const existingDraft=useIncomeSourceDraftStore(s=>s.drafts[owner]);
 const [local,setLocal]=useState(()=>({id:source?.id??existingDraft?.id??createRequestId(),name:source?.name??existingDraft?.name??'',pending:source?undefined:existingDraft?.pending}));
 const save=useSaveIncomeSource();const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const draft=(next:typeof local)=>{setLocal(next);if(!source)useIncomeSourceDraftStore.getState().set(owner,next);};
 return <View>
  <Text style={form.title}>{source?'Edit income source':'Add income source'}</Text>
  <Text style={form.subtitle}>Use a name such as Salary, Freelance, or Refund. Receipt sender details do not select a source automatically.</Text>
  <TextInput accessibilityLabel="Income source name" placeholder="Salary" style={form.input} value={local.name} maxLength={80} editable={!save.isPending&&!local.pending} onChangeText={name=>draft({...local,name})}/>
  {local.pending&&save.isError&&<Text style={form.subtitle}>Retry this name to confirm whether it saved. You can rename the source afterward.</Text>}
  {save.isError&&<Text accessibilityRole="alert" style={form.error}>{save.error.message}</Text>}
  <MotionPressable style={form.button} disabled={save.isPending||!local.name.trim()} onPress={()=>{
   const input:SaveIncomeSource=local.pending??{id:local.id,operation:source?'rename':'create',name:local.name.trim()};
   if(!source)draft({...local,pending:input});
   save.mutate(input,{onSuccess:s=>{if(!source)useIncomeSourceDraftStore.getState().clear(owner);if(alive.current&&s.user_id===usePreferencesStore.getState().profile?.user_id)onSaved(s);}});
  }}><Text style={form.buttonText}>{save.isPending?'Saving…':local.pending?'Retry save':source?'Save name':'Create source'}</Text></MotionPressable>
  {source&&<MotionPressable style={form.secondaryButton} disabled={save.isPending} onPress={()=>save.mutate({id:source.id,operation:source.archived?'restore':'archive'},{onSuccess:s=>{if(alive.current&&s.user_id===usePreferencesStore.getState().profile?.user_id)onSaved(s);}})}><Text style={form.chipTextSelected}>{source.archived?'Restore source':'Archive source'}</Text></MotionPressable>}
  <MotionPressable style={form.secondaryButton} onPress={onCancel}><Text style={form.chipTextSelected}>Close</Text></MotionPressable>
 </View>;
}
function SourceModal({children,onClose}:{children:ReactNode;onClose:()=>void}) {
 const colors=useColors(),page=usePageLayout({safeTop:true});
 return <Modal transparent animationType="none" onRequestClose={onClose}><View style={{flex:1,backgroundColor:colors.scrim,justifyContent:'flex-end'}}><ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:'90%',backgroundColor:colors.surface,borderTopLeftRadius:16,borderTopRightRadius:16}} contentContainerStyle={[page.scrollContent,{paddingBottom:40}]}><View style={{width:'100%',maxWidth:560}}>{children}</View></ScrollView></View></Modal>;
}
export function IncomeSourcePicker({value,onChange}:{value:string|null;onChange:(id:string|null)=>void}) {
 const q=useIncomeSources(),form=useFormStyles();
 const [mode,setMode]=useState<'closed'|'pick'|'create'>('closed');const active=useRef(mode);const changeMode=(next:typeof mode)=>{active.current=next;setMode(next);};
 const [message,setMessage]=useState('');
 const selected=q.data?.find(s=>s.id===value);
 return <View>
  <Text style={form.label}>Income source</Text>
  <MotionPressable accessibilityLabel="Choose income source" style={form.secondaryButton} onPress={()=>changeMode('pick')}><Text style={form.chipTextSelected}>{value?selected?selected.name+(selected.archived?' · Archived':''):'Saved source · loading name':'Unspecified'}</Text></MotionPressable>
  {q.isError&&<View><Text accessibilityRole="alert" style={form.error}>{q.error.message}</Text><MotionPressable style={form.secondaryButton} onPress={()=>void q.refetch()}><Text style={form.chipTextSelected}>Retry sources</Text></MotionPressable></View>}
  {!!message&&<Text accessibilityRole="alert" style={form.error}>{message}</Text>}
  {mode!=='closed'&&<SourceModal onClose={()=>changeMode('closed')}>{mode==='create'?<SourceForm onCancel={()=>changeMode('pick')} onSaved={s=>{if(active.current!=='create')return;if(s.archived){setMessage('This source is archived. Restore it in Settings or choose another.');changeMode('pick');return;}onChange(s.id);changeMode('closed');}}/>:<View>
   <Text style={form.title}>Choose income source</Text>
   {selected?.archived&&<Text style={form.subtitle}>Current source: {selected.name} · Archived. It stays assigned unless you replace or clear it.</Text>}
   <MotionPressable style={form.secondaryButton} onPress={()=>{onChange(null);changeMode('closed');}}><Text style={form.chipTextSelected}>Unspecified · clear source</Text></MotionPressable>
   <QueryState loading={q.isPending} error={q.isError} retry={()=>void q.refetch()}>{q.data?.filter(s=>!s.archived).map(s=><MotionPressable key={s.id} style={form.secondaryButton} onPress={()=>{onChange(s.id);setMessage('');changeMode('closed');}}><Text style={form.chipTextSelected}>{s.name}</Text></MotionPressable>)}</QueryState>
   <MotionPressable style={form.button} onPress={()=>changeMode('create')}><Text style={form.buttonText}>Add income source</Text></MotionPressable>
   <MotionPressable style={form.secondaryButton} onPress={()=>changeMode('closed')}><Text style={form.chipTextSelected}>Close</Text></MotionPressable>
  </View>}</SourceModal>}
 </View>;
}
export function IncomeSourcesSettings() {
 const q=useIncomeSources(),form=useFormStyles(),colors=useColors();
 const [editing,setEditing]=useState<IncomeSource|'new'|null>(null);
 return <View>
  <Text accessibilityRole="header" style={form.title}>Income sources</Text><Text style={form.subtitle}>Organize income without changing its amount. Archived sources remain in history.</Text>
  <QueryState loading={q.isPending} error={q.isError} retry={()=>void q.refetch()}>{q.data?.map(s=><MotionPressable key={s.id} accessibilityLabel={'Edit income source '+s.name} style={{minHeight:48,paddingVertical:14,borderBottomWidth:1,borderBottomColor:colors.border}} onPress={()=>setEditing(s)}><Text style={{...type.body,color:colors.text}}>{s.name}{s.archived?' · Archived':''}</Text></MotionPressable>)}</QueryState>
  <MotionPressable style={form.button} onPress={()=>setEditing('new')}><Text style={form.buttonText}>Add income source</Text></MotionPressable>
  {editing&&<SourceModal onClose={()=>setEditing(null)}><SourceForm key={editing==='new'?'new':editing.id} source={editing==='new'?undefined:editing} onSaved={()=>setEditing(null)} onCancel={()=>setEditing(null)}/></SourceModal>}
 </View>;
}

import {useEffect,useState,type ReactNode} from 'react';
import {Text,View} from 'react-native';
import {useFormStyles} from '../styles/forms';
import {usePageLayout} from '../styles/pageLayout';
import {loadTransactionDraft,clearTransactionDraft} from '../lib/transactionDraftStorage';
import type {EntryDraft} from '../domain/transferDraft';
import {MotionPressable} from './MotionPressable';

export function TransactionDraftRecovery({owner,children}:{owner:string;children:(draft:EntryDraft|null)=>ReactNode}) {
 const [state,setState]=useState<{loading:boolean;draft:EntryDraft|null;chosen:boolean;error:string}>({loading:true,draft:null,chosen:false,error:''});
 const [confirmDiscard,setConfirmDiscard]=useState(false);
 const form=useFormStyles(),layout=usePageLayout();
 useEffect(()=>{let alive=true;void loadTransactionDraft(owner).then(draft=>{if(alive)setState({loading:false,draft,chosen:!draft,error:''});}).catch(()=>{if(alive)setState({loading:false,draft:null,chosen:false,error:'Could not read your saved draft. Retry, or discard the local draft.'});});return()=>{alive=false;};},[owner]);
 async function retry(){setState(s=>({...s,loading:true}));try{const draft=await loadTransactionDraft(owner);setState({loading:false,draft,chosen:!draft,error:''});}catch{setState(s=>({...s,loading:false,error:'Could not read your saved draft. Retry, or discard the local draft.'}));}}
 async function discard(){try{await clearTransactionDraft(owner);setState({loading:false,draft:null,chosen:true,error:''});}catch{setState(s=>({...s,error:'Could not discard the draft. Retry before starting another transaction.'}));}}
 if(state.chosen)return <>{children(state.draft)}</>;
 return <View style={layout.screen}><View style={layout.card}>
  <Text style={form.title}>{state.loading?'Checking for a draft…':'Unfinished transaction'}</Text>
  {state.draft&&<><Text style={form.subtitle}>{state.draft.version===2?'Transfer':state.draft.fields.type==='income'?'Income':'Expense'} · {state.draft.version===2?state.draft.fields.date:state.draft.fields.transactionDate} · {state.draft.currency}</Text><Text style={form.subtitle}>{state.draft.fields.note||'Your unfinished entry is saved on this device.'}</Text></>}
  {!!state.error&&<Text accessibilityRole="alert" style={form.error}>{state.error}</Text>}
  {state.draft?.pending&&<Text style={form.subtitle}>A save was attempted. Resume to retry the same entry or check whether it saved.</Text>}
  {state.draft&&!confirmDiscard&&<MotionPressable disabled={state.loading} style={form.button} onPress={()=>setState(s=>({...s,chosen:true}))}><Text style={form.buttonText}>Resume draft</Text></MotionPressable>}
  {!!state.error&&<MotionPressable disabled={state.loading} style={form.secondaryButton} onPress={()=>void retry()}><Text style={form.chipTextSelected}>Retry draft recovery</Text></MotionPressable>}
  {confirmDiscard&&<Text style={form.subtitle}>Discard the local draft? An already saved transaction will remain. If a save was attempted, check Transactions before recording it again.</Text>}
  {!state.loading&&<MotionPressable style={form.secondaryButton} onPress={()=>{if(!confirmDiscard)setConfirmDiscard(true);else void discard();}}><Text style={form.secondaryText}>{confirmDiscard?'Confirm discard draft':'Discard draft'}</Text></MotionPressable>}
  {confirmDiscard&&<MotionPressable style={form.secondaryButton} onPress={()=>setConfirmDiscard(false)}><Text style={form.chipTextSelected}>Keep draft</Text></MotionPressable>}
 </View></View>;
}

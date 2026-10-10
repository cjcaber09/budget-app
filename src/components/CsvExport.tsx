import {useState,useRef,useEffect} from 'react';
import {Text} from 'react-native';
import {addMonths,format,parseISO} from 'date-fns';
import {supabase} from '../lib/supabase';
import {shareCsv} from '../lib/exportFiles';
import {analysisCsv,transactionCsv,type TransactionFilter} from '../domain/csv';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFormStyles} from '../styles/forms';
import {MotionPressable} from './MotionPressable';
import {ActionSheet} from './ActionSheet';

type Props={month:string;kind:'analysis'|'transactions';filter?:TransactionFilter;search?:string};
export function CsvExport(props:Props){
 const p=usePreferencesStore(s=>s.profile);
 return <CsvExportContent key={JSON.stringify([p?.user_id,p?.timezone,p?.currency,props.month,props.kind,props.filter,props.search])} {...props}/>;
}
function CsvExportContent({month,kind,filter='all',search=''}:Props) {
 const form=useFormStyles(),profile=usePreferencesStore(s=>s.profile);
 const [open,setOpen]=useState(false),[months,setMonths]=useState<1|12>(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<{csv:string;count:number}|null>(null);
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const start=months===12?format(addMonths(parseISO(month),-11),'yyyy-MM-01'):month;
 const twelveStart=format(addMonths(parseISO(month),-11),'yyyy-MM-01');
 async function exportCsv(){
  if(!profile||busy)return;
  const current=()=>alive.current&&profile.user_id===usePreferencesStore.getState().profile?.user_id&&profile.timezone===usePreferencesStore.getState().profile?.timezone&&profile.currency===usePreferencesStore.getState().profile?.currency;
  setBusy(true);setError('');
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
   let response;
   try{response=await (kind==='analysis'?supabase.rpc('report_export_snapshot',{p_start_month:start,p_end_month:month}):supabase.rpc('transaction_export_snapshot',{p_month:month})).abortSignal(controller.signal);}finally{clearTimeout(timer);}
   if(response.error)throw new Error('Could not prepare the export. Check your connection and retry.');
   if(!current())return;
   const ctx={owner:profile.user_id,start:kind==='analysis'?start:month,end:month,timezone:profile.timezone,currency:profile.currency};
   if(kind==='transactions'){
    const result=transactionCsv(response.data,ctx,filter,search);
    setPreview(result);return;
   }
   const csv=analysisCsv(response.data,ctx);
   await shareCsv(csv,`budget-spending-${start.slice(0,7)}-${month.slice(0,7)}.csv`,current);
   if(current())setOpen(false);
  }catch(e){if(current())setError(e instanceof Error?e.message:'Export failed. Please retry.');}
  finally{if(alive.current)setBusy(false);}
 }
 async function shareTransactions(){
  if(!preview||busy)return;const current=()=>alive.current&&profile?.user_id===usePreferencesStore.getState().profile?.user_id;setBusy(true);setError('');
  try{await shareCsv(preview.csv,`budget-transactions-${month.slice(0,7)}.csv`,current);if(current()){setOpen(false);setPreview(null);}}
  catch(e){if(current())setError(e instanceof Error?e.message:'Sharing failed. Please retry.');}finally{if(alive.current)setBusy(false);}
 }
 return <>
  <MotionPressable style={form.secondaryButton} disabled={!profile||busy} onPress={()=>{setError('');setPreview(null);setOpen(true);}}><Text style={form.chipTextSelected}>Export CSV</Text></MotionPressable>
  <ActionSheet title={kind==='analysis'?'Export spending analysis':'Export transactions'} visible={open} busy={busy} onClose={()=>{setOpen(false);setPreview(null);}}>
   <Text style={form.subtitle}>{kind==='analysis'?'Monthly totals, category breakdowns and account spending with expense counts.':'Individual income and expense records, including your notes. Receipt contents and sender details are excluded.'}</Text>
   {kind==='analysis'&&<>
    <MotionPressable style={[form.chip,months===1&&form.chipSelected]} disabled={busy} onPress={()=>setMonths(1)} accessibilityRole="radio" accessibilityState={{checked:months===1}}><Text style={form.chipTextSelected}>Selected month</Text></MotionPressable>
    <MotionPressable style={[form.chip,months===12&&form.chipSelected]} disabled={busy||twelveStart<'0001-12-01'} onPress={()=>setMonths(12)} accessibilityRole="radio" accessibilityState={{checked:months===12}}><Text style={form.chipTextSelected}>Last 12 months</Text></MotionPressable>
   </>}
   <Text style={form.label}>{kind==='analysis'?start.slice(0,7):month.slice(0,7)}{kind==='analysis'&&months===12?` through ${month.slice(0,7)}`:''}</Text>
   <Text style={form.subtitle}>Includes recorded future-dated entries. Transfers, opening balances and corrections are excluded.</Text>
   {kind==='transactions'&&<Text style={form.subtitle}>Filter: {filter==='all'?'All':filter==='expense'?'Expenses':'Income'}{search.trim()?` · Search: ${search.trim()}`:''}{preview?` · ${preview.count} matching entries`:''}</Text>}
   {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
   <MotionPressable style={form.button} disabled={busy} onPress={()=>void (preview?shareTransactions():exportCsv())}><Text style={form.buttonText}>{busy?'Preparing…':preview?'Share CSV':kind==='transactions'?'Prepare export':'Export spending CSV'}</Text></MotionPressable>
  </ActionSheet>
 </>;
}

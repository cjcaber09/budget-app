import {useEffect,useRef,useState} from 'react';
import {Keyboard,Modal,ScrollView,Text,TextInput,View} from 'react-native';
import {useFocusedFieldScroll} from '../hooks/useFocusedFieldScroll';
import {useRouter} from 'expo-router';
import {usePreferencesStore,currencies,type Currency} from '../stores/usePreferencesStore';
import {useSetupGuideStore,openSetupGuide} from '../stores/useSetupGuideStore';
import {loadSetupProgress,saveSetupProgress} from '../lib/setupProgress';
import {useProfile,useUpdateProfile} from '../hooks/useProfile';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {useInitializeCash} from '../hooks/useInitializeCash';
import {useDashboard,useSetMonthlyLimit} from '../hooks/useDashboard';
import {useBudgets,useSetBudget} from '../hooks/useBudgets';
import {useCategories} from '../hooks/useCategories';
import {localDateKey} from '../domain/transactionDates';
import {useMoneyCents} from '../domain/money';
import {decimalToCents,centsToDecimal,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';
import {createRequestId} from '../domain/ocr';
import {useFormStyles} from '../styles/forms';
import {useColors,type} from '../styles/theme';
import {useHelpBlocker} from '../stores/useHelpStore';
import {useUpdateBlocker} from '../stores/useUpdateSafetyStore';
import {KeyboardViewport} from './KeyboardViewport';
import {MotionPressable} from './MotionPressable';
import {MoneyInput} from './MoneyInput';
import {CategoryPicker} from './CategoryPicker';
import {QueryState} from './QueryState';

export function SetupPrompt({needsBudget=false}:{needsBudget?:boolean}){
 const profile=usePreferencesStore(s=>s.profile),state=useSetupGuideStore(),methods=usePaymentMethods(),form=useFormStyles();
 const needsCash=methods.methods?.some(m=>!m.archived&&m.method==='cash'&&m.opening_balance===null);
 if(!profile||state.owner!==profile.user_id||!state.loaded||state.completed||!needsBudget&&!needsCash)return null;
 return <View style={{gap:8}}><Text style={form.label}>Set up your budget</Text><Text style={form.subtitle}>Choose your settings, starting balances and monthly plan.</Text><MotionPressable style={form.secondaryButton} onPress={()=>openSetupGuide(profile.user_id)}><Text style={form.chipTextSelected}>Continue setup</Text></MotionPressable></View>;
}
export function SetupGuide(){
 const owner=usePreferencesStore(s=>s.profile?.user_id),state=useSetupGuideStore();
 const [mountedOwner,setMountedOwner]=useState<string|null>(null);
 if(state.visible&&owner&&mountedOwner!==owner)setMountedOwner(owner);
 useEffect(()=>{if(!owner)return;void loadSetupProgress(owner).catch(()=>{if(usePreferencesStore.getState().profile?.user_id===owner)useSetupGuideStore.setState({owner,loaded:true,step:0,completed:false});});},[owner]);
 useHelpBlocker('setup-guide',state.visible);
 if(!owner||state.owner!==owner||mountedOwner!==owner)return null;
 return <GuideContent key={owner} owner={owner}/>;
}
const titles=['Currency & timezone','Starting balances','Monthly budget','Category allocations','Your first transaction'];
function GuideContent({owner}:{owner:string}){
 const profile=usePreferencesStore(s=>s.profile)!,state=useSetupGuideStore(),form=useFormStyles(),colors=useColors(),router=useRouter(),money=useMoneyCents();
 const preferences=useProfile(),update=useUpdateProfile(),methods=usePaymentMethods(),cashSave=useInitializeCash();
 const month=localDateKey(new Date(),profile.timezone).slice(0,7)+'-01',dashboard=useDashboard(month),limit=useSetMonthlyLimit(month),categories=useCategories(),budgets=useBudgets(month),categorySave=useSetBudget();
 const [currency,setCurrency]=useState<Currency>(profile.currency),[timezone,setTimezone]=useState(profile.timezone),[confirmCurrency,setConfirmCurrency]=useState(false);
 const [cashAmount,setCashAmount]=useState(''),[monthlyAmount,setMonthlyAmount]=useState(''),[categoryAmount,setCategoryAmount]=useState(''),[categoryId,setCategoryId]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState<'cash'|'monthly'|'category'|null>(null);
 const alive=useRef(true),sending=useRef(false);
 const focusedScroll=useFocusedFieldScroll(state.visible);
 useEffect(()=>()=>{alive.current=false;},[]);
 useEffect(()=>{focusedScroll.ref.current?.scrollTo({y:0,animated:false});},[state.step,focusedScroll.ref]);
 useUpdateBlocker(state.visible||busy);
 const current=()=>alive.current&&usePreferencesStore.getState().profile?.user_id===owner;
 const cash=methods.methods?.find(m=>m.user_id===owner&&m.method==='cash'&&!m.archived);
 const close=()=>{if(!sending.current)useSetupGuideStore.setState({visible:false});};
 async function move(step:number,completed=false){
   if(!current())return;Keyboard.dismiss();useSetupGuideStore.setState({step,completed});setError('');
   try{await saveSetupProgress(owner,step,completed);if(completed&&current())useSetupGuideStore.setState({visible:false});}catch{if(current())setError('Financial changes were kept, but setup progress could not save. Retry Continue.');}
 }
 async function run(task:()=>Promise<void>){if(sending.current)return;sending.current=true;setBusy(true);setError('');try{await task();}catch(e){if(current())setError(e instanceof Error?e.message:'Could not save. Your input is still here.');}finally{sending.current=false;if(current())setBusy(false);}}
 function amount(value:string){const cents=/^\d+(?:\.\d{0,2})?$/.test(value)?decimalToCents(value):null;if(cents===null||cents<0||cents>MAX_MONEY_CENTS)throw new Error('Enter zero or more with up to two decimal places.');return cents;}
 async function refreshAfterSave(kind:'cash'|'monthly'|'category'){
   const results=await Promise.all(kind==='cash'?[methods.refetch()]:kind==='monthly'?[dashboard.refetch()]:[budgets.refetch(),dashboard.refetch()]);
   if(!current())return false;
   if(results.some(r=>r.isError)){setRefresh(kind);throw new Error('Saved. Refresh to confirm the latest values before continuing.');}
   setRefresh(null);return true;
 }
 async function next(){await run(async()=>{
   if(refresh){const kind=refresh;if(await refreshAfterSave(kind)&&kind!=='category')await move(kind==='cash'?2:3);return;}
   if(state.step===0){
     try{new Intl.DateTimeFormat('en',{timeZone:timezone.trim()}).format(new Date());}catch{throw new Error('Enter a valid timezone, such as Asia/Manila.');}
     if(currency!==profile.currency&&!confirmCurrency){setConfirmCurrency(true);return;}
     if(!preferences.isSuccess)throw new Error('Refresh saved preferences before changing setup settings.');
     await update.mutateAsync({currency,timezone:timezone.trim()});if(current())await move(1);
   }else if(state.step===1){
     if(methods.isError||!cash)throw new Error('Refresh payment methods before setting a balance.');
     if(cash.opening_balance===null){amount(cashAmount);try{await cashSave.mutateAsync({methodId:cash.id,amount:cashAmount});}catch(e){setRefresh('cash');throw e;}if(!await refreshAfterSave('cash'))return;}
     await move(2);
   }else if(state.step===2){
     if(dashboard.isError||!dashboard.data)throw new Error('Refresh the monthly budget before saving.');
     if(monthlyAmount||dashboard.data.limitCents===null){const cents=amount(monthlyAmount);if(cents<dashboard.data.allocatedCents)throw new Error('Reduce category allocations before lowering the monthly budget.');await limit.mutateAsync(centsToDecimal(cents));if(!await refreshAfterSave('monthly'))return;}
     await move(3);
   }else if(state.step===3){await move(4);}else await move(4,true);
 });}
 return <Modal visible={state.visible} transparent animationType="none" onRequestClose={close}><KeyboardViewport visible={state.visible} style={{backgroundColor:colors.scrim,justifyContent:'center'}}><View accessibilityViewIsModal style={{backgroundColor:colors.surface,borderRadius:16,maxHeight:'90%',width:'100%',maxWidth:560,alignSelf:'center'}}>
 <ScrollView {...focusedScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:16}}>
  <Text style={{...type.label,color:colors.muted}}>Setup · Step {state.step+1} of 5</Text><Text accessibilityRole="header" style={{...type.heading,color:colors.text}}>{titles[state.step]}</Text>
  {state.step===0&&<><Text style={form.subtitle}>Amounts use one currency. Changing it relabels values without conversion. The timezone sets your financial dates.</Text><View style={form.optionRow}>{currencies.map(c=><MotionPressable key={c} disabled={busy} style={[form.chip,currency===c&&form.chipSelected]} onPress={()=>{setCurrency(c);setConfirmCurrency(false);}}><Text style={currency===c?form.chipTextSelected:form.chipText}>{c}</Text></MotionPressable>)}</View><Text style={form.label}>Financial timezone</Text><TextInput accessibilityLabel="Setup financial timezone" editable={!busy} value={timezone} onChangeText={setTimezone} style={form.input} autoCapitalize="none"/>{confirmCurrency&&<Text style={form.subtitle}>Confirm changing all amount labels from {profile.currency} to {currency}. Existing numbers will stay the same.</Text>}{preferences.isError&&<MotionPressable style={form.secondaryButton} onPress={()=>void preferences.refetch()}><Text style={form.chipTextSelected}>Retry preferences</Text></MotionPressable>}</>}
  {state.step===1&&<QueryState loading={methods.isPending} error={methods.isError} retry={()=>void methods.refetch()}><Text style={form.subtitle}>Set the cash you have now. Existing starting balances are kept. You can add bank accounts, wallets and cards in Settings → Sources.</Text>{cash?.opening_balance===null?<><Text style={form.label}>Starting Cash balance</Text><MoneyInput accessibilityLabel="Setup starting Cash balance" editable={!busy&&!refresh} value={cashAmount} onChangeText={setCashAmount} style={form.input} keyboardType="decimal-pad"/></>:cash&&<Text style={form.subtitle}>Cash already has a starting balance. It will not be overwritten.</Text>}</QueryState>}
  {state.step===2&&<QueryState loading={dashboard.isPending} error={dashboard.isError} retry={()=>void dashboard.refetch()}><Text style={form.subtitle}>Plan your combined spending for {month.slice(0,7)}. Category allocations share this cap.</Text><Text style={form.subtitle}>Current monthly budget: {dashboard.data?.limitCents==null?'Not set':money(dashboard.data.limitCents)}</Text><MoneyInput accessibilityLabel="Setup monthly budget" editable={!busy&&!refresh} value={monthlyAmount} onChangeText={setMonthlyAmount} style={form.input} keyboardType="decimal-pad" placeholder="Enter a budget, or keep the saved amount"/></QueryState>}
  {state.step===3&&<QueryState loading={categories.isPending||budgets.isPending||dashboard.isPending} error={categories.isError||budgets.isError||dashboard.isError} retry={()=>{void categories.refetch();void budgets.refetch();void dashboard.refetch();}}><Text style={form.subtitle}>Divide your monthly budget between categories. You can adjust allocations later in Reports.</Text><CategoryPicker compact categories={(categories.data??[]).filter(c=>c.user_id===owner)} value={categoryId} onChange={id=>{setCategoryId(id);setCategoryAmount('');}}/><Text style={form.label}>Category budget · {profile.currency}</Text><MoneyInput accessibilityLabel="Setup category budget" editable={!busy&&!refresh} value={categoryAmount} onChangeText={setCategoryAmount} style={form.input} keyboardType="decimal-pad"/><MotionPressable disabled={busy||!!refresh} style={form.secondaryButton} onPress={()=>void run(async()=>{if(!categoryId)throw new Error('Choose a category.');const cents=amount(categoryAmount);await categorySave.mutateAsync({categoryId,month,amount:cents/100});if(await refreshAfterSave('category')&&current())setCategoryAmount('');})}><Text style={form.chipTextSelected}>Save category allocation</Text></MotionPressable><Text style={form.subtitle}>Allocated: {money(dashboard.data?.allocatedCents??0)}. Category budgets are optional; the monthly cap still applies.</Text></QueryState>}
  {state.step===4&&<><Text style={form.subtitle}>Add income or an expense and review it before saving. Receipt scanning and proof files are optional. You can also save a manual draft offline.</Text><MotionPressable disabled={busy} style={form.secondaryButton} onPress={()=>{close();router.push({pathname:'/transaction/new',params:{visit:createRequestId()}});}}><Text style={form.chipTextSelected}>Add my first transaction</Text></MotionPressable></>}
  {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
  <MotionPressable disabled={busy} style={form.button} onPress={()=>void next()}><Text style={form.buttonText}>{busy?'Saving…':refresh?'Refresh saved values':state.step===4?'Finish setup':state.step===0&&confirmCurrency?'Confirm currency & continue':'Continue'}</Text></MotionPressable>
  {state.step>0&&<MotionPressable disabled={busy||!!refresh} style={form.secondaryButton} onPress={()=>void move(state.step-1)}><Text style={form.chipTextSelected}>Previous step</Text></MotionPressable>}
  <MotionPressable disabled={busy} style={form.secondaryButton} onPress={close}><Text style={form.chipTextSelected}>Continue later</Text></MotionPressable>
 </ScrollView></View></KeyboardViewport></Modal>;
}

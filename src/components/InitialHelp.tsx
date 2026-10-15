import {KeyboardViewport} from './KeyboardViewport';
import {useFocusedFieldScroll} from '../hooks/useFocusedFieldScroll';
import {useContext,useEffect,useRef,useState} from 'react';
import {Image,Modal,ScrollView,Text,View} from 'react-native';
import {SafeAreaInsetsContext} from 'react-native-safe-area-context';
import {usePathname} from 'expo-router';
import {useReducedMotion} from 'react-native-reanimated';
import {ArrowLeft,ArrowRight,Check,X} from 'lucide-react-native';
import {useHelpStore} from '../stores/useHelpStore';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFinancialResetStore} from '../stores/useFinancialResetStore';
import {useAccountDeletionStore} from '../stores/useAccountDeletionStore';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {useProfile} from '../hooks/useProfile';
import {useInitializeCash} from '../hooks/useInitializeCash';
import {useToastStore} from '../stores/useToastStore';
import {useFormStyles} from '../styles/forms';
import {type,useColors,useThemeMode} from '../styles/theme';
import {MotionPressable} from './MotionPressable';
import {MoneyInput} from './MoneyInput';
import {decimalToCents,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';

const TITLES=['Welcome to Budget Tracker','Record your money','Plan and review','Set your Cash'];
export function InitialHelp() {
  const owner=usePreferencesStore(s=>s.profile?.user_id);
  const epoch=useFinancialResetStore(s=>s.epoch);
  return owner?<HelpContent key={`${owner}:${epoch}`} owner={owner}/>:null;
}
function HelpContent({owner}:{owner:string}) {
  const help=useHelpStore(),query=usePaymentMethods(),profile=useProfile(),save=useInitializeCash();
  const preferences=usePreferencesStore(s=>s.profile);
  const reset=useFinancialResetStore(),path=usePathname();
  const deletion=useAccountDeletionStore();
  const colors=useColors(),form=useFormStyles(),dark=useThemeMode()==='dark',reduced=useReducedMotion();
  const insets=useContext(SafeAreaInsetsContext);
  const [started]=useState(()=>Date.now());
  const visibleLast=useRef(false),busy=useRef(false),alive=useRef(true);
  const [step,setStep]=useState(0),[amount,setAmount]=useState(''),[error,setError]=useState(''),[refreshNeeded,setRefreshNeeded]=useState(false);
  const cash=query.methods?.find(m=>m.method==='cash'&&!m.archived&&m.user_id===owner);
  const confirmed=query.isSuccess&&!query.isError&&query.dataUpdatedAt>=started&&!!cash;
  const preferenceReady=profile.isSuccess&&profile.data?.user_id===owner&&profile.data.currency===preferences?.currency&&profile.data.timezone===preferences?.timezone;
  const unset=confirmed&&cash.opening_balance===null&&cash.baseline_at===null;
  const paused=reset.starting||reset.pending?.owner===owner||deletion.starting||deletion.pending?.owner===owner;
  useEffect(()=>{
    useHelpStore.getState().reset(owner);
    alive.current=true;
    void query.refetch();
    return()=>{alive.current=false;useHelpStore.getState().reset();};
    // Fresh, owner-scoped confirmation is required for each mounted session/reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[owner]);
  useEffect(()=>{
    if(path==='/'&&preferenceReady&&unset&&!query.isFetching&&!paused&&!help.dismissed&&!help.visible&&!help.blockers.length)help.open();
  },[path,preferenceReady,unset,query.isFetching,paused,help]);
  const visible=help.visible&&!help.blockers.length&&!paused;
  useEffect(()=>{
    if(help.visible&&!visibleLast.current){setStep(0);setAmount('');setError('');setRefreshNeeded(false);}
    visibleLast.current=help.visible;
  },[help.visible]);
  const close=()=>{if(!busy.current)help.close();};
  const finish=(already=false)=>{
    help.close();
    useToastStore.getState().showToast(already?'Cash is already set. Your balance was kept.':'Cash is ready.');
  };
  async function refreshCash() {
    setError('');
    const next=await query.refetch();
    if(!alive.current||useHelpStore.getState().owner!==owner)return;
    const method=next.data?.owner===owner&&next.data.timezone===preferences?.timezone?next.data.methods.find(m=>m.method==='cash'&&m.user_id===owner&&!m.archived):undefined;
    if(next.isError||!method){setError('Could not refresh Cash. Check your connection and retry.');return;}
    if(method.opening_balance!==null){finish(true);return;}
    setRefreshNeeded(false);
  }
  async function submit() {
    if(busy.current||!unset||!preferenceReady||refreshNeeded)return;
    const cents=/^\d+(?:\.\d{0,2})?$/.test(amount)?decimalToCents(amount):null;
    if(cents===null||cents<0||cents>MAX_MONEY_CENTS){setError('Enter a Cash amount of zero or more, with up to two decimal places.');return;}
    busy.current=true;setError('');
    try {
      const result=await save.mutateAsync({methodId:cash.id,amount});
      if(alive.current&&useHelpStore.getState().owner===owner)finish(result.state==='already_initialized');
    } catch(issue) {
      if(!alive.current||useHelpStore.getState().owner!==owner)return;
      setError(issue instanceof Error?issue.message:'Could not confirm Cash setup. Refresh Cash before retrying.');
      setRefreshNeeded(true);
    } finally {busy.current=false;}
  }
  const scroll=useFocusedFieldScroll(visible);
  const total=confirmed&&!unset?3:4;
  const current=Math.min(step,total-1);
  return <Modal visible={visible} transparent animationType={reduced?'none':'slide'} onRequestClose={close}>
    <KeyboardViewport visible={visible} style={{backgroundColor:colors.scrim}}>
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={{backgroundColor:colors.surface,borderTopLeftRadius:16,borderTopRightRadius:16,width:'100%',maxWidth:560,maxHeight:'90%',alignSelf:'center',paddingBottom:Math.max(insets?.bottom??0,16)}}>
        <ScrollView {...scroll} style={{flexShrink:1}} automaticallyAdjustKeyboardInsets={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:16}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text accessibilityRole="header" style={{...type.heading,color:colors.text,flex:1}}>{TITLES[current]}</Text><MotionPressable accessibilityLabel="Close help" disabled={save.isPending} onPress={close} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><X size={20} color={colors.muted}/></MotionPressable></View>
          <Text accessibilityLiveRegion="polite" style={{...type.label,color:colors.muted}}>Step {current+1} of {total}</Text>
          {current===0&&<Text style={form.subtitle}>Track income, spending and bills in one place. Set a budget, record your money and see what remains.</Text>}
          {current===1&&<>
            <Text style={form.subtitle}>Tap + to add income or an expense.</Text>
            <Image source={dark?require('../../assets/images/help-entry-dark.webp'):require('../../assets/images/help-entry-light.webp')} resizeMode="contain" accessible={false} style={{width:'100%',aspectRatio:1.35,borderRadius:12}}/>
            <Text style={form.subtitle}>Take Photo or Upload Image reads a receipt. Review the amount and details before saving.</Text>
            <Text style={form.subtitle}>Manual Entry lets you enter the details yourself. Proof files are optional for income, expenses and bill payments.</Text>
          </>}
          {current===2&&<>
            <Text style={form.subtitle}>Set your monthly budget in Overview. Category budgets share this amount.</Text>
            <Text style={form.subtitle}>Safe to spend shows what remains after expenses and bills. Reports show where your money went.</Text>
          </>}
          {current===3&&<>
            <Text style={form.subtitle}>Enter the Cash you have available now. This sets today’s starting balance, without creating income or deducting old transactions again.</Text>
            {preferenceReady&&unset&&!refreshNeeded?<><Text style={form.label}>Cash available now ({preferences?.currency})</Text><MoneyInput accessibilityLabel="Cash available now" value={amount} onChangeText={setAmount} style={form.input} editable={!save.isPending} placeholder="0.00" placeholderTextColor={colors.subtle}/><Text style={form.subtitle}>No Cash? Enter 0.</Text></>:<Text style={form.subtitle}>{query.isFetching||profile.isPending?'Checking your Cash and currency…':'Refresh Cash and preferences before setup. Your draft is kept.'}</Text>}
          </>}
          {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
          <View style={{flexDirection:'row',gap:12}}>
            {current>0&&<MotionPressable accessibilityLabel="Back in help" style={[form.secondaryButton,{flex:1,marginTop:0,minHeight:52,flexDirection:'row',gap:8,justifyContent:'center'}]} disabled={save.isPending} onPress={()=>setStep(current-1)}><ArrowLeft size={16} color={colors.primary}/><Text style={form.chipTextSelected}>Back</Text></MotionPressable>}
            {current<total-1?<MotionPressable style={[form.button,{flex:1,marginTop:0,flexDirection:'row',gap:8,justifyContent:'center'}]} onPress={()=>setStep(current+1)}><Text style={form.buttonText}>Next</Text><ArrowRight size={16} color={colors.onPrimary}/></MotionPressable>:current===3?<MotionPressable style={[form.button,{flex:1,marginTop:0,flexDirection:'row',gap:8,justifyContent:'center'}]} disabled={save.isPending||query.isFetching||profile.isFetching} onPress={()=>{if(refreshNeeded||!unset||!preferenceReady){void profile.refetch();void refreshCash();}else void submit();}}><Check size={16} color={colors.onPrimary}/><Text style={form.buttonText}>{save.isPending?'Saving…':refreshNeeded||!unset||!preferenceReady?'Retry Cash setup':'Save Cash & finish'}</Text></MotionPressable>:<MotionPressable style={[form.button,{flex:1,marginTop:0}]} onPress={close}><Text style={form.buttonText}>Done</Text></MotionPressable>}
          </View>
          <MotionPressable disabled={save.isPending} onPress={close} style={{minHeight:44,alignItems:'center',justifyContent:'center'}}><Text style={{...type.label,color:colors.muted}}>Later</Text></MotionPressable>
        </ScrollView>
      </View>
    </KeyboardViewport>
  </Modal>;
}

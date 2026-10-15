import { MoneyInput } from './MoneyInput';
import { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import { useFormStyles } from "../styles/forms";
import {useSpendingGuidanceStyles as useStyles} from "../styles/spendingGuidance";
import { useMoney } from "../domain/money";
import {usePreferencesStore} from "../stores/usePreferencesStore";
import {useColors} from "../styles/theme";
import {
  spendingGuidance,
  type DashboardSnapshot,
} from "../domain/spendingGuidance";
import { useSetMonthlyLimit } from "../hooks/useDashboard";
import {
  centsToDecimal,
  decimalToCents,
} from "../../supabase/functions/ocr/shared";
import { MotionPressable } from "./MotionPressable";
import {useUpdateBlocker} from '../stores/useUpdateSafetyStore';

export function SpendingGuidance({snapshot,month=snapshot?.month??'',available=true,refresh,onRefreshRequired}: {
  snapshot?:DashboardSnapshot;month?:string;available?:boolean;
  refresh?:()=>Promise<unknown>;onRefreshRequired?:(required:boolean)=>void;
}) {
  const styles=useStyles(),form=useFormStyles(),money=useMoney(),colors=useColors();
  const [lastSnapshot,setLastSnapshot]=useState(snapshot);
  if(snapshot&&snapshot!==lastSnapshot)setLastSnapshot(snapshot);
  const s=snapshot??lastSnapshot;
  const owner=usePreferencesStore(state=>state.profile?.user_id),currency=usePreferencesStore(state=>state.profile?.currency??'USD');
  const limit=useSetMonthlyLimit(month);
  const [editing,setEditing]=useState(false),[amount,setAmount]=useState(''),[error,setError]=useState('');
  const [phase,setPhase]=useState<'edit'|'saving'|'refresh'>('edit'),[refreshing,setRefreshing]=useState(false);
  useUpdateBlocker(editing);
  const alive=useRef(true),session=useRef(0),sending=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const guidance=s?spendingGuidance(s):null;
  const valid=(token:number)=>alive.current&&token===session.current&&usePreferencesStore.getState().profile?.user_id===owner;
  const edit=()=>{if(!s||!available)return;session.current++;setAmount(s.limitCents===null?'':centsToDecimal(s.limitCents));setError('');setPhase('edit');setEditing(true);};
  async function refreshSaved(token:number){
    setRefreshing(true);
    try{if(refresh)await refresh();if(!valid(token))return;onRefreshRequired?.(false);setEditing(false);setPhase('edit');setError('');}
    catch{if(valid(token))setError('Budget saved. Retry refreshing to update spending guidance.');}
    finally{if(valid(token))setRefreshing(false);}
  }
  function submit(){
    if(sending.current||phase!=='edit'||!s)return;
    const cents=decimalToCents(amount);
    if(cents===null||cents<0||cents>999999999999){setError('Enter a valid monthly budget, including zero if needed.');return;}
    if(cents<s.allocatedCents){setError('Monthly budget cannot be less than combined category budgets. Reduce category budgets first.');return;}
    const token=session.current;sending.current=true;setPhase('saving');setError('');
    limit.mutate(centsToDecimal(cents),{
      onSuccess:()=>{sending.current=false;if(!valid(token))return;setPhase('refresh');onRefreshRequired?.(true);void refreshSaved(token);},
      onError:issue=>{sending.current=false;if(valid(token)){setPhase('edit');setError(issue.message);}},
    });
  }
  const prefix=new Intl.NumberFormat('en',{style:'currency',currency}).formatToParts(0).find(part=>part.type==='currency')?.value??currency;
  const frozen=phase!=='edit'||!!limit.isPending;
  if(!s&&!editing)return null;
  return <View style={styles.container}>
    {available&&phase!=='refresh'&&s&&guidance&&<View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>{s.month<s.today.slice(0,7)+'-01'?'Final budget remaining':'Safe to spend'}</Text>
      <Text style={styles.caption}>After expenses and bills. Not your bank balance.</Text>
      <View style={styles.row}><Text style={styles.label}>Available</Text><Text style={styles.value}>{guidance.safe===null?'Set a budget':money(guidance.safe/100)}</Text></View>
      <View style={styles.row}><Text style={styles.caption}>Reserved for bills</Text><Text style={styles.number}>{money(s.reservedCents/100)}</Text></View>
      {guidance.allowance!==null&&<View style={styles.row}><Text style={styles.caption}>Per day · {guidance.remainingDays} days left</Text><Text style={styles.number}>{money(guidance.allowance/100)}</Text></View>}
      {guidance.shortfall>0&&<Text style={form.error}>Expenses and bills exceed your monthly budget by {money(guidance.shortfall/100)}.</Text>}
    </View>}
    {(available||editing)&&s&&guidance&&<View style={styles.section}>
      <View style={styles.headingRow}><Text style={styles.heading}>Monthly budget</Text>
        {!editing&&<MotionPressable accessibilityLabel="Edit monthly budget" style={styles.editButton} onPress={edit}><Text style={styles.action}>{s.limitCents===null?'Set budget':'Edit'}</Text></MotionPressable>}
      </View>
      {editing?<View style={{flexDirection:'row',alignItems:'center',gap:6,borderBottomWidth:1,borderBottomColor:colors.primary}}>
        <Text style={styles.limit}>{prefix}</Text>
        <MoneyInput autoFocus style={[styles.limit,{flex:1,minWidth:0,paddingVertical:6,outlineWidth:0}]} accessibilityLabel="Monthly budget" editable={!frozen} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.subtle}/>
      </View>:<Text style={styles.limit}>{s.limitCents===null?'Not set':money(s.limitCents/100)}</Text>}
      {s.preview&&<Text style={styles.caption}>Previous monthly budget. Save to customize.</Text>}
      {editing&&<View>
        {!!error&&<Text accessibilityRole="alert" style={form.error}>{error}</Text>}
        {phase==='refresh'?<MotionPressable disabled={refreshing} style={styles.saveButton} onPress={()=>void refreshSaved(session.current)}><Text style={styles.saveButtonText}>{refreshing?'Refreshing...':'Retry refresh'}</Text></MotionPressable>:<View style={form.optionRow}>
          <MotionPressable disabled={frozen} style={styles.saveButton} onPress={submit}><Text style={styles.saveButtonText}>{frozen?'Saving...':'Save budget'}</Text></MotionPressable>
          <MotionPressable disabled={frozen} style={form.secondaryButton} onPress={()=>{session.current++;setEditing(false);setError('');}}><Text style={form.chipText}>Cancel</Text></MotionPressable>
        </View>}
      </View>}
      {available&&phase!=='refresh'&&<>
        <View style={styles.row}><Text style={styles.caption}>Spent</Text><Text style={styles.number}>{money(s.expenseCents/100)}</Text></View>
        <View style={styles.row}><Text style={styles.caption}>Remaining</Text><Text style={styles.number}>{guidance.remaining===null?'Set a budget':money(guidance.remaining/100)}</Text></View>
        <Text style={styles.caption}>Category budgets share this monthly budget.</Text>
        <Text style={styles.caption}>Allocated: {money(s.allocatedCents/100)}{s.limitCents===null?'':s.allocatedCents>s.limitCents?' · '+money((s.allocatedCents-s.limitCents)/100)+' above your monthly budget':' · '+money((s.limitCents-s.allocatedCents)/100)+' unallocated'}</Text>
      </>}
    </View>}
    {available&&s&&s.legacyDuplicates>0&&<Text style={form.error}>{s.legacyDuplicates} older recurring records could not be uniquely matched. Review them in Transactions; their amounts remain included.</Text>}
  </View>;
}

import { createElement,useState } from 'react';
import { Platform, Text, View } from 'react-native';
import NativeDatePicker from '@expo/ui/community/datetime-picker';
import { MotionPressable } from './MotionPressable';
import { useFormStyles } from '../styles/forms';
import { useColors } from '../styles/theme';
import { isCalendarDate } from '../../supabase/functions/ocr/shared';
import { localDateKey } from '../domain/transactionDates';
import { deviceTimezone } from '../stores/usePreferencesStore';
export function TransactionDateField({ value, onChange, hint, label='Date', accessibilityLabel='Transaction date' }: { value:string; onChange:(value:string)=>void; hint?:string;label?:string;accessibilityLabel?:string }) {
  const styles = useFormStyles(); const colors = useColors(); const [open,setOpen] = useState(false);
  const [fallbackDate] = useState(() => new Date());
  const parts = value.split('-').map(Number); const selected = new Date(0);
  if (isCalendarDate(value)) { selected.setFullYear(parts[0],parts[1]-1,parts[2]); selected.setHours(12,0,0,0); }
  else selected.setTime(fallbackDate.getTime());
  return <View>
    <Text style={styles.label}>{label}</Text>
    {Platform.OS === 'web' ? createElement('input',{
      type:'date','aria-label':accessibilityLabel,value,min:'0001-01-01',max:'9999-12-31',
      onChange:(event:React.ChangeEvent<HTMLInputElement>)=>{if(isCalendarDate(event.currentTarget.value))onChange(event.currentTarget.value);},
      onClick:(event:React.MouseEvent<HTMLInputElement>)=>{try{event.currentTarget.showPicker?.();}catch{/* Browser provides its built-in picker affordance. */}},
      style:{width:'100%',boxSizing:'border-box',minHeight:50,padding:'12px 14px',borderRadius:8,border:'1px solid '+colors.border,background:colors.surface,color:colors.text,font:'inherit',colorScheme:colors.surface.toLowerCase()==='#ffffff'?'light':'dark'},
    })
      : <MotionPressable style={[styles.chip,{minHeight:50,paddingHorizontal:14}]} accessibilityLabel={`Change ${accessibilityLabel.toLowerCase()}`} onPress={() => setOpen(!open)}><Text style={{color:colors.text}}>{value}</Text></MotionPressable>}
    {hint && <Text style={[styles.subtitle,{marginTop:8}]}>{hint}</Text>}
    {open && Platform.OS !== 'web' && <>
      <NativeDatePicker mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} value={selected} onValueChange={(_event,date) => { onChange(localDateKey(date,deviceTimezone())); if (Platform.OS==='android') setOpen(false); }} onDismiss={() => setOpen(false)} />
      {Platform.OS === 'ios' && <MotionPressable style={styles.secondaryButton} onPress={() => setOpen(false)}><Text style={styles.chipText}>Done</Text></MotionPressable>}
    </>}
  </View>;
}

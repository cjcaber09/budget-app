import {useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {paymentMethodLabel,type PaymentMethod} from '../domain/paymentMethods';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {MotionPressable} from './MotionPressable';

// Keep selection inside the refund sheet so native modals never overlap.
export function RefundDestination({label,methods,value,onChange,disabled}:{label:string;methods:PaymentMethod[];value:string;onChange:(id:string)=>void;disabled:boolean}) {
 const form=useFormStyles(),colors=useColors();
 const [choosing,setChoosing]=useState(false),[search,setSearch]=useState('');
 const selected=methods.find(method=>method.id===value);
 const name=selected?paymentMethodLabel(selected)+(selected.archived?' · Archived':''):'Choose a payment method';
 const available=methods.filter(method=>!method.archived&&paymentMethodLabel(method).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <View>
  <Text style={form.label}>{label}</Text>
  <Text style={form.subtitle}>{name}</Text>
  <MotionPressable accessibilityLabel={'Change refund destination, '+name} accessibilityState={{expanded:choosing}} disabled={disabled} style={form.secondaryButton} onPress={()=>{setChoosing(!choosing);setSearch('');}}><Text style={form.chipTextSelected}>{choosing?'Keep selection':'Change'}</Text></MotionPressable>
  {choosing&&<View style={{gap:8,marginTop:12}}>
   <TextInput accessibilityLabel="Search refund destinations" placeholder="Search payment methods" placeholderTextColor={colors.subtle} style={form.input} value={search} onChangeText={setSearch} editable={!disabled}/>
   {!available.length&&<Text style={form.subtitle}>No matching payment methods.</Text>}
   {available.map(method=><MotionPressable key={method.id} accessibilityLabel={'Receive refund into '+paymentMethodLabel(method)} disabled={disabled} accessibilityState={{selected:method.id===value}} style={[form.chip,method.id===value&&form.chipSelected]} onPress={()=>{onChange(method.id);setChoosing(false);setSearch('');}}><Text style={method.id===value?form.chipTextSelected:form.chipText}>{paymentMethodLabel(method)}</Text></MotionPressable>)}
  </View>}
 </View>;
}

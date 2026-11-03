import {forwardRef,useEffect,useState} from 'react';
import {AppState,TextInput,View,type TextInputProps} from 'react-native';
import {Eye,EyeOff} from 'lucide-react-native';
import {useFormStyles} from '../styles/forms';
import {useColors} from '../styles/theme';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {MotionPressable} from './MotionPressable';

export const PasswordInput=forwardRef<TextInput,TextInputProps>(function PasswordInput({style,editable=true,accessibilityLabel='Password',value,...props},ref){
  const [visible,setVisible]=useState(false),form=useFormStyles(),colors=useColors();
  const owner=usePreferencesStore(state=>state.profile?.user_id);
  useEffect(()=>{setVisible(false);},[owner,editable]);
  useEffect(()=>{if(!value)setVisible(false);},[value]);
  useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active')setVisible(false);});return()=>listener.remove();},[]);
  const Icon=visible?EyeOff:Eye;
  return <View style={{position:'relative'}}>
    <TextInput {...props} ref={ref} accessibilityLabel={accessibilityLabel} value={value} editable={editable} autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} style={[form.input,style,{paddingRight:58}]}/>
    <MotionPressable accessibilityRole="button" accessibilityLabel={`${visible?'Hide':'Show'} ${accessibilityLabel.toLowerCase()}`} accessibilityState={{selected:visible}} disabled={!editable} onPress={()=>setVisible(shown=>!shown)} style={{position:'absolute',right:2,top:0,bottom:0,width:48,minHeight:48,alignItems:'center',justifyContent:'center'}}><Icon size={20} color={colors.muted}/></MotionPressable>
  </View>;
});

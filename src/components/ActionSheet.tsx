import {useContext,type ReactNode} from 'react';
import {Modal,View,Text,ScrollView,KeyboardAvoidingView,Platform} from 'react-native';
import {SafeAreaInsetsContext} from 'react-native-safe-area-context';
import {useFormStyles} from '../styles/forms';
import {createThemedStyles,type} from '../styles/theme';
import {MotionPressable} from './MotionPressable';

export function ActionSheet({title,visible,onClose,children,busy=false}:{title:string;visible:boolean;onClose:()=>void;children:ReactNode;busy?:boolean}) {
  const s=useStyles(),form=useFormStyles(),insets=useContext(SafeAreaInsetsContext);
  return <Modal visible={visible} transparent animationType="none" onRequestClose={()=>{if(!busy)onClose();}}>
    <KeyboardAvoidingView style={s.scrim} behavior={Platform.OS==='ios'?'padding':undefined}>
      <View style={[s.sheet,{paddingBottom:Math.max(insets?.bottom??0,24)}]} accessibilityViewIsModal>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          <Text accessibilityRole="header" style={s.title}>{title}</Text>
          {children}
          <MotionPressable style={form.secondaryButton} disabled={busy} onPress={onClose}><Text style={form.chipTextSelected}>Close</Text></MotionPressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const useStyles=createThemedStyles(c=>({scrim:{flex:1,backgroundColor:c.scrim,justifyContent:'flex-end'},sheet:{backgroundColor:c.surface,borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'90%',width:'100%',maxWidth:560,alignSelf:'center'},content:{padding:24},title:{...type.heading,color:c.text,marginBottom:16}}));

import {type ReactNode} from 'react';
import {Text} from 'react-native';
import {useFormStyles} from '../styles/forms';
import {MotionPressable} from './MotionPressable';
import {KeyboardSheet} from './KeyboardSheet';

export function ActionSheet({title,visible,onClose,children,busy=false}:{title:string;visible:boolean;onClose:()=>void;children:ReactNode;busy?:boolean}) {
  const form=useFormStyles();
  return <KeyboardSheet title={title} visible={visible} onClose={onClose} busy={busy} animationType="none">
    {children}
    <MotionPressable style={form.secondaryButton} disabled={busy} onPress={onClose}><Text style={form.chipTextSelected}>Close</Text></MotionPressable>
  </KeyboardSheet>;
}

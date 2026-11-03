import {Text, View, useWindowDimensions} from 'react-native';
import {useFormStyles} from '../styles/forms';
import {MotionPressable} from './MotionPressable';

interface FormAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Related actions share a row, wrapping together into full-width buttons when space is tight. */
export function FormActions({primary, secondary, primaryVariant = 'primary', marginTop = 28}: Readonly<{
  primary: FormAction;
  secondary?: FormAction;
  primaryVariant?: 'primary' | 'secondary';
  marginTop?: number;
}>) {
  const form = useFormStyles();
  const {fontScale} = useWindowDimensions();
  return <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop}}>
    {([['secondary',secondary], ['primary',primary]] as const).map(([role,action]) => {
      if (!action) return null;
      const emphasized = role === 'primary' && primaryVariant === 'primary';
      return <MotionPressable key={role} onPress={action.onPress} disabled={action.disabled}
        accessibilityLabel={action.accessibilityLabel}
        style={[emphasized ? form.button : form.secondaryButton, {
          flexBasis: 120 * fontScale, flexGrow: 1, flexShrink: 1, maxWidth: '100%',
          marginTop: 0, minHeight: 52, paddingHorizontal: 12, justifyContent: 'center',
        }]}>
        <Text style={[emphasized ? form.buttonText : form.chipTextSelected, {textAlign: 'center', flexShrink: 1}]}>{action.label}</Text>
      </MotionPressable>;
    })}
  </View>;
}

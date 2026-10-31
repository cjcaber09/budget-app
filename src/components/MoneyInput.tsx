import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { formatMoneyInput } from '../domain/moneyInput';
import {useColors} from '../styles/theme';

type Props = Omit<TextInputProps, 'value' | 'defaultValue' | 'onChangeText' | 'selection'> & {
  value: string;
  onChangeText: (value: string) => void;
};

// Let the native input own selection; grouping is presentation on blur only.
export function MoneyInput({ value, onChangeText, onFocus, onBlur, editable, keyboardType = 'decimal-pad', ...props }: Props) {
  const [focused, setFocused] = useState(false);
  const colors=useColors();
  return <TextInput
    placeholderTextColor={colors.subtle}
    {...props}
    keyboardType={keyboardType}
    editable={editable}
    value={focused && editable !== false ? value : formatMoneyInput(value)}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
    onChangeText={text => onChangeText(text.replace(/,/g, ''))}
  />;
}

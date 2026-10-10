import { useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { formatMoneyInput, moneyInputEdit, type InputSelection } from '../domain/moneyInput';

type Props = Omit<TextInputProps, 'value' | 'defaultValue' | 'onChangeText' | 'selection'> & {
  value: string;
  onChangeText: (value: string) => void;
};

export function MoneyInput({ value, onChangeText, onSelectionChange, keyboardType = 'decimal-pad', ...props }: Props) {
  const cursor = useRef<InputSelection | undefined>(undefined);
  const [selection, setSelection] = useState<InputSelection>();
  const display = formatMoneyInput(value);
  return <TextInput
    {...props}
    keyboardType={keyboardType}
    value={display}
    selection={selection && {
      start: Math.min(selection.start, display.length),
      end: Math.min(selection.end, display.length),
    }}
    onSelectionChange={event => {
      cursor.current = event.nativeEvent.selection;
      setSelection(event.nativeEvent.selection);
      onSelectionChange?.(event);
    }}
    onChangeText={text => {
      const edit = moneyInputEdit(display, text, cursor.current);
      cursor.current = edit.selection;
      setSelection(edit.selection);
      onChangeText(edit.value);
    }}
  />;
}

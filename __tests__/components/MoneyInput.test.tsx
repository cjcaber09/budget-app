import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MoneyInput } from '../../src/components/MoneyInput';

test('groups before blur while passing exact ungrouped decimals to its parent', () => {
  const changed = jest.fn();
  function Form() {
    const [value, setValue] = useState('');
    return <MoneyInput accessibilityLabel="Amount" value={value} onChangeText={next => { changed(next); setValue(next); }} />;
  }
  render(<Form />);
  fireEvent.changeText(screen.getByLabelText('Amount'), '1000');
  expect(screen.getByLabelText('Amount').props.value).toBe('1,000');
  expect(changed).toHaveBeenLastCalledWith('1000');
  fireEvent.changeText(screen.getByLabelText('Amount'), '1,000.50');
  expect(screen.getByLabelText('Amount').props.value).toBe('1,000.50');
  expect(changed).toHaveBeenLastCalledWith('1000.50');
});

test('clamps the caret when a parent clears a draft', () => {
  const changed = jest.fn();
  const view = render(<MoneyInput accessibilityLabel="Amount" value="1000" onChangeText={changed} />);
  fireEvent(screen.getByLabelText('Amount'), 'selectionChange', { nativeEvent: { selection: { start: 5, end: 5 } } });
  view.rerender(<MoneyInput accessibilityLabel="Amount" value="" onChangeText={changed} />);
  expect(screen.getByLabelText('Amount').props.selection).toEqual({ start: 0, end: 0 });
});

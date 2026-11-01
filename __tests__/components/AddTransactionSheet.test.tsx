import { render, screen, fireEvent } from '@testing-library/react-native';
import { AddTransactionSheet } from '../../src/components/AddTransactionSheet';
import {Platform} from 'react-native';

function renderSheet() {
  const handlers = {
    onClose: jest.fn(),
    onTakePhoto: jest.fn(),
    onUploadImage: jest.fn(),
    onManualEntry: jest.fn(),
    onVoiceEntry:jest.fn(),
  };
  render(<AddTransactionSheet visible {...handlers} />);
  return handlers;
}

describe('AddTransactionSheet', () => {
  it('offers the four grid choices and dispatches their own handlers', () => {
    Object.defineProperty(Platform,'OS',{value:'android',configurable:true});
    const handlers = renderSheet();

    fireEvent.press(screen.getByLabelText('Take Photo'));
    fireEvent.press(screen.getByLabelText('Upload Image'));
    fireEvent.press(screen.getByLabelText('Manual Entry'));
    fireEvent.press(screen.getByLabelText('Voice Entry'));

    expect(handlers.onTakePhoto).toHaveBeenCalledTimes(1);
    expect(handlers.onUploadImage).toHaveBeenCalledTimes(1);
    expect(handlers.onManualEntry).toHaveBeenCalledTimes(1);
    expect(handlers.onVoiceEntry).toHaveBeenCalledTimes(1);
    for(const label of ['Manual','Scan','Upload','Voice'])expect(screen.getByText(label)).toBeTruthy();
  });

  it('tells users where their image goes', () => {
    renderSheet();
    expect(
      screen.getByText(
        "Google reads your receipt using Gemini or Cloud Vision. Gemini's free tier may use photos to improve Google products. Saving keeps a private receipt image. You can remove it before saving."
      )
    ).toBeTruthy();
  });
});

import { render, screen, fireEvent } from '@testing-library/react-native';
import { AddTransactionSheet } from '../../src/components/AddTransactionSheet';

function renderSheet() {
  const handlers = {
    onClose: jest.fn(),
    onTakePhoto: jest.fn(),
    onUploadImage: jest.fn(),
    onManualEntry: jest.fn(),
  };
  render(<AddTransactionSheet visible {...handlers} />);
  return handlers;
}

describe('AddTransactionSheet', () => {
  it('offers three options that fire their own handlers', () => {
    const handlers = renderSheet();

    fireEvent.press(screen.getByText('Take Photo'));
    fireEvent.press(screen.getByText('Upload Image'));
    fireEvent.press(screen.getByText('Manual Entry'));

    expect(handlers.onTakePhoto).toHaveBeenCalledTimes(1);
    expect(handlers.onUploadImage).toHaveBeenCalledTimes(1);
    expect(handlers.onManualEntry).toHaveBeenCalledTimes(1);
  });

  it('tells users where their image goes', () => {
    renderSheet();
    expect(
      screen.getByText(
        "Photos are sent to Google to read the text (Cloud Vision, or Gemini as a backup — Gemini's free tier may use them to improve Google's products). This app doesn't keep them."
      )
    ).toBeTruthy();
  });
});

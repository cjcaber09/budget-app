import { render, screen, fireEvent } from '@testing-library/react-native';
import { TransactionForm } from '../../src/components/TransactionForm';
import type { Category } from '../../src/types/database';

const categories: Category[] = [
  { id: 'cat-1', user_id: 'u1', name: 'Groceries', color: '#4CAF50', icon: 'cart', is_default: true },
];

describe('TransactionForm', () => {
  it('calls onSubmit with parsed values when input is valid', () => {
    const onSubmit = jest.fn();
    render(<TransactionForm categories={categories} submitLabel="Add Transaction" onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '42.50');
    fireEvent.press(screen.getByText('Add Transaction'));

    expect(onSubmit).toHaveBeenCalledWith({ type: 'expense', categoryId: 'cat-1', amount: 42.5, note: null });
  });

  it('defaults to Expense, and submits with categoryId null when Income is selected', () => {
    const onSubmit = jest.fn();
    render(<TransactionForm categories={categories} submitLabel="Add Transaction" onSubmit={onSubmit} />);

    fireEvent.press(screen.getByText('Income'));
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '2000');
    fireEvent.press(screen.getByText('Add Transaction'));

    expect(onSubmit).toHaveBeenCalledWith({ type: 'income', categoryId: null, amount: 2000, note: null });
  });

  it('hides category chips once Income is selected', () => {
    render(<TransactionForm categories={categories} submitLabel="Add Transaction" onSubmit={jest.fn()} />);

    expect(screen.getByText('Groceries')).toBeTruthy();
    fireEvent.press(screen.getByText('Income'));
    expect(screen.queryByText('Groceries')).toBeNull();
  });

  it('blocks submit and shows an error when amount is empty', () => {
    const onSubmit = jest.fn();
    render(<TransactionForm categories={categories} submitLabel="Add Transaction" onSubmit={onSubmit} />);

    fireEvent.press(screen.getByText('Add Transaction'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Amount must be a number greater than 0')).toBeTruthy();
  });

  it('blocks submit when amount is zero or negative', () => {
    const onSubmit = jest.fn();
    render(<TransactionForm categories={categories} submitLabel="Add Transaction" onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '-5');
    fireEvent.press(screen.getByText('Add Transaction'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Amount must be a number greater than 0')).toBeTruthy();
  });
});

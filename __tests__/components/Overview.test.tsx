import { render, screen } from '@testing-library/react-native';
import OverviewScreen from '../../app/(tabs)/index';

jest.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 'cat-1', user_id: 'u1', name: 'Groceries', color: '#4CAF50', icon: 'cart', is_default: true },
      { id: 'cat-2', user_id: 'u1', name: 'Rent', color: '#2196F3', icon: 'home', is_default: true },
    ],
  }),
}));

jest.mock('../../src/hooks/useBudgets', () => ({
  useBudgets: () => ({
    data: [
      { id: 'b1', user_id: 'u1', category_id: 'cat-1', month: '2026-07-01', amount: 200 },
      { id: 'b2', user_id: 'u1', category_id: 'cat-2', month: '2026-07-01', amount: 1000 },
    ],
  }),
}));

jest.mock('../../src/hooks/useTransactions', () => ({
  useTransactions: () => ({
    data: [
      { id: 't1', user_id: 'u1', category_id: 'cat-1', amount: 180, note: null, occurred_at: '2026-07-05T00:00:00.000Z', recurring_rule_id: null, type: 'expense' },
      { id: 't2', user_id: 'u1', category_id: 'cat-2', amount: 1200, note: null, occurred_at: '2026-07-01T00:00:00.000Z', recurring_rule_id: null, type: 'expense' },
      { id: 't3', user_id: 'u1', category_id: null, amount: 2500, note: 'Paycheck', occurred_at: '2026-07-01T00:00:00.000Z', recurring_rule_id: null, type: 'income' },
    ],
  }),
}));

jest.mock('../../src/stores/useUiStore', () => ({
  useUiStore: (selector: (state: { selectedMonth: string }) => unknown) =>
    selector({ selectedMonth: '2026-07-01' }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('OverviewScreen', () => {
  it('shows spend vs budget for each category', () => {
    render(<OverviewScreen />);

    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('$180.00 / $200.00')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('$1200.00 / $1000.00')).toBeTruthy();
  });

  it('shows an alert banner only for categories that are over budget', () => {
    render(<OverviewScreen />);

    expect(screen.getByText('Rent is over budget')).toBeTruthy();
    expect(screen.queryByText('Groceries is over budget')).toBeNull();
  });

  it('shows total income and total expenses for the month', () => {
    render(<OverviewScreen />);

    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.getByText('$2500.00')).toBeTruthy();
    expect(screen.getByText('Expenses')).toBeTruthy();
    expect(screen.getByText('$1380.00')).toBeTruthy();
  });
});

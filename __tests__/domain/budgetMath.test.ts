import { sumTransactionsForCategory, computeBudgetStatus, didCrossThreshold } from '../../src/domain/budgetMath';
import type { Transaction } from '../../src/types/database';

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    user_id: 'u1',
    category_id: 'groceries',
    amount: 10,
    note: null,
    occurred_at: '2026-07-01T00:00:00.000Z',
    recurring_rule_id: null,
    ...overrides,
  };
}

describe('sumTransactionsForCategory', () => {
  it('sums only transactions matching the given category', () => {
    const transactions = [
      makeTransaction({ category_id: 'groceries', amount: 25 }),
      makeTransaction({ category_id: 'rent', amount: 1000 }),
      makeTransaction({ category_id: 'groceries', amount: 15 }),
    ];

    expect(sumTransactionsForCategory(transactions, 'groceries')).toBe(40);
  });

  it('returns 0 when there are no matching transactions', () => {
    expect(sumTransactionsForCategory([], 'groceries')).toBe(0);
  });
});

describe('computeBudgetStatus', () => {
  it('returns "ok" when spend is below 80% of budget', () => {
    expect(computeBudgetStatus(100, 50)).toEqual({
      budgeted: 100,
      spent: 50,
      percentUsed: 50,
      status: 'ok',
    });
  });

  it('returns "warning" at exactly 80% of budget', () => {
    expect(computeBudgetStatus(100, 80)).toEqual({
      budgeted: 100,
      spent: 80,
      percentUsed: 80,
      status: 'warning',
    });
  });

  it('returns "over" at or above 100% of budget', () => {
    expect(computeBudgetStatus(100, 120)).toEqual({
      budgeted: 100,
      spent: 120,
      percentUsed: 120,
      status: 'over',
    });
  });
});

describe('didCrossThreshold', () => {
  it('reports crossing 80% when spend moves from below to at/above it', () => {
    expect(didCrossThreshold(100, 70, 85)).toEqual({ crossed: true, threshold: 80 });
  });

  it('reports crossing 100% (not 80%) when spend jumps straight past both', () => {
    expect(didCrossThreshold(100, 50, 150)).toEqual({ crossed: true, threshold: 100 });
  });

  it('reports crossing 100% when already past 80% and now going over budget', () => {
    expect(didCrossThreshold(100, 85, 110)).toEqual({ crossed: true, threshold: 100 });
  });

  it('reports no crossing when spend stays below 80%', () => {
    expect(didCrossThreshold(100, 50, 60)).toEqual({ crossed: false, threshold: null });
  });

  it('reports no crossing when already over 100% and spend increases further', () => {
    expect(didCrossThreshold(100, 110, 130)).toEqual({ crossed: false, threshold: null });
  });

  it('reports no crossing when the budget is 0', () => {
    expect(didCrossThreshold(0, 0, 10)).toEqual({ crossed: false, threshold: null });
  });
});

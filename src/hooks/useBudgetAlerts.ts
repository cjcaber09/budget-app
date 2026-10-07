import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useCategories } from './useCategories';
import { useBudgets } from './useBudgets';
import { useTransactions } from './useTransactions';
import { sumTransactionsForCategory, didCrossThreshold } from '../domain/budgetMath';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function useBudgetAlerts(month: string): void {
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets(month);
  const { data: transactions } = useTransactions(month);
  const previousSpentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (Platform.OS !== 'web') {
      void Notifications.requestPermissionsAsync().catch((error: unknown) => console.warn('Budget notification permission:', error));
    }
  }, []);

  useEffect(() => {
    if (!categories || !budgets || !transactions) return;

    for (const category of categories) {
      const budget = budgets.find((b) => b.category_id === category.id);
      const budgeted = budget?.amount ?? 0;
      const spent = sumTransactionsForCategory(transactions, category.id);
      const previousSpent = previousSpentRef.current.get(category.id) ?? 0;

      const crossing = didCrossThreshold(budgeted, previousSpent, spent);
      if (crossing.crossed && Platform.OS !== 'web') {
        const message =
          crossing.threshold === 100
            ? `${category.name} is over budget`
            : `${category.name} is nearing its budget`;

        void Notifications.scheduleNotificationAsync({
          content: { title: 'Budget Alert', body: message },
          trigger: null,
        }).catch((error: unknown) => console.warn('Budget notification:', error));
      }

      previousSpentRef.current.set(category.id, spent);
    }
  }, [categories, budgets, transactions]);
}

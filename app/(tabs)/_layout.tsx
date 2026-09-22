import { Tabs } from 'expo-router';
import { useRecurringCatchUp } from '../../src/hooks/useRecurringRules';
import { useBudgetAlerts } from '../../src/hooks/useBudgetAlerts';
import { useUiStore } from '../../src/stores/useUiStore';

export default function TabsLayout() {
  useRecurringCatchUp();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  useBudgetAlerts(selectedMonth);

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

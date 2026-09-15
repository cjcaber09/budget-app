import { Tabs } from 'expo-router';
import { useRecurringCatchUp } from '../../src/hooks/useRecurringRules';

export default function TabsLayout() {
  useRecurringCatchUp();

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

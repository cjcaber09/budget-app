import { View } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { useRecurringCatchUp } from '../../src/hooks/useRecurringRules';
import { useBudgetAlerts } from '../../src/hooks/useBudgetAlerts';
import { useUiStore } from '../../src/stores/useUiStore';
import { BackButton } from '../../src/components/BackButton';
import { AddTransactionFab } from '../../src/components/AddTransactionFab';

function renderBackButton() {
  return <BackButton />;
}

export default function TabsLayout() {
  useRecurringCatchUp();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  useBudgetAlerts(selectedMonth);
  const pathname = usePathname();

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: true }}>
        <Tabs.Screen name="index" options={{ title: 'Overview' }} />
        <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
        <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />

        {/* Detail/edit screens: nested inside (tabs) so the tab bar stays
            visible while on them, hidden from the tab bar itself via
            href: null, with a back button since Tabs has no built-in one. */}
        <Tabs.Screen
          name="transaction/new"
          options={{ href: null, title: 'Add Transaction', headerLeft: renderBackButton }}
        />
        <Tabs.Screen
          name="transaction/[id]"
          options={{ href: null, title: 'Edit Transaction', headerLeft: renderBackButton }}
        />
        <Tabs.Screen
          name="budget/[categoryId]"
          options={{ href: null, title: 'Edit Budget', headerLeft: renderBackButton }}
        />
        <Tabs.Screen
          name="category/new"
          options={{ href: null, title: 'Add Category', headerLeft: renderBackButton }}
        />
        <Tabs.Screen
          name="category/[id]"
          options={{ href: null, title: 'Edit Category', headerLeft: renderBackButton }}
        />
        <Tabs.Screen
          name="recurring/new"
          options={{ href: null, title: 'Add Recurring Rule', headerLeft: renderBackButton }}
        />
        <Tabs.Screen
          name="recurring/[id]"
          options={{ href: null, title: 'Edit Recurring Rule', headerLeft: renderBackButton }}
        />
      </Tabs>
      {/* Rendered as a sibling of the whole Tabs navigator (not nested
          inside the Overview screen's own scene) so it can't be clipped
          by that screen's container and reliably paints above the tab bar. */}
      {pathname === '/' && <AddTransactionFab />}
    </View>
  );
}

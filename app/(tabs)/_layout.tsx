import { Easing, View, type ColorValue } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Tabs, usePathname } from 'expo-router';
import { LayoutDashboard, Receipt, ChartColumn, Settings } from 'lucide-react-native';
import { type, useColors } from '../../src/styles/theme';
import { useRecurringCatchUp } from '../../src/hooks/useRecurringRules';
import { useBudgetAlerts } from '../../src/hooks/useBudgetAlerts';
import { usePhoneNotifications } from '../../src/hooks/usePhoneNotifications';
import { useUiStore } from '../../src/stores/useUiStore';
import { BackButton } from '../../src/components/BackButton';
import { AddTransactionFab } from '../../src/components/AddTransactionFab';
import { TAB_BAR_HEIGHT } from '../../src/constants/layout';

function renderBackButton() {
  return <BackButton />;
}

// The 4 tab-bar pages (not the hidden new/[id] detail screens nested under
// (tabs) — the FAB doesn't belong on a screen that's already an editing form).
const TAB_PAGES = new Set(['/', '/transactions', '/reports', '/settings']);

type TabIconProps = { color: ColorValue; size: number };

function renderOverviewIcon({ color, size }: TabIconProps) {
  return <LayoutDashboard color={color} size={size} />;
}

function renderTransactionsIcon({ color, size }: TabIconProps) {
  return <Receipt color={color} size={size} />;
}

function renderReportsIcon({ color, size }: TabIconProps) {
  return <ChartColumn color={color} size={size} />;
}

function renderSettingsIcon({ color, size }: TabIconProps) {
  return <Settings color={color} size={size} />;
}

export default function TabsLayout() {
  const reducedMotion = useReducedMotion();
  const colors = useColors();
  const insets = useContext(SafeAreaInsetsContext);
  useRecurringCatchUp();
  usePhoneNotifications();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  useBudgetAlerts(selectedMonth);
  const pathname = usePathname();

  return (
    <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: colors.background }}>
      <Tabs
        backBehavior="history"
        screenOptions={{
          headerShown: true,
          animation: reducedMotion ? 'none' : 'fade',
          transitionSpec: { animation: 'timing', config: { duration: reducedMotion ? 0 : 180, easing: Easing.out(Easing.cubic) } },
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { ...type.heading },
          headerShadowVisible: false,
          sceneStyle: { backgroundColor: colors.background },
          tabBarPosition: 'bottom',
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { ...type.label, fontSize: 11 },
          tabBarStyle: { height: TAB_BAR_HEIGHT + (insets?.bottom ?? 0), paddingBottom: 10 + (insets?.bottom ?? 0), paddingTop: 10, backgroundColor: colors.surface, borderTopColor: colors.border },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Overview', headerShown: false, tabBarIcon: renderOverviewIcon }} />
        <Tabs.Screen
          name="transactions"
          options={{ title: 'Transactions', headerShown: false, tabBarIcon: renderTransactionsIcon }}
        />
        <Tabs.Screen name="reports" options={{ title: 'Reports', headerShown: false, tabBarIcon: renderReportsIcon }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', headerShown: false, tabBarIcon: renderSettingsIcon }} />

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
          options={{ href: null, title: 'Add Recurring Bill', headerLeft: renderBackButton }}
        />
        <Tabs.Screen
          name="recurring/[id]"
          options={{ href: null, title: 'Edit Recurring Bill', headerLeft: renderBackButton }}
        />
      </Tabs>
      {/* Rendered as a sibling of the whole Tabs navigator (not nested
          inside the Overview screen's own scene) so it can't be clipped
          by that screen's container and reliably paints above the tab bar. */}
      {TAB_PAGES.has(pathname) && <AddTransactionFab />}
    </View>
  );
}

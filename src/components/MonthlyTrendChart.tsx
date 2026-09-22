import { View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { format } from 'date-fns';
import type { MonthlyTotal } from '../hooks/useMonthlyTotals';

interface Props {
  totals: MonthlyTotal[];
}

export function MonthlyTrendChart({ totals }: Props) {
  const data = totals.map((entry) => ({
    value: entry.total,
    label: format(new Date(`${entry.month}T00:00:00.000Z`), 'MMM'),
  }));

  return (
    <View>
      <BarChart data={data} barWidth={24} spacing={16} roundedTop />
    </View>
  );
}

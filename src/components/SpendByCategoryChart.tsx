import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import type { Category, Transaction } from '../types/database';
import { sumTransactionsForCategory } from '../domain/budgetMath';

interface Props {
  categories: Category[];
  transactions: Transaction[];
}

export function SpendByCategoryChart({ categories, transactions }: Props) {
  const data = categories
    .map((category) => ({
      value: sumTransactionsForCategory(transactions, category.id),
      color: category.color,
      text: category.name,
    }))
    .filter((slice) => slice.value > 0);

  return (
    <View>
      <PieChart data={data} donut radius={90} innerRadius={55} />
    </View>
  );
}

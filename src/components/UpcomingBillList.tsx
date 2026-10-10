import {useState} from 'react';
import {View,Text} from 'react-native';
import {useRouter} from 'expo-router';
import {useFormStyles} from '../styles/forms';
import {useSpendingGuidanceStyles as useStyles} from '../styles/spendingGuidance';
import {useMoney} from '../domain/money';
import {useBillCommand} from '../hooks/useDashboard';
import {useTransactions} from '../hooks/useTransactions';
import {createRequestId} from '../domain/ocr';
import {MotionPressable} from './MotionPressable';
import {addMonths,format,parseISO} from 'date-fns';
import type {BillOccurrence,DashboardSnapshot} from '../domain/spendingGuidance';
export function UpcomingBillList({snapshot:s,onNavigate}:Readonly<{snapshot:DashboardSnapshot;onNavigate:()=>void}>){
 const styles=useStyles();const form=useFormStyles();const money=useMoney();const router=useRouter();const command=useBillCommand();
  const [linking, setLinking] = useState<BillOccurrence | null>(null);
  const [difference, setDifference] = useState<{
    bill: BillOccurrence;
    id: string;
    amount: number;
  } | null>(null);
  const [linkMonth, setLinkMonth] = useState(s.month);
  const transactions = useTransactions(linkMonth);
  const outstanding = s.bills.filter(
    (b) => b.state === "outstanding" || b.state === "replacement",
  );
  const record = (bill: BillOccurrence) => {
    onNavigate?.();
    router.push({
      pathname: "/transaction/new",
      params: {
        visit: createRequestId(),
        occurrenceId: bill.id,
        paymentMethodId:bill.payment_method_id??undefined,
        categoryId: bill.category_id ?? "",
        billAmount: String(bill.amount),
        billNote: bill.label ?? "Scheduled expense",
      },
    });
  };
 return <View style={styles.container}>
      {outstanding.length===0&&<Text style={styles.caption}>No upcoming bills for this month.</Text>}
      {outstanding.length > 0 && (
        <View style={{gap:12}}>
{outstanding.map((bill) => (
            <View key={bill.id} style={styles.bill}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {bill.label || "Scheduled expense"}
                  </Text>
                  <Text style={styles.caption}>
                    {bill.scheduled_date}
                    {bill.state === "replacement" ? " · Needs replacement" : ""}
                  </Text>
                </View>
                <Text style={styles.number}>{money(Number(bill.amount))}</Text>
              </View>
              <View style={form.optionRow}>
                <MotionPressable style={form.chip} onPress={() => record(bill)}>
                  <Text style={form.chipText}>Record expense</Text>
                </MotionPressable>
                <MotionPressable
                  style={form.chip}
                  onPress={() => {
                    setLinking(bill);
                    setDifference(null);
                  }}
                >
                  <Text style={form.chipText}>Link existing</Text>
                </MotionPressable>
                <MotionPressable
                  disabled={command.isPending}
                  style={form.chip}
                  onPress={() =>
                    command.mutate({ id: bill.id, command: "skip" })
                  }
                >
                  <Text style={form.chipText}>Skip</Text>
                </MotionPressable>
              </View>
              {command.isError&&command.variables?.id===bill.id&&command.variables.command!=='link'&&<Text accessibilityRole="alert" style={form.error}>Could not change this bill. Its last saved state remains active. Try the action again.</Text>}
            </View>
          ))}
        </View>
      )}
      {linking && (
        <View style={styles.section}>
          <Text style={styles.heading}>Link an expense</Text>
          {command.isError&&command.variables?.command==='link'&&<Text accessibilityRole="alert" style={form.error}>Could not link this expense. The bill remains unchanged. Try again or choose another expense.</Text>}
          <Text style={styles.caption}>
            One expense settles the whole bill. Partial payments are not
            supported.
          </Text>
          <View style={styles.row}>
            <MotionPressable
              style={form.chip}
              accessibilityLabel="Previous month of expenses"
              onPress={() =>
                setLinkMonth(
                  format(addMonths(parseISO(linkMonth), -1), "yyyy-MM-01"),
                )
              }
            >
              <Text style={form.chipText}>Previous</Text>
            </MotionPressable>
            <Text style={styles.caption}>
              {format(parseISO(linkMonth), "MMM yyyy")}
            </Text>
            <MotionPressable
              style={form.chip}
              accessibilityLabel="Next month of expenses"
              onPress={() =>
                setLinkMonth(
                  format(addMonths(parseISO(linkMonth), 1), "yyyy-MM-01"),
                )
              }
            >
              <Text style={form.chipText}>Next</Text>
            </MotionPressable>
          </View>
          {transactions.isPending && (
            <Text style={styles.caption}>Loading expenses…</Text>
          )}
          {transactions.isError && (
            <MotionPressable onPress={() => void transactions.refetch()}>
              <Text style={styles.action}>Could not load expenses. Retry</Text>
            </MotionPressable>
          )}
          {(transactions.data ?? [])
            .filter((t) => t.type === "expense" && !t.occurrence_id)
            .map((t) => (
              <MotionPressable
                key={t.id}
                style={styles.row}
                onPress={() => {
                  if (Number(t.amount) !== Number(linking.amount))
                    setDifference({
                      bill: linking,
                      id: t.id,
                      amount: t.amount,
                    });
                  else
                    command.mutate(
                      { id: linking.id, command: "link", transactionId: t.id },
                      { onSuccess: () => setLinking(null) },
                    );
                }}
              >
                <Text style={styles.label}>{t.note || "Expense"}</Text>
                <Text style={styles.number}>{money(t.amount)}</Text>
              </MotionPressable>
            ))}
          {!transactions.isPending &&
            !transactions.isError &&
            !(transactions.data ?? []).some(
              (t) => t.type === "expense" && !t.occurrence_id,
            ) && (
              <Text style={styles.caption}>
                No unlinked expenses in this month. Record the bill instead.
              </Text>
            )}
          {difference && (
            <View>
              <Text style={styles.caption}>
                {money(difference.amount)} differs from the scheduled{" "}
                {money(Number(difference.bill.amount))}. Confirm that this
                expense settles the whole bill.
              </Text>
              <MotionPressable
                disabled={command.isPending}
                style={form.secondaryButton}
                onPress={() =>
                  command.mutate(
                    {
                      id: difference.bill.id,
                      command: "link",
                      transactionId: difference.id,
                      confirmDifference: true,
                    },
                    {
                      onSuccess: () => {
                        setDifference(null);
                        setLinking(null);
                      },
                    },
                  )
                }
              >
                <Text style={form.chipText}>Confirm full settlement</Text>
              </MotionPressable>
            </View>
          )}
          <MotionPressable
            style={form.secondaryButton}
            onPress={() => {
              setLinking(null);
              setDifference(null);
            }}
          >
            <Text style={form.chipText}>Cancel linking</Text>
          </MotionPressable>
        </View>
      )}
 </View>;
}

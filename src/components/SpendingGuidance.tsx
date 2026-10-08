import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useFormStyles } from "../styles/forms";
import { createThemedStyles, type } from "../styles/theme";
import { useMoney } from "../domain/money";
import {
  spendingGuidance,
  type DashboardSnapshot,
  type BillOccurrence,
} from "../domain/spendingGuidance";
import { useSetMonthlyLimit, useBillCommand } from "../hooks/useDashboard";
import { useTransactions } from "../hooks/useTransactions";
import {
  centsToDecimal,
  decimalToCents,
} from "../../supabase/functions/ocr/shared";
import { createRequestId } from "../domain/ocr";
import { MotionPressable } from "./MotionPressable";
import { addMonths, format, parseISO } from "date-fns";

export function SpendingGuidance({
  snapshot: s,
}: {
  snapshot: DashboardSnapshot;
}) {
  const styles = useStyles();
  const form = useFormStyles();
  const money = useMoney();
  const router = useRouter();
  const guidance = spendingGuidance(s);
  const limit = useSetMonthlyLimit(s.month);
  const command = useBillCommand();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
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
  const edit = () => {
    setAmount(s.limitCents === null ? "" : centsToDecimal(s.limitCents));
    setError("");
    setEditing(true);
  };
  const record = (bill: BillOccurrence) =>
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
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>Monthly budget</Text>
          <MotionPressable
            accessibilityLabel="Edit monthly spending limit"
            style={styles.editButton}
            onPress={edit}
          >
            <Text style={styles.action}>
              {s.limitCents === null ? "Set budget" : "Edit"}
            </Text>
          </MotionPressable>
        </View>
        <Text style={styles.limit}>
          {s.limitCents === null
            ? "Give this month a plan"
            : money(s.limitCents / 100)}
        </Text>
        {s.preview && (
          <Text style={styles.caption}>
            Preview from your previous limit. Save to customize this month.
          </Text>
        )}
        {editing && (
          <View>
            <TextInput
              style={form.input}
              accessibilityLabel="Monthly spending limit"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            {!!error && (
              <Text accessibilityRole="alert" style={form.error}>
                {error}
              </Text>
            )}
            {limit.isError&&<Text accessibilityRole="alert" style={form.error}>Could not save your limit. Your draft is still here; try Save limit again.</Text>}
            <View style={form.optionRow}>
              <MotionPressable
                disabled={limit.isPending}
                style={styles.saveButton}
                onPress={() => {
                  const cents = decimalToCents(amount);
                  if (cents === null || cents < 0 || cents > 999999999999) {
                    setError("Enter a valid limit, including zero if needed.");
                    return;
                  }
                  limit.mutate(centsToDecimal(cents), {
                    onSuccess: () => setEditing(false),
                  });
                }}
              >
                <Text style={styles.saveButtonText}>
                  {limit.isPending ? "Saving…" : "Save limit"}
                </Text>
              </MotionPressable>
              <MotionPressable
                style={form.secondaryButton}
                onPress={() => setEditing(false)}
              >
                <Text style={form.chipText}>Cancel</Text>
              </MotionPressable>
            </View>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.caption}>Recorded spending</Text>
          <Text style={styles.number}>{money(s.expenseCents / 100)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.caption}>Budget remaining</Text>
          <Text style={styles.number}>
            {guidance.remaining === null
              ? "Set a limit"
              : money(guidance.remaining / 100)}
          </Text>
        </View>
        <Text style={styles.caption}>
          Category allocations: {money(s.allocatedCents / 100)}
          {s.limitCents === null
            ? ""
            : s.allocatedCents > s.limitCents
              ? ` · ${money((s.allocatedCents - s.limitCents) / 100)} above your limit`
              : ` · ${money((s.limitCents - s.allocatedCents) / 100)} unallocated`}
        </Text>
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          {s.month < s.today.slice(0, 7) + "-01"
            ? "Final budget remaining"
            : "Safe to spend"}
        </Text>
        <Text style={styles.caption}>
          Your budget after recorded expenses and scheduled commitments. This is
          not your bank balance.
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>Spendable this month</Text>
          <Text style={styles.value}>
            {guidance.safe === null
              ? "Set a limit"
              : money(guidance.safe / 100)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.caption}>Reserved for upcoming bills</Text>
          <Text style={styles.number}>{money(s.reservedCents / 100)}</Text>
        </View>
        {guidance.allowance !== null && (
          <View style={styles.row}>
            <Text style={styles.caption}>
              Per day · {guidance.remainingDays} days left
            </Text>
            <Text style={styles.number}>{money(guidance.allowance / 100)}</Text>
          </View>
        )}
        {guidance.shortfall > 0 && (
          <Text style={form.error}>
            Your spending and commitments exceed the limit by{" "}
            {money(guidance.shortfall / 100)}.
          </Text>
        )}
      </View>
      {guidance.current && (
        <View style={styles.section}>
          <View style={styles.headingRow}>
            <Text accessibilityRole="header" style={styles.heading}>
              Daily Spending Pace
            </Text>
            {guidance.pace && (
              <Text style={styles.caption}>{guidance.pace}</Text>
            )}
          </View>
          <View style={styles.row}>
            <Text style={styles.caption}>Average per calendar day</Text>
            <Text style={styles.number}>
              {money((guidance.average ?? 0) / 100)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.caption}>Estimated month-end spending</Text>
            <Text style={styles.number}>
              {money((guidance.forecast ?? 0) / 100)}
            </Text>
          </View>
          <Text style={styles.caption}>
            An estimate using discretionary spending so far and scheduled bills.
            Early-month estimates can change quickly.
          </Text>
        </View>
      )}
      {outstanding.length > 0 && (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>
            Upcoming bills
          </Text>
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
      {s.legacyDuplicates > 0 && (
        <Text style={form.error}>
          {s.legacyDuplicates} older recurring records could not be uniquely
          matched. Review them in Transactions; their amounts remain included.
        </Text>
      )}
    </View>
  );
}
const useStyles = createThemedStyles((c) => ({
  container: { gap: 20 },
  section: {
    gap: 12,
    backgroundColor:c.surfaceAlt,
    borderRadius:16,
    padding:20,
  },
  headingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heading: { ...type.heading, color: c.text },
  limit: { ...type.number, fontSize: 30, color: c.text },
  caption: { ...type.label, fontWeight: "400", color: c.muted },
  label: { ...type.body, color: c.text, flexShrink: 1 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
  },
  number: { ...type.number, color: c.text, fontSize: 15 },
  value: { ...type.number, color: c.primary, fontSize: 22 },
  action: { ...type.label, color: c.primary },
  editButton:{borderWidth:1,borderColor:c.border,borderRadius:8,minHeight:44,paddingHorizontal:14,justifyContent:'center'},
  saveButton:{backgroundColor:c.primary,borderRadius:10,minHeight:48,paddingHorizontal:18,justifyContent:'center',alignItems:'center',marginTop:12},
  saveButtonText:{...type.label,color:c.onPrimary},
  bill: { gap: 8, paddingVertical: 12 },
}));

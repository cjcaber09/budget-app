import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useFormStyles } from "../styles/forms";
import {useSpendingGuidanceStyles as useStyles} from "../styles/spendingGuidance";
import { useMoney } from "../domain/money";
import {
  spendingGuidance,
  type DashboardSnapshot,
} from "../domain/spendingGuidance";
import { useSetMonthlyLimit } from "../hooks/useDashboard";
import {
  centsToDecimal,
  decimalToCents,
} from "../../supabase/functions/ocr/shared";
import { MotionPressable } from "./MotionPressable";

export function SpendingGuidance({
  snapshot: s,
}: {
  snapshot: DashboardSnapshot;
}) {
  const styles = useStyles();
  const form = useFormStyles();
  const money = useMoney();
  const guidance = spendingGuidance(s);
  const limit = useSetMonthlyLimit(s.month);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const edit = () => {
    setAmount(s.limitCents === null ? "" : centsToDecimal(s.limitCents));
    setError("");
    setEditing(true);
  };
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
            {limit.isError&&<Text accessibilityRole="alert" style={form.error}>{limit.error.message}</Text>}
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
                  if(cents<s.allocatedCents){setError('Monthly allowance cannot be less than combined category budgets. Reduce category budgets first.');return;}
                  setError('');
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
          Combined category budgets must stay within this monthly allowance.
        </Text>
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
      {s.legacyDuplicates > 0 && (
        <Text style={form.error}>
          {s.legacyDuplicates} older recurring records could not be uniquely
          matched. Review them in Transactions; their amounts remain included.
        </Text>
      )}
    </View>
  );
}

export interface BillOccurrence {
  payment_method_id?:string|null;
  id: string;
  rule_id: string;
  scheduled_date: string;
  amount: number;
  category_id: string | null;
  label: string | null;
  state: "outstanding" | "replacement" | "recorded" | "skipped";
  transaction_id: string | null;
}
export interface DashboardSnapshot {
  today: string;
  timezone: string;
  complete: boolean;
  month: string;
  limitCents: number | null;
  preview: boolean;
  allocatedCents: number;
  incomeCents: number;
  expenseCents: number;
  spentToDateCents: number;
  futureRecordedCents: number;
  discretionaryToDateCents: number;
  futureDiscretionaryCents: number;
  reservedCents: number;
  legacyDuplicates: number;
  bills: BillOccurrence[];
  categoryTotals: { id: string; name: string; color: string; spent: number }[];
}
export function spendingGuidance(s: DashboardSnapshot) {
  const currentMonth = `${s.today.slice(0, 7)}-01`;
  const current = s.month === currentMonth;
  const [year, month] = s.month.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const elapsed = current
    ? Number(s.today.slice(8, 10))
    : s.month < currentMonth
      ? days
      : 0;
  const remainingDays = current
    ? days - elapsed + 1
    : s.month > currentMonth
      ? days
      : 0;
  const remaining =
    s.limitCents === null ? null : s.limitCents - s.expenseCents;
  const capacity = remaining === null ? null : remaining - s.reservedCents;
  const safe = capacity === null ? null : Math.max(0, capacity);
  const allowance =
    current && safe !== null ? Math.floor(safe / remainingDays) : null;
  const average = current ? Math.round(s.spentToDateCents / elapsed) : null;
  const projectedExtra = current
    ? Math.max(
        0,
        Math.round((s.discretionaryToDateCents / elapsed) * (days - elapsed)) -
          s.futureDiscretionaryCents,
      )
    : 0;
  const forecast = current
    ? s.spentToDateCents +
      s.futureRecordedCents +
      s.reservedCents +
      projectedExtra
    : null;
  const pace =
    forecast === null || s.limitCents === null
      ? null
      : forecast > s.limitCents
        ? "Over budget"
        : forecast < s.limitCents * 0.95
          ? "Ahead of budget"
          : "On track";
  return {
    current,
    remainingDays,
    remaining,
    safe,
    shortfall: capacity === null ? 0 : Math.max(0, -capacity),
    allowance,
    average,
    forecast,
    pace,
  };
}

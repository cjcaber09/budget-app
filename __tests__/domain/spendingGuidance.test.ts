import {
  spendingGuidance,
  type DashboardSnapshot,
} from "../../src/domain/spendingGuidance";
import { formatMoney } from "../../src/domain/money";
import {
  localDateKey,
  localMonthRange,
  occurrenceForDate,
} from "../../src/domain/transactionDates";
const fixture: DashboardSnapshot = {
  today: "2026-10-10",
  month: "2026-10-01",
  timezone: "Asia/Manila",
  complete: true,
  limitCents: 100000,
  preview: false,
  allocatedCents: 60000,
  incomeCents: 150000,
  expenseCents: 40000,
  spentToDateCents: 30000,
  futureRecordedCents: 10000,
  discretionaryToDateCents: 20000,
  futureDiscretionaryCents: 10000,
  reservedCents: 20000,
  bills: [],
  categoryTotals: [],
  legacyDuplicates: 0,
};
it("reserves bills, includes today in allowance, and avoids forecasting future records twice", () => {
  const result = spendingGuidance(fixture);
  expect(result).toMatchObject({
    remaining: 60000,
    safe: 40000,
    allowance: 1818,
    average: 3000,
    remainingDays: 22,
    forecast: 92000,
    pace: "Ahead of budget",
  });
});
it("never projects negative extra spending when future records exceed the trend", () => {
  expect(
    spendingGuidance({
      ...fixture,
      futureDiscretionaryCents: 60000,
      futureRecordedCents: 60000,
      expenseCents: 90000,
    }).forecast,
  ).toBe(110000);
});
it("distinguishes missing limits, explicit zero, and shortfall", () => {
  expect(spendingGuidance({ ...fixture, limitCents: null }).safe).toBeNull();
  expect(spendingGuidance({ ...fixture, limitCents: 0 })).toMatchObject({
    safe: 0,
    shortfall: 60000,
    pace: "Over budget",
  });
});
it("omits pace and daily allowance for historical and future months", () => {
  expect(spendingGuidance({ ...fixture, month: "2026-09-01" })).toMatchObject({
    average: null,
    forecast: null,
    allowance: null,
  });
  expect(spendingGuidance({ ...fixture, month: "2026-11-01" })).toMatchObject({
    average: null,
    forecast: null,
    allowance: null,
  });
});
it("handles leap-year final day without dividing by zero", () => {
  expect(
    spendingGuidance({ ...fixture, today: "2024-02-29", month: "2024-02-01" }),
  ).toMatchObject({ remainingDays: 1, allowance: 40000, forecast: 60000 });
});
it("uses the financial timezone while preserving chosen calendar dates", () => {
  const instant = new Date("2026-10-31T18:00:00Z");
  expect(localDateKey(instant, "Asia/Manila")).toBe("2026-11-01");
  expect(localDateKey(instant, "America/Los_Angeles")).toBe("2026-10-31");
  expect(localMonthRange("2026-03-01", "America/New_York")).toMatchObject({
    start: "2026-03-01T05:00:00.000Z",
    end: "2026-04-01T04:00:00.000Z",
  });
  expect(
    occurrenceForDate("2026-09-01", instant.toISOString(), "Asia/Manila"),
  ).toBe("2026-09-01T04:00:00.000Z");
});
it("formats different currency units without converting amounts", () => {
  expect(formatMoney(100, "USD")).toBe("$100.00");
  expect(formatMoney(100, "PHP")).toContain("100.00");
  expect(formatMoney(100, "EUR")).toBe("€100.00");
});

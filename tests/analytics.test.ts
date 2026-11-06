import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSpendingAnalytics,
  type AnalyticsPeriod,
} from "../src/services/analytics.ts";
import type { SavedBill } from "../src/services/storage.ts";

function makeBill(overrides: Partial<SavedBill> = {}): SavedBill {
  return {
    id: "bill-1",
    merchant: "Nidhi Motors",
    date: "05-11-2026",
    total: 100,
    category: "Transport",
    currency: "INR",
    imageName: "receipt.jpg",
    savedAt: "2026-11-05T12:00:00.000Z",
    ...overrides,
  };
}

const now = new Date(2026, 10, 6, 12);

test("supports each date preset using transaction dates", () => {
  const bills = [
    makeBill({ id: "this-month", date: "2026-11-02", total: 10 }),
    makeBill({ id: "previous-month", date: "2026-10-30", total: 20 }),
    makeBill({ id: "last-three", date: "2026-09-01", total: 30 }),
    makeBill({ id: "older-this-year", date: "2026-02-01", total: 40 }),
    makeBill({ id: "previous-year", date: "2025-12-31", total: 50 }),
  ];
  const expected: Record<AnalyticsPeriod, string[]> = {
    "this-month": ["this-month"],
    "previous-month": ["previous-month"],
    "last-3-months": ["this-month", "previous-month", "last-three"],
    "this-year": [
      "this-month",
      "previous-month",
      "last-three",
      "older-this-year",
    ],
    "all-time": [
      "this-month",
      "previous-month",
      "last-three",
      "older-this-year",
      "previous-year",
    ],
  };

  for (const [period, ids] of Object.entries(expected) as [
    AnalyticsPeriod,
    string[],
  ][]) {
    const analytics = calculateSpendingAnalytics(bills, period, now);
    assert.equal(analytics.transactionCount, ids.length, period);
    assert.deepEqual(
      analytics.currencies
        .flatMap((currency) => currency.monthlyTrend)
        .filter((month) => month.count > 0)
        .flatMap((month) => {
          const bill = bills.find((candidate) => {
            const date = new Date(candidate.date);
            return date.getFullYear() === Number(month.key.slice(0, 4)) &&
              date.getMonth() + 1 === Number(month.key.slice(5));
          });
          return bill ? [bill.id] : [];
        })
        .sort(),
      [...ids].sort(),
      period
    );
  }
});

test("calculates category totals, counts, and percentage contributions", () => {
  const analytics = calculateSpendingAnalytics(
    [
      makeBill({ id: "transport-1", total: 100 }),
      makeBill({ id: "transport-2", total: 50 }),
      makeBill({ id: "food", total: 150, category: "Food" }),
    ],
    "this-month",
    now
  );
  const categories = analytics.currencies[0].categories;

  assert.deepEqual(categories, [
    { name: "Transport", total: 150, count: 2, percentage: 50 },
    { name: "Food", total: 150, count: 1, percentage: 50 },
  ]);
});

test("builds monthly trend totals and fills intervening months with zero", () => {
  const analytics = calculateSpendingAnalytics(
    [
      makeBill({ id: "sep", date: "2026-09-15", total: 25 }),
      makeBill({ id: "nov", date: "2026-11-05", total: 75 }),
    ],
    "last-3-months",
    now
  );
  const trend = analytics.currencies[0].monthlyTrend;

  assert.deepEqual(trend.map(({ key, total, count }) => ({
    key,
    total,
    count,
  })), [
    { key: "2026-09", total: 25, count: 1 },
    { key: "2026-10", total: 0, count: 0 },
    { key: "2026-11", total: 75, count: 1 },
  ]);
});

test("reports per-currency summaries without combining different currencies", () => {
  const analytics = calculateSpendingAnalytics(
    [
      makeBill({ id: "inr", total: 100, currency: "INR" }),
      makeBill({ id: "usd", total: 200, currency: "USD" }),
      makeBill({ id: "gbp", total: 50, currency: "GBP" }),
    ],
    "all-time",
    now
  );

  assert.deepEqual(
    analytics.currencies.map(({ currency, total, count, average, highest }) => ({
      currency,
      total,
      count,
      average,
      highest: highest?.id,
    })),
    [
      { currency: "INR", total: 100, count: 1, average: 100, highest: "inr" },
      { currency: "GBP", total: 50, count: 1, average: 50, highest: "gbp" },
      { currency: "USD", total: 200, count: 1, average: 200, highest: "usd" },
    ]
  );
});

test("places legacy receipts with no currency in a separate unavailable bucket", () => {
  const analytics = calculateSpendingAnalytics(
    [
      makeBill({ id: "inr", total: 100, currency: "INR" }),
      makeBill({ id: "legacy", total: 250, currency: undefined }),
    ],
    "all-time",
    now
  );

  assert.equal(analytics.currencies.length, 2);
  assert.equal(analytics.currencies[0].total, 100);
  assert.equal(analytics.currencies[1].currency, null);
  assert.equal(analytics.currencies[1].total, 250);
});

test("keeps invalid dates in all-time summaries but excludes them from date presets and trends", () => {
  const invalidDateBill = makeBill({ date: "not a date", total: 80 });

  const allTime = calculateSpendingAnalytics([invalidDateBill], "all-time", now);
  const thisMonth = calculateSpendingAnalytics(
    [invalidDateBill],
    "this-month",
    now
  );

  assert.equal(allTime.currencies[0].total, 80);
  assert.equal(allTime.currencies[0].monthlyTrend.every((month) => month.count === 0), true);
  assert.equal(thisMonth.transactionCount, 0);
});

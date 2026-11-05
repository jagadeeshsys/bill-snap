import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBillDate,
  summarizeMonthlyBills,
} from "../src/services/dashboardMetrics.ts";
import type { SavedBill } from "../src/services/storage.ts";

function makeBill(overrides: Partial<SavedBill> = {}): SavedBill {
  return {
    id: "bill-1",
    merchant: "NIDHI MOTORS",
    date: "05-11-2026",
    total: 2841,
    category: "Transport",
    imageName: "receipt.jpg",
    savedAt: "2026-11-05T12:00:00.000Z",
    ...overrides,
  };
}

test("parses DD-MM-YYYY as a local calendar date", () => {
  const date = parseBillDate("05-11-2026");

  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 10);
  assert.equal(date.getDate(), 5);
});

test("rejects impossible bill dates", () => {
  assert.equal(parseBillDate("31-11-2026"), null);
});

test("includes November 5, 2026 in November monthly totals and counts", () => {
  const summary = summarizeMonthlyBills(
    [makeBill()],
    10,
    2026
  );

  assert.equal(summary.count, 1);
  assert.equal(summary.total, 2841);
  assert.equal(summary.categoryTotals.Transport, 2841);
});

test("counts and totals each saved bill once and excludes other months", () => {
  const bills = [
    makeBill(),
    makeBill({
      id: "bill-2",
      merchant: "Corner Cafe",
      date: "15-11-2026",
      total: 450,
      category: "Food",
    }),
    makeBill({
      id: "bill-3",
      date: "05-10-2026",
      total: 100,
    }),
  ];

  const summary = summarizeMonthlyBills(bills, 10, 2026);

  assert.equal(summary.count, 2);
  assert.equal(summary.total, 3291);
  assert.equal(summary.categoryTotals.Transport, 2841);
  assert.equal(summary.categoryTotals.Food, 450);
});

test("supports ISO dates already present in saved records", () => {
  const summary = summarizeMonthlyBills(
    [makeBill({ date: "2026-11-05" })],
    10,
    2026
  );

  assert.equal(summary.count, 1);
  assert.equal(summary.total, 2841);
});

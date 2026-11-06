import assert from "node:assert/strict";
import test from "node:test";
import {
  queryBills,
  type ExpenseSortOrder,
} from "../src/services/expenseManagement.ts";
import type { SavedBill } from "../src/services/storage.ts";

function makeBill(overrides: Partial<SavedBill> = {}): SavedBill {
  return {
    id: "bill-1",
    merchant: "Nidhi Motors",
    date: "05-11-2026",
    total: 2841,
    category: "Transport",
    currency: "INR",
    imageName: "receipt.jpg",
    savedAt: "2026-11-05T12:00:00.000Z",
    ...overrides,
  };
}

const bills = [
  makeBill({ id: "one", merchant: "Nidhi Motors" }),
  makeBill({
    id: "two",
    merchant: "Corner Cafe",
    date: "01-11-2026",
    total: 450,
    category: "Food",
    savedAt: "2026-11-01T12:00:00.000Z",
  }),
  makeBill({
    id: "three",
    merchant: "Acme Market",
    date: "15-11-2026",
    total: 5400,
    category: "Groceries",
    savedAt: "2026-11-15T12:00:00.000Z",
  }),
];

test("searches merchants immediately without regard to case", () => {
  assert.deepEqual(
    queryBills(bills, { search: "cOrNeR" }).map((bill) => bill.id),
    ["two"]
  );
});

test("filters by category, inclusive date range, and inclusive amount range together", () => {
  const result = queryBills(bills, {
    category: "Transport",
    fromDate: "2026-11-05",
    toDate: "2026-11-05",
    minAmount: 2841,
    maxAmount: 2841,
  });

  assert.deepEqual(result.map((bill) => bill.id), ["one"]);
});

test("excludes unparseable dates when a date filter is active", () => {
  const result = queryBills(
    [makeBill({ date: "unknown" })],
    { fromDate: "2026-11-01" }
  );

  assert.deepEqual(result, []);
});

test("sorts by each supported order without mutating the source array", () => {
  const expected: Record<ExpenseSortOrder, string[]> = {
    newest: ["three", "one", "two"],
    oldest: ["two", "one", "three"],
    highest: ["three", "one", "two"],
    lowest: ["two", "one", "three"],
    merchant: ["three", "two", "one"],
  };
  const originalOrder = bills.map((bill) => bill.id);

  for (const [sortBy, ids] of Object.entries(expected) as [
    ExpenseSortOrder,
    string[],
  ][]) {
    assert.deepEqual(
      queryBills(bills, { sortBy }).map((bill) => bill.id),
      ids,
      `${sortBy} order`
    );
  }

  assert.deepEqual(
    bills.map((bill) => bill.id),
    originalOrder
  );
});

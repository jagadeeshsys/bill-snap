import assert from "node:assert/strict";
import test from "node:test";
import {
  findProbableDuplicate,
  normalizeSavedBillDate,
} from "../src/services/storage.ts";
import type { SavedBill } from "../src/services/storage.ts";

function makeSavedBill(overrides: Partial<SavedBill> = {}): SavedBill {
  return {
    id: "bill-1",
    merchant: "NIDHI MOTORS",
    date: "05-11-2026",
    total: 2841,
    category: "Transport",
    imageName: "invoice-001.jpg",
    savedAt: "2026-11-05T12:00:00.000Z",
    ...overrides,
  };
}

test("normalizes valid receipt dates and rejects invalid calendar dates", () => {
  assert.equal(normalizeSavedBillDate("05-11-2026"), "2026-11-05");
  assert.equal(normalizeSavedBillDate("2026-11-05"), "2026-11-05");
  assert.equal(normalizeSavedBillDate("31-02-2026"), null);
  assert.equal(normalizeSavedBillDate("not a date"), null);
});

test("detects normalized merchant/date duplicates with small OCR amount differences", () => {
  const duplicate = findProbableDuplicate(
    {
      merchant: "Nidhi-Motors",
      date: "05/11/2026",
      total: 2841.36,
      imageName: "bill-image.jpg",
    },
    [makeSavedBill()]
  );

  assert.equal(duplicate?.id, "bill-1");
});

test("uses a matching meaningful image name as additional duplicate evidence", () => {
  const duplicate = findProbableDuplicate(
    {
      merchant: "Nidhi Motors",
      date: "05-11-2026",
      total: 3000,
      imageName: "invoice-001.jpg",
    },
    [makeSavedBill()]
  );

  assert.equal(duplicate?.id, "bill-1");
});

test("does not flag different same-day purchases from the same merchant", () => {
  const duplicate = findProbableDuplicate(
    {
      merchant: "Nidhi Motors",
      date: "05-11-2026",
      total: 7200,
      imageName: "separate-purchase.jpg",
    },
    [makeSavedBill()]
  );

  assert.equal(duplicate, null);
});

test("does not use generic processed image names as duplicate evidence", () => {
  const duplicate = findProbableDuplicate(
    {
      merchant: "Nidhi Motors",
      date: "05-11-2026",
      total: 3000,
      imageName: "bill-image.jpg",
    },
    [makeSavedBill({ imageName: "bill-image.jpg" })]
  );

  assert.equal(duplicate, null);
});

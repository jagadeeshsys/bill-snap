import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrency } from "../src/services/currency.ts";

test("formats whole rupee amounts with exactly two decimal places", () => {
  assert.equal(formatCurrency(2841), "₹2,841.00");
});

test("formats paise without appending a second decimal suffix", () => {
  assert.equal(formatCurrency(5682.36), "₹5,682.36");
});

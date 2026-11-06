import assert from "node:assert/strict";
import test from "node:test";
import { classifyBillText } from "../src/services/billClassifier.ts";

test("classifies an invoice with independent transaction signals", () => {
  const result = classifyBillText(
    [
      "Tax Invoice",
      "Bluebird Retail Pvt Ltd",
      "Description Qty Rate",
      "Repair service 1 2,841.00",
      "GSTIN: 29ABCDE1234F1Z5",
      "Invoice Amount Payable ₹2,841.00",
    ].join("\n")
  );

  assert.equal(result.status, "bill");
  assert.ok(result.reasons.length > 0);
});

test("classifies a receipt with merchant, amount, and payment details", () => {
  const result = classifyBillText(
    [
      "Receipt",
      "Corner Cafe",
      "Coffee and sandwich",
      "Total ₹450.00",
      "Paid by UPI",
    ].join("\n")
  );

  assert.equal(result.status, "bill");
});

test("does not reject an invoice because OCR text indicates a screenshot", () => {
  const result = classifyBillText(
    [
      "Screenshot 10:42 WhatsApp",
      "Invoice",
      "Bluebird Retail",
      "Item Description",
      "Total Payable ₹450.00",
    ].join("\n")
  );

  assert.equal(result.status, "bill");
});

test("rejects identity-card OCR text", () => {
  const result = classifyBillText(
    "Government of India Aadhaar Card Name Date of Birth Gender Address"
  );

  assert.equal(result.status, "not_bill");
});

test("rejects chat screenshot OCR text when no transaction details exist", () => {
  const result = classifyBillText(
    "WhatsApp Last Seen 10:42 AM Message sent Delivered Replying to message"
  );

  assert.equal(result.status, "not_bill");
});

test("rejects product-label OCR text without transaction evidence", () => {
  const result = classifyBillText(
    "Product name ingredients net weight MRP 250 best before manufactured on"
  );

  assert.equal(result.status, "not_bill");
});

test("rejects a timetable that has dates and times but no transaction evidence", () => {
  const result = classifyBillText(
    "College timetable Monday Tuesday Wednesday 09:00 AM Lecture Period No Semester"
  );

  assert.equal(result.status, "not_bill");
});

test("rejects a restaurant menu without proof of payment", () => {
  const result = classifyBillText(
    "Our Menu Starters Main Course Chef's Special Allergen information"
  );

  assert.equal(result.status, "not_bill");
});

test("returns uncertain for weak or unreadable OCR", () => {
  const result = classifyBillText("Store total 450");

  assert.equal(result.status, "uncertain");
  assert.ok(result.reasons.length > 0);
});

test("returns uncertain for ambiguous documents with conflicting signals", () => {
  const result = classifyBillText(
    [
      "Invoice",
      "Identity Card",
      "Bluebird Services",
      "Amount Payable ₹450.00",
    ].join("\n")
  );

  assert.equal(result.status, "uncertain");
  assert.ok(result.reasons.some((reason) => reason.includes("conflict")));
});

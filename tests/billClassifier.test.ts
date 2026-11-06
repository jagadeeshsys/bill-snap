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

test("recognizes an itemized grocery receipt when the total row OCR is damaged", () => {
  const result = classifyBillText(
    [
      "TESCO Organic Tomatoes 500g £3.00",
      "TESCO Organic Carrots 700g £1.35",
      "Subtotal £88.74",
      "Giftcard £66.29",
      "Clubcard points earned",
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

test("rejects a jewelry valuation document even when it has tax and totals", () => {
  const result = classifyBillText(
    "RUBIN BROTHERS Diamond and Jewelry Wholesalers Jewelry Diamond Stud Replacement Value $6,235.00 Subtotal $6,235.00 Tax $436.45 Total Replacement Value $7,138.45"
  );

  assert.equal(result.status, "not_bill");
});

test("rejects an OCR-readable salon price board without transaction evidence", () => {
  const result = classifyBillText(
    "Henry's Barber Festival Offers Combo Packages Premium Grooming Women's Beauty Combos Hair Cut ₹599 Facial ₹999"
  );

  assert.equal(result.status, "not_bill");
});

test("recognizes itemized receipts with comma-grouped prices and a plain total", () => {
  const result = classifyBillText(
    "ICHIBAN SUSHI\n1 Beef Ramen 42,000\n1 Katsu Roll 35,000\nSubtotal 223,000\nService Charge 11,150\nTax 23,415\nTotal 257,565"
  );

  assert.equal(result.status, "bill");
});

test("recognizes a restaurant receipt with a Net Payable label", () => {
  const result = classifyBillText(
    "Zaika Family Restaurant\nDate 26-Sep-2025\nPaneer Masala 1300.00\nButter Naan 400.00\nNet Payable 1050.00"
  );

  assert.equal(result.status, "bill");
});

test("recognizes a handwritten tax invoice when OCR damages the invoice heading", () => {
  const result = classifyBillText(
    "GST IN 29JBGPS3204E1ZK INVOIGENGT DATE INVOICE NO 530 DESCRIPTION OF GOODS GRAND TOTAL"
  );

  assert.equal(result.status, "bill");
});

test("rejects a timetable that has dates and times but no transaction evidence", () => {
  const result = classifyBillText(
    "College timetable Monday Tuesday Wednesday 09:00 AM Lecture Period No Semester"
  );

  assert.equal(result.status, "not_bill");
});

test("rejects a course schedule when OCR misses the word timetable", () => {
  const result = classifyBillText(
    "EC25CO06 Electromagnetic Fields Nov 10:00 AM to 1:00 PM MA25C11 Probability Nov 10:00 AM"
  );

  assert.equal(result.status, "not_bill");
});

test("does not mistake a venue named Sunday House for a timetable", () => {
  const result = classifyBillText(
    "The Sunday House Restaurant Date 27/12/25 19:02 Bill No 41673 Item Qty Price Amount 385.00 765.00 Grand Total 2015.00"
  );

  assert.equal(result.status, "bill");
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

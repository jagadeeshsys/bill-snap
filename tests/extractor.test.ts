import assert from "node:assert/strict";
import test from "node:test";
import {
  extractBillData,
  markFieldUserCorrected,
} from "../src/services/extractor.ts";

test("uses the invoice amount payable instead of net amount and round off", () => {
  const bill = extractBillData(
    [
      "Tax Invoice",
      "Net Amount ₹2,841.36",
      "Round Off -₹0.36",
      "Invoice Amount Payable ₹2,841.00",
    ].join("\n")
  );

  assert.equal(bill.total.value, 2841);
});

test("associates a payable amount with its label when labels share a line", () => {
  const bill = extractBillData(
    "Net Amount ₹2,841.36 Round Off -₹0.36 Invoice Amount Payable ₹2,841.00"
  );

  assert.equal(bill.total.value, 2841);
});

test("parses Indian comma grouping and currency prefixes", () => {
  const bill = extractBillData(
    ["Invoice", "Invoice Amount Payable", "INR 12,34,567.89"].join("\n")
  );

  assert.equal(bill.total.value, 1234567.89);
});

test("supports whole-rupee payable amounts", () => {
  const bill = extractBillData("Invoice Amount Payable: ₹2,841/-");

  assert.equal(bill.total.value, 2841);
});

test("does not mistake a negative round-off for a payable amount", () => {
  const bill = extractBillData(
    ["Invoice Amount Payable", "-₹0.36", "Grand Total ₹5.00"].join("\n")
  );

  assert.equal(bill.total.value, 5);
});

test("uses grand total ahead of net amount when no payable label exists", () => {
  const bill = extractBillData(
    ["Net Amount ₹2,841.36", "Grand Total ₹2,841.00"].join("\n")
  );

  assert.equal(bill.total.value, 2841);
});

test("does not treat subtotal or tax payable rows as the final payable", () => {
  const bill = extractBillData(
    [
      "Subtotal Payable ₹2,900.00",
      "Tax Amount Payable ₹9,999.00",
      "Invoice Amount Payable ₹2,841.00",
    ].join("\n")
  );

  assert.equal(bill.total.value, 2841);
});

test("extracts a business name from a conventional invoice header", () => {
  const bill = extractBillData(
    [
      "NIDHI MOTORS",
      "12 MG Road, Bengaluru",
      "GSTIN: 29ABCDE1234F1Z5",
      "Invoice No: INV-2026-001",
      "Invoice Date: 05/11/2026",
      "Grand Total ₹2,841.00",
    ].join("\n")
  );

  assert.equal(bill.merchant.value, "NIDHI MOTORS");
});

test("ignores invoice copy labels and tax-invoice titles when selecting merchant", () => {
  const bill = extractBillData(
    [
      "A ICE ORIGINAL FOR RECIPIENT",
      "TAX INVOICE",
      "NIDHI MOTORS",
      "281/8, Near Silk Board Circle, Bengaluru",
      "GSTIN No: 29ABCDE1234F1Z5",
      "Invoice No: HM-2026-001",
      "Invoice Amount Payable ₹2,841.00",
      "For NIDHI MOTORS",
    ].join("\n")
  );

  assert.equal(bill.merchant.value, "NIDHI MOTORS");
});

test("extracts merchant from Nidhi invoice OCR with noisy copy and footer text", () => {
  const bill = extractBillData(
    [
      "A ICE ORIGINAL FOR RECIPIENT",
      "TAX INVOICE",
      "NIDHI MOTORS",
      "281/8, Near Silk Board Circle, NH-7, Hosur Main Road, BOMMANAHALLL, BANGALORE",
      "State Code: 29",
      "Contact: 73563300092, 7353300002",
      "GSTIN No: 28ADAPR8841D1ZD",
      "Associate Dealer Authorised Dealer: Hero MotoCorp Ltd",
      "...",
      "For NIDH| MOTORS",
      "Authorised Signatory",
      "Invoice Amount Payable ₹2,841.00",
    ].join("\n")
  );

  assert.equal(bill.merchant.value, "NIDHI MOTORS");
});

test("rejects duplicate and triplicate recipient copy labels as merchants", () => {
  const bill = extractBillData(
    [
      "DUPLICATE FOR TRANSPORTER",
      "TRIPLICATE FOR SUPPLIER",
      "TAX INVOICE",
      "Northstar Auto Services",
      "Invoice Amount Payable ₹2,841.00",
    ].join("\n")
  );

  assert.equal(bill.merchant.value, "NORTHSTAR AUTO SERVICES");
});

test("extracts a merchant after a document title and labeled metadata", () => {
  const bill = extractBillData(
    [
      "TAX INVOICE",
      "Invoice Number: 1048",
      "Sakala Jewellery House",
      "GSTIN: 29ABCDE1234F1Z5",
      "Grand Total ₹16,800.00",
    ].join("\n")
  );

  assert.equal(bill.merchant.value, "SAKALA JEWELLERY HOUSE");
});

test("uses a labeled merchant field and avoids address, phone, tax, and footer lines", () => {
  const bill = extractBillData(
    [
      "Address: 8 Market Road",
      "Phone: 9876543210",
      "GSTIN: 29ABCDE1234F1Z5",
      "Merchant: Bluebird Retail",
      "Invoice No: 123456",
      "Thank you for your payment",
      "Grand Total ₹350.00",
    ].join("\n")
  );

  assert.equal(bill.merchant.value, "BLUEBIRD RETAIL");
});

test("does not return an uncertain merchant from OCR fragments or metadata", () => {
  const bill = extractBillData(
    [
      "Tax Invoice",
      "M1 X!",
      "Phone: 9876543210",
      "GSTIN: 29ABCDE1234F1Z5",
      "Invoice No: 123456",
      "Grand Total ₹350.00",
    ].join("\n")
  );

  assert.equal(bill.merchant.value, null);
  assert.equal(bill.merchant.confidence, "low");
});

test("extracts labeled invoice dates in common Indian formats", () => {
  const cases = [
    ["Invoice Date: 06/06/2026", "06-06-2026"],
    ["Bill Date: 06-06-2026", "06-06-2026"],
    ["Receipt Date: 06.06.2026", "06-06-2026"],
    ["Date of Purchase: 06/06/2026", "06-06-2026"],
    ["Date of Issue: 06-06-2026", "06-06-2026"],
  ];

  for (const [dateLine, expected] of cases) {
    const bill = extractBillData(
      [dateLine, "Grand Total ₹350.00"].join("\n")
    );

    assert.equal(bill.date.value, expected, dateLine);
  }
});

test("prefers the labeled invoice date over unrelated future dates", () => {
  const bill = extractBillData(
    [
      "Invoice Date: 06/06/2026",
      "Next Service Due: 06/06/2027",
      "Insurance Expiry: 06/06/2028",
      "Delivery Date: 07/06/2027",
      "Payment Due Date: 20/06/2026",
      "Warranty Expiry: 06/06/2029",
      "Grand Total ₹350.00",
    ].join("\n")
  );

  assert.equal(bill.date.value, "06-06-2026");
});

test("supports a labeled invoice date on the following OCR line", () => {
  const bill = extractBillData(
    [
      "Date of Issue",
      "05.11.2026",
      "Insurance Expiry: 05.11.2028",
      "Grand Total ₹350.00",
    ].join("\n")
  );

  assert.equal(bill.date.value, "05-11-2026");
});

test("keeps an invoice date when an unrelated future date shares its line", () => {
  const bill = extractBillData(
    [
      "Invoice Date: 06/06/2026 Next Service Due: 06/06/2027",
      "Grand Total ₹350.00",
    ].join("\n")
  );

  assert.equal(bill.date.value, "06-06-2026");
});

test("rejects invalid calendar dates and dates with a missing year", () => {
  const invalidDate = extractBillData(
    ["Invoice Date: 31/02/2026", "Grand Total ₹350.00"].join("\n")
  );
  const missingYear = extractBillData(
    ["Invoice Date: 06/06", "Grand Total ₹350.00"].join("\n")
  );

  assert.equal(invalidDate.date.value, null);
  assert.equal(missingYear.date.value, null);
});

test("does not substitute excluded future dates for an unreadable invoice date", () => {
  const bill = extractBillData(
    [
      "Invoice Date: 0O/06/2026",
      "Next Service Due: 06/06/2027",
      "Grand Total ₹350.00",
    ].join("\n")
  );

  assert.equal(bill.date.value, null);
});

test("returns no date when multiple invoice-date labels conflict", () => {
  const bill = extractBillData(
    [
      "Invoice Date: 06/06/2026",
      "Receipt Date: 07/06/2026",
      "Grand Total ₹350.00",
    ].join("\n")
  );

  assert.equal(bill.date.value, null);
  assert.equal(bill.date.confidence, "low");
});

test("merchant confidence reflects business evidence and competing candidates", () => {
  const high = extractBillData(
    ["NIDHI MOTORS", "Invoice", "Invoice Amount Payable ₹2,841.00"].join(
      "\n"
    )
  );
  const medium = extractBillData(
    ["Bluebird Market", "Invoice", "Invoice Amount Payable ₹350.00"].join(
      "\n"
    )
  );
  const low = extractBillData(
    [
      "Bluebird Motors",
      "Greenfield Motors",
      "Invoice",
      "Invoice Amount Payable ₹350.00",
    ].join("\n")
  );

  assert.equal(high.merchant.confidence, "high");
  assert.equal(medium.merchant.confidence, "medium");
  assert.equal(low.merchant.confidence, "low");
});

test("date confidence distinguishes labeled, fallback, and conflicting dates", () => {
  const high = extractBillData(
    ["Invoice Date: 06/06/2026", "Invoice Amount Payable ₹350.00"].join(
      "\n"
    )
  );
  const medium = extractBillData(
    ["Date 06/06/2026", "Invoice Amount Payable ₹350.00"].join("\n")
  );
  const low = extractBillData(
    [
      "Invoice Date: 06/06/2026",
      "Receipt Date: 07/06/2026",
      "Invoice Amount Payable ₹350.00",
    ].join("\n")
  );

  assert.equal(high.date.confidence, "high");
  assert.equal(medium.date.confidence, "medium");
  assert.equal(low.date.confidence, "low");
});

test("total confidence reflects label strength and competing totals", () => {
  const high = extractBillData(
    "Invoice Amount Payable ₹2,841.00"
  );
  const medium = extractBillData("Invoice\nNet Amount ₹2,841.00");
  const low = extractBillData(
    ["Amount Payable ₹2,841.00", "Total Payable ₹2,840.00"].join("\n")
  );

  assert.equal(high.total.confidence, "high");
  assert.equal(medium.total.confidence, "medium");
  assert.equal(low.total.confidence, "low");
});

test("category confidence reflects keyword strength and category competition", () => {
  const high = extractBillData(
    [
      "Cafe Restaurant",
      "Food dining",
      "Invoice Amount Payable ₹450.00",
    ].join("\n")
  );
  const medium = extractBillData(
    ["Acme Store", "Food service", "Invoice Amount Payable ₹450.00"].join(
      "\n"
    )
  );
  const low = extractBillData(
    ["Food gold", "Invoice Amount Payable ₹450.00"].join("\n")
  );

  assert.equal(high.category.confidence, "high");
  assert.equal(medium.category.confidence, "medium");
  assert.equal(low.category.confidence, "low");
});

test("user correction preserves extraction confidence and records review state", () => {
  const original = {
    value: "M1 X!",
    confidence: "low" as const,
    needsReview: true,
  };
  const corrected = markFieldUserCorrected(original, "NIDHI MOTORS");

  assert.equal(corrected.value, "NIDHI MOTORS");
  assert.equal(corrected.confidence, "low");
  assert.equal(corrected.needsReview, false);
  assert.equal(corrected.reviewed, true);
  assert.equal(corrected.userCorrected, true);
});

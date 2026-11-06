import assert from "node:assert/strict";
import test from "node:test";
import {
  extractBillData,
  markFieldUserCorrected,
} from "../src/services/extractor.ts";
import { classifyBillText } from "../src/services/billClassifier.ts";
import {
  combineOCRPasses,
  convertOCRBlocks,
  groupOCRWordsIntoLines,
  type OCRPassResult,
} from "../src/services/ocrEvidence.ts";

function makeOCRInput(text: string, blocks: unknown[] = []) {
  const convertedBlocks = convertOCRBlocks(blocks);
  const primary: OCRPassResult = {
    source: "processed-full",
    text,
    confidence: 88,
    pageSegmentationMode: "3",
    region: null,
    width: 800,
    height: 1200,
    blocks: convertedBlocks,
    lines: groupOCRWordsIntoLines(
      convertedBlocks.flatMap((block) => block.words)
    ),
  };

  return combineOCRPasses([primary]);
}

function makeNativeLine(
  words: Array<{ text: string; x0: number; x1: number }>,
  y0: number
) {
  return {
    words: words.map((word) => ({
      text: word.text,
      confidence: 90,
      bbox: {
        x0: word.x0,
        y0,
        x1: word.x1,
        y1: y0 + 20,
      },
    })),
  };
}

function makeOCRBlock(words: string[], y0: number) {
  const positionedWords = words.map((text, index) => ({
    text,
    x0: index * 100,
    x1: index * 100 + 80,
  }));
  return {
    text: words.join(" "),
    confidence: 90,
    bbox: {
      x0: 0,
      y0,
      x1: Math.max(1, words.length * 100),
      y1: y0 + 20,
    },
    paragraphs: [{ lines: [makeNativeLine(positionedWords, y0)] }],
  };
}

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

test("detects supported currency codes and symbols without changing selected totals", () => {
  const cases = [
    ["Total ₹1,234.50", "INR", 1234.5],
    ["Total Rs. 12,34,567.89", "INR", 1234567.89],
    ["Total INR 1234.50", "INR", 1234.5],
    ["Total £1,234.50", "GBP", 1234.5],
    ["Total GBP 12.20", "GBP", 12.2],
    ["Total US$1,234.50", "USD", 1234.5],
    ["Total USD 1,234.50", "USD", 1234.5],
    ["Total €1.234,50", "EUR", 1234.5],
    ["Total 1.234,50 EUR", "EUR", 1234.5],
    ["Total EUR: 1.234,50", "EUR", 1234.5],
  ] as const;

  for (const [text, code, expectedAmount] of cases) {
    const bill = extractBillData(text);
    assert.equal(bill.total.value, expectedAmount, text);
    assert.equal(bill.currency.selectedAmount, expectedAmount, text);
    assert.equal(bill.currency.normalizedAmount, expectedAmount, text);
    assert.equal(bill.currency.code, code, text);
    assert.equal(bill.currency.confidence, "high", text);
    assert.equal(bill.currency.normalization, "certain", text);
    assert.ok(bill.currency.originalText?.length, text);
  }
});

test("preserves currency markers with punctuation and whitespace", () => {
  const cases = [
    ["Invoice Amount Payable USD: 1,234.50", "USD", "USD: 1,234.50", 1234.5],
    ["Invoice Amount Payable GBP: 13.50", "GBP", "GBP: 13.50", 13.5],
    ["Invoice Amount Payable EUR: 1.234,50", "EUR", "EUR: 1.234,50", 1234.5],
    ["Invoice Amount Payable INR: ₹1,234.50", "INR", "INR: ₹1,234.50", 1234.5],
    ["Total: USD 1,234.50", "USD", "USD 1,234.50", 1234.5],
  ] as const;

  for (const [text, code, originalText, expectedAmount] of cases) {
    const bill = extractBillData(text);
    assert.equal(bill.currency.code, code, text);
    assert.equal(bill.currency.originalText, originalText, text);
    assert.equal(bill.currency.normalizedAmount, expectedAmount, text);
  }
});

test("keeps ambiguous bare dollar symbols from implying USD", () => {
  const bill = extractBillData("Total $1,234.50");

  assert.equal(bill.total.value, 1234.5);
  assert.equal(bill.currency.code, null);
  assert.equal(bill.currency.confidence, "low");
  assert.equal(bill.currency.normalizedAmount, 1234.5);
  assert.equal(bill.currency.normalization, "certain");
  assert.match(bill.currency.reason, /bare dollar symbol is ambiguous/);
});

test("normalizes amounts without inventing a missing currency", () => {
  const bill = extractBillData("Invoice Amount Payable 1234.50");

  assert.equal(bill.total.value, 1234.5);
  assert.equal(bill.currency.selectedAmount, 1234.5);
  assert.equal(bill.currency.normalizedAmount, 1234.5);
  assert.equal(bill.currency.code, null);
  assert.equal(bill.currency.originalText, "1234.50");
  assert.equal(bill.currency.normalization, "certain");
});

test("reports ambiguous separator normalization instead of guessing", () => {
  const bill = extractBillData("Invoice Amount Payable 1,234");

  assert.equal(bill.total.value, 1234);
  assert.equal(bill.currency.normalizedAmount, null);
  assert.equal(bill.currency.normalization, "ambiguous");
});

test("reports conflicting currency indicators on the selected amount", () => {
  const bill = extractBillData("Invoice Amount Payable GBP 13.50 EUR");

  assert.equal(bill.total.value, 13.5);
  assert.equal(bill.currency.normalizedAmount, 13.5);
  assert.equal(bill.currency.code, null);
  assert.equal(bill.currency.confidence, "low");
  assert.match(bill.currency.reason, /conflicting currency indicators/);
});

test("does not guess between conflicting currency codes", () => {
  const bill = extractBillData("Invoice Amount Payable GBP USD 13.50");

  assert.equal(bill.total.value, 13.5);
  assert.equal(bill.currency.code, null);
  assert.equal(bill.currency.confidence, "low");
  assert.equal(bill.currency.originalText, "GBP USD 13.50");
  assert.match(bill.currency.reason, /conflicting currency indicators/);
});

test("does not guess between conflicting currency symbols", () => {
  const bill = extractBillData("Invoice Amount Payable £ €13.50");

  assert.equal(bill.total.value, 13.5);
  assert.equal(bill.currency.code, null);
  assert.equal(bill.currency.confidence, "low");
  assert.equal(bill.currency.originalText, "£ €13.50");
  assert.match(bill.currency.reason, /conflicting currency indicators/);
});

test("does not guess when a currency code and symbol disagree", () => {
  const bill = extractBillData("Invoice Amount Payable GBP €13.50");

  assert.equal(bill.total.value, 13.5);
  assert.equal(bill.currency.code, null);
  assert.equal(bill.currency.confidence, "low");
  assert.equal(bill.currency.originalText, "GBP €13.50");
  assert.match(bill.currency.reason, /conflicting currency indicators/);
});

test("detects currency only from the selected payable candidate", () => {
  const bill = extractBillData(
    ["Net Amount INR 20.00", "Invoice Amount Payable GBP 13.50"].join("\n")
  );

  assert.equal(bill.total.value, 13.5);
  assert.equal(bill.currency.code, "GBP");
  assert.equal(bill.currency.normalizedAmount, 13.5);
});

test("ignores currency indicators on unrelated receipt lines", () => {
  const bill = extractBillData(
    [
      "Receipt",
      "Subtotal USD 25.00",
      "Payment Received EUR 20.00",
      "Invoice Amount Payable GBP 13.50",
    ].join("\n")
  );

  assert.equal(bill.total.value, 13.5);
  assert.equal(bill.currency.code, "GBP");
  assert.equal(bill.currency.originalText, "GBP 13.50");
});

test("handles OCR punctuation and whitespace around explicit currency", () => {
  const bill = extractBillData("Invoice Amount Payable:   GBP   13.50");

  assert.equal(bill.total.value, 13.5);
  assert.equal(bill.currency.code, "GBP");
  assert.equal(bill.currency.normalizedAmount, 13.5);
  assert.equal(bill.currency.normalization, "certain");
});

test("normalizes a European amount on the line following its payable label", () => {
  const bill = extractBillData(
    ["Invoice Amount Payable", "EUR: 1.234,50"].join("\n")
  );

  assert.equal(bill.total.value, 1234.5);
  assert.equal(bill.currency.code, "EUR");
  assert.equal(bill.currency.normalizedAmount, 1234.5);
  assert.equal(bill.currency.originalText, "EUR: 1.234,50");
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

test("does not associate B02 authorization-code OCR with Balance Due", () => {
  const bill = extractBillData(
    [
      "Receipt",
      "0 BALANCE DUE",
      "AUTH CODERS 7]",
      "01.9",
    ].join("\n")
  );

  assert.equal(bill.total.value, null);
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

test("does not select total tax or tax total rows over payable amount", () => {
  const cases = [
    ["Total Tax ₹500.00", "Invoice Amount Payable ₹7,880.00"],
    ["Tax Total ₹500.00", "Invoice Amount Payable ₹7,880.00"],
  ];

  for (const [taxLine, payableLine] of cases) {
    const bill = extractBillData(
      ["Tax Invoice", taxLine, payableLine].join("\n")
    );
    assert.equal(bill.total.value, 7880, taxLine);
  }
});

test("does not select item totals, discounts, or savings as final totals", () => {
  const excludedLines = [
    "Item Total ₹500.00",
    "Total Discount ₹50.00",
    "Total Savings ₹25.00",
    "Subtotal ₹700.00",
    "Round Off ₹0.36",
  ];

  for (const excludedLine of excludedLines) {
    const bill = extractBillData(
      [
        "Tax Invoice",
        excludedLine,
        "Invoice Amount Payable ₹7,880.00",
      ].join("\n")
    );
    assert.equal(bill.total.value, 7880, excludedLine);
  }
});

test("does not extract Total Tax as a payable total by itself", () => {
  const bill = extractBillData("Total Tax ₹500.00");

  assert.equal(bill.total.value, null);
});

test("does not extract Tax Total as a payable total by itself", () => {
  const bill = extractBillData("Tax Total ₹500.00");

  assert.equal(bill.total.value, null);
});

test("does not extract Item Total as a payable total by itself", () => {
  const bill = extractBillData("Item Total ₹500.00");

  assert.equal(bill.total.value, null);
});

test("does not extract Total Discount as a payable total by itself", () => {
  const bill = extractBillData("Total Discount ₹50.00");

  assert.equal(bill.total.value, null);
});

test("does not extract Total Savings as a payable total by itself", () => {
  const bill = extractBillData("Total Savings ₹25.00");

  assert.equal(bill.total.value, null);
});

test("Invoice Amount Payable takes precedence over Grand Total", () => {
  const bill = extractBillData(
    [
      "Tax Invoice",
      "Grand Total ₹7,900.00",
      "Invoice Amount Payable ₹7,880.00",
    ].join("\n")
  );

  assert.equal(bill.total.value, 7880);
});

test("extracts B13 total amount with comma-independent INR numeric text", () => {
  const bill = extractBillData(
    ["Tax Invoice", "Total Amount: 7880.00"].join("\n")
  );

  assert.equal(bill.total.value, 7880);
});

test("extracts GBP totals from evaluation receipt OCR labels", () => {
  const cases = [
    ["Total GBP 13.50", 13.5],
    ["Total £12.20", 12.2],
    ["TOTAL £63.93", 63.93],
  ];

  for (const [text, expected] of cases) {
    const bill = extractBillData(["Receipt", text].join("\n"));
    assert.equal(bill.total.value, expected, text);
  }
});

test("does not treat a number embedded in corrupted OCR text as a total", () => {
  const bill = extractBillData("De 2SC riptio ion Total");

  assert.equal(bill.total.value, null);
});

test("extracts the B06 GBP total without an embedded OCR fragment", () => {
  const bill = extractBillData("TOTAL GBP 13.50");

  assert.equal(bill.total.value, 13.5);
});

test("ignores an embedded OCR number when extracting the B06 GBP total", () => {
  const bill = extractBillData(
    ["De 2SC riptio ion Total", "TOTAL GBP 13.50"].join("\n")
  );

  assert.equal(bill.total.value, 13.5);
});

test("extracts the B06 total from complete receipt OCR with medium confidence", () => {
  const bill = extractBillData(
    [
      "FASHION & HOME OUTLET",
      "Clacton on Sea CO15 4TL",
      "CHOICE - CLACTON",
      "CLACTON FACTORY",
      "STEPHENSON ROAD WEST",
      "CLACTON-ON-SEA, ESSEX, CO15",
      "",
      "01/10/2026 17:40:14",
      "",
      "SALE (BP13.50",
      "TOTAL GBP 13.50",
      "PLEASE DEBIT MY AC OUNT",
    ].join("\n")
  );

  assert.equal(bill.total.value, 13.5);
  assert.equal(bill.total.confidence, "medium");
});

test("extracts total paid and comma-grouped amounts without assuming INR", () => {
  const bill = extractBillData(
    ["Receipt", "Total Paid GBP 2,841.00"].join("\n")
  );

  assert.equal(bill.total.value, 2841);
});

test("keeps conflicting equally ranked final totals uncertain", () => {
  const bill = extractBillData(
    ["Receipt", "Total £12.20", "Total £13.20"].join("\n")
  );

  assert.equal(bill.total.value, null);
  assert.equal(bill.total.confidence, "low");
});

test("B15 payable total takes precedence over net, round-off, and item values", () => {
  const bill = extractBillData(
    [
      "Tax Invoice",
      "Item Amount ₹257.93",
      "Net Amount ₹2,841.36",
      "Round Off -₹0.36",
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

test("retains the B02 Sainsbury's candidate without inventing fields", () => {
  const text = [
    "ny",
    "Sainsbury's",
    "ood for all",
    "HADLETGH Jel ofus",
    "01473 286660",
    "Salnsburyls Superuarkets Lid",
    "Char ter NoUSE Street | ondor ECIM lA",
    "We. S81 nsburys, co , uk",
    "Vat Number . 660 4548 36",
  ].join("\n");
  const classification = classifyBillText(text);
  const bill = extractBillData(text);

  assert.equal(classification.status, "uncertain");
  assert.equal(bill.isBill, false);
  assert.equal(bill.merchant.value, "SAINSBURY'S");
  assert.equal(bill.date.value, null);
  assert.equal(bill.total.value, null);
});

test("a merchant-like word does not turn a classified non-bill into a bill", () => {
  const text =
    "TESCO Government of India Aadhaar Card Name Date of Birth Gender Address";
  const classification = classifyBillText(text);
  const bill = extractBillData(text);

  assert.equal(classification.status, "not_bill");
  assert.equal(bill.isBill, false);
});

test("extracts plausible single-token supermarket merchant headers", () => {
  const cases = [
    ["Sainsbury's", "SAINSBURY'S"],
    ["Tesco", "TESCO"],
    ["NEW ASIAN SUPER MARKET", "NEW ASIAN SUPER MARKET"],
    ["Sri Rajalakshmi Silvermine", "SRI RAJALAKSHMI SILVERMINE"],
  ];

  for (const [merchant, expected] of cases) {
    const bill = extractBillData(
      [merchant, "Receipt", "Total £12.20"].join("\n")
    );
    assert.equal(bill.merchant.value, expected, merchant);
  }
});

test("does not select generic store and sales headings as merchants", () => {
  for (const heading of ["STORE", "SALES"]) {
    const bill = extractBillData(
      [heading, "Receipt", "Total £12.20"].join("\n")
    );
    assert.equal(bill.merchant.value, null, heading);
  }
});

test("prefers the invoice merchant over an affiliation description", () => {
  const bill = extractBillData(
    [
      "A UNIT OF RAJALAKSHMI JEWELLERY MART",
      "SRI RAJALAKSHMI SILVERMINE",
      "Tax Invoice",
      "Total Amount 7880.00",
    ].join("\n")
  );

  assert.equal(bill.merchant.value, "SRI RAJALAKSHMI SILVERMINE");
});

test("retains an affiliation-only merchant candidate with low confidence", () => {
  const bill = extractBillData(
    [
      "A UNIT OF RAJALAKSHMI JEWELLERY MART",
      "Tax Invoice",
      "Total Amount 7880.00",
    ].join("\n")
  );

  assert.equal(
    bill.merchant.value,
    "A UNIT OF RAJALAKSHMI JEWELLERY MART"
  );
  assert.equal(bill.merchant.confidence, "low");
});

test("preserves partial merchant OCR without inventing missing text", () => {
  const bill = extractBillData(
    ["OICE JB", "Receipt", "Total GBP 13.50"].join("\n")
  );

  assert.equal(bill.merchant.value, "OICE JB");
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

test("extracts abbreviated month dates in compact and spaced OCR formats", () => {
  const cases = [
    ["Invoice Date: 03NOV2026", "03-11-2026"],
    ["Invoice Date: 03 Nov 2026", "03-11-2026"],
    ["Invoice Date: 03-NOV-2026", "03-11-2026"],
    ["Invoice Date: 03-nOv-2026", "03-11-2026"],
  ];

  for (const [dateLine, expected] of cases) {
    const bill = extractBillData(
      [dateLine, "Total £12.20"].join("\n")
    );
    assert.equal(bill.date.value, expected, dateLine);
  }
});

test("rejects invalid abbreviated month dates and transaction/card dates", () => {
  const invalidDate = extractBillData(
    ["Invoice Date: 31-NOV-2026", "Total £12.20"].join("\n")
  );
  const unrelatedDate = extractBillData(
    [
      "Transaction Date: 03NOV2026",
      "Card Expiry: 03NOV2028",
      "Total £12.20",
    ].join("\n")
  );

  assert.equal(invalidDate.date.value, null);
  assert.equal(unrelatedDate.date.value, null);
});

test("does not use Date of Transaction as an invoice date", () => {
  const bill = extractBillData(
    [
      "Date of Transaction: 03NOV2026",
      "Receipt",
      "Total £12.20",
    ].join("\n")
  );

  assert.equal(bill.date.value, null);
});

test("extracts an unlabelled B06 receipt date after product and payment lines", () => {
  const bill = extractBillData(
    [
      "FASHION & HOME OUTLET",
      "Clacton on Sea CO15 4TL",
      "CHOICE - CLACTON",
      "CLACTON FACTORY",
      "STEPHENSON ROAD WEST",
      "CLACTON-ON-SEA, ESSEX, CO15",
      "ITEM 1 GBP 2.00",
      "ITEM 2 GBP 3.00",
      "ITEM 3 GBP 4.00",
      "ITEM 4 GBP 4.50",
      "CARD PAYMENT",
      "VISA",
      "APPROVED",
      "AID A000000000",
      "L",
      "01/10/2026 17:40:14",
      "RECEIPT NO. :10017]",
      "SALE GBP13.50",
      "TOTAL GBP 13.50",
    ].join("\n")
  );

  assert.equal(bill.date.value, "01-10-2026");
});

test("extracts an unlabelled date within the first twelve OCR lines", () => {
  const bill = extractBillData(
    ["Store", "01/10/2026", "Receipt", "Total GBP 13.50"].join("\n")
  );

  assert.equal(bill.date.value, "01-10-2026");
});

test("an explicit invoice date takes priority over later unlabelled dates", () => {
  const bill = extractBillData(
    [
      "Invoice Date: 01/10/2026",
      "Transaction information",
      "Card payment recorded",
      "12/10/2026",
      "Receipt",
      "Total GBP 13.50",
    ].join("\n")
  );

  assert.equal(bill.date.value, "01-10-2026");
});

test("excludes unlabelled transaction, payment, and card dates", () => {
  const bill = extractBillData(
    [
      "Transaction Date: 02/10/2026",
      "Payment Date: 03/10/2026",
      "Card Expiry: 04/10/2026",
      "Valid Thru: 05/10/2026",
      "Receipt",
      "Total GBP 13.50",
    ].join("\n")
  );

  assert.equal(bill.date.value, null);
});

test("does not choose between conflicting unlabelled dates", () => {
  const bill = extractBillData(
    [
      "Date printed 01/10/2026",
      "Date printed 02/10/2026",
      "Receipt",
      "Total GBP 13.50",
    ].join("\n")
  );

  assert.equal(bill.date.value, null);
  assert.equal(bill.date.confidence, "low");
});

test("rejects an invalid unlabelled date beyond the first twelve lines", () => {
  const bill = extractBillData(
    [
      "Receipt",
      "Product line 1",
      "Product line 2",
      "Product line 3",
      "Product line 4",
      "Product line 5",
      "Product line 6",
      "Product line 7",
      "Product line 8",
      "Product line 9",
      "Product line 10",
      "Product line 11",
      "31/02/2026",
      "Total GBP 13.50",
    ].join("\n")
  );

  assert.equal(bill.date.value, null);
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

test("records OCR source IDs, original text, labels, and reasons for selected fields", () => {
  const text = [
    "Bluebird Retail",
    "Invoice Date: 05/11/2026",
    "Invoice Amount Payable ₹350.00",
  ].join("\n");
  const evidence = makeOCRInput(text, [
    makeOCRBlock(["Bluebird", "Retail"], 10),
    makeOCRBlock(["Invoice", "Date:", "05/11/2026"], 50),
    makeOCRBlock(["Invoice", "Amount", "Payable", "₹350.00"], 90),
  ]);
  const bill = extractBillData(evidence);

  assert.equal(bill.merchant.value, "BLUEBIRD RETAIL");
  assert.equal(bill.date.value, "05-11-2026");
  assert.equal(bill.total.value, 350);
  assert.deepEqual(bill.evidence.merchant, {
    field: "merchant",
    selectedValue: "BLUEBIRD RETAIL",
    originalText: "Bluebird Retail",
    sourceBlockIds: ["block-0"],
    sourceWordIds: ["block-0-p0-l0-w0", "block-0-p0-l0-w1"],
    matchingLabel: null,
    reason: "header position",
    confidence: bill.merchant.confidence,
    sourceOCRPass: "processed-full",
  });
  assert.equal(bill.evidence.date.originalText, "05/11/2026");
  assert.deepEqual(bill.evidence.date.sourceBlockIds, ["block-1"]);
  assert.deepEqual(bill.evidence.date.sourceWordIds, ["block-1-p0-l0-w2"]);
  assert.equal(bill.evidence.date.matchingLabel, "Invoice Date");
  assert.equal(bill.evidence.date.reason, "explicit invoice-date label");
  assert.equal(bill.evidence.total.originalText, "₹350.00");
  assert.deepEqual(bill.evidence.total.sourceBlockIds, ["block-2"]);
  assert.deepEqual(bill.evidence.total.sourceWordIds, ["block-2-p0-l0-w3"]);
  assert.equal(bill.evidence.total.matchingLabel, "Invoice Amount Payable");
  assert.equal(
    bill.evidence.total.reason,
    "matched payable label and amount on the same line"
  );
  assert.equal(bill.evidence.total.sourceOCRPass, "processed-full");
});

test("retains noisy merchant OCR text separately from the normalized value", () => {
  const bill = extractBillData(
    makeOCRInput("NIDH| MOTORS\nReceipt\nTotal GBP 13.50", [
      makeOCRBlock(["NIDH|", "MOTORS"], 10),
      makeOCRBlock(["Receipt"], 40),
      makeOCRBlock(["Total", "GBP", "13.50"], 70),
    ])
  );

  assert.equal(bill.merchant.value, "NIDHIMOTORS");
  assert.equal(bill.evidence.merchant.originalText, "NIDH| MOTORS");
  assert.deepEqual(bill.evidence.merchant.sourceBlockIds, ["block-0"]);
});

test("preserves merchant prefixes in raw evidence while keeping normalized value", () => {
  const bill = extractBillData(
    makeOCRInput("M/s Bluebird Retail\nReceipt\nTotal GBP 13.50", [
      makeOCRBlock(["M/s", "Bluebird", "Retail"], 10),
      makeOCRBlock(["Receipt"], 40),
      makeOCRBlock(["Total", "GBP", "13.50"], 70),
    ])
  );

  assert.equal(bill.merchant.value, "BLUEBIRD RETAIL");
  assert.equal(bill.evidence.merchant.originalText, "M/s Bluebird Retail");
  assert.deepEqual(bill.evidence.merchant.sourceWordIds, [
    "block-0-p0-l0-w0",
    "block-0-p0-l0-w1",
    "block-0-p0-l0-w2",
  ]);
});

test("represents missing OCR geometry and string-only input without fabricated IDs", () => {
  const text = [
    "Merchant: Bluebird Retail",
    "Invoice Date: 05/11/2026",
    "Invoice Amount Payable ₹350.00",
  ].join("\n");
  const withoutGeometry = extractBillData(makeOCRInput(text));
  const stringInput = extractBillData(text);

  assert.equal(withoutGeometry.merchant.value, "BLUEBIRD RETAIL");
  assert.equal(withoutGeometry.evidence.merchant.originalText, "Bluebird Retail");
  assert.equal(withoutGeometry.evidence.merchant.matchingLabel, "Merchant");
  assert.equal(withoutGeometry.evidence.merchant.sourceBlockIds, null);
  assert.equal(withoutGeometry.evidence.merchant.sourceWordIds, null);
  assert.equal(withoutGeometry.evidence.merchant.sourceOCRPass, "processed-full");
  assert.equal(withoutGeometry.evidence.total.sourceBlockIds, null);
  assert.equal(withoutGeometry.evidence.total.sourceWordIds, null);

  assert.equal(stringInput.evidence.date.originalText, "05/11/2026");
  assert.equal(stringInput.evidence.date.sourceBlockIds, null);
  assert.equal(stringInput.evidence.date.sourceWordIds, null);
  assert.equal(stringInput.evidence.date.sourceOCRPass, null);
});

test("traces the selected candidate when merchant and payable candidates compete", () => {
  const text = [
    "Bluebird Retail",
    "Greenfield Motors",
    "Grand Total GBP 375.00",
    "Invoice Amount Payable GBP 350.00",
  ].join("\n");
  const evidence = makeOCRInput(text, [
    makeOCRBlock(["Bluebird", "Retail"], 10),
    makeOCRBlock(["Greenfield", "Motors"], 40),
    makeOCRBlock(["Grand", "Total", "GBP", "375.00"], 70),
    makeOCRBlock(["Invoice", "Amount", "Payable", "GBP", "350.00"], 100),
  ]);
  const bill = extractBillData(evidence);

  assert.equal(bill.merchant.value, "GREENFIELD MOTORS");
  assert.deepEqual(bill.evidence.merchant.sourceBlockIds, ["block-1"]);
  assert.equal(bill.evidence.merchant.originalText, "Greenfield Motors");
  assert.equal(bill.total.value, 350);
  assert.deepEqual(bill.evidence.total.sourceBlockIds, ["block-3"]);
  assert.equal(bill.evidence.total.matchingLabel, "Invoice Amount Payable");
  assert.equal(bill.evidence.total.originalText, "GBP 350.00");
});

test("records selected amount IDs without combining nearby label IDs", () => {
  const text = ["Invoice Amount Payable", "GBP 350.00"].join("\n");
  const bill = extractBillData(
    makeOCRInput(text, [
      makeOCRBlock(["Invoice", "Amount", "Payable"], 10),
      makeOCRBlock(["GBP", "350.00"], 40),
    ])
  );

  assert.equal(bill.total.value, 350);
  assert.equal(bill.evidence.total.originalText, "GBP 350.00");
  assert.equal(bill.evidence.total.matchingLabel, "Invoice Amount Payable");
  assert.deepEqual(bill.evidence.total.sourceBlockIds, ["block-1"]);
  assert.deepEqual(bill.evidence.total.sourceWordIds, [
    "block-1-p0-l0-w0",
    "block-1-p0-l0-w1",
  ]);
});

test("does not return label IDs when selected amount geometry is missing", () => {
  const text = ["Invoice Amount Payable", "GBP 350.00"].join("\n");
  const bill = extractBillData(
    makeOCRInput(text, [makeOCRBlock(["Invoice", "Amount", "Payable"], 10)])
  );

  assert.equal(bill.total.value, 350);
  assert.equal(bill.evidence.total.originalText, "GBP 350.00");
  assert.equal(bill.evidence.total.matchingLabel, "Invoice Amount Payable");
  assert.equal(bill.evidence.total.sourceBlockIds, null);
  assert.equal(bill.evidence.total.sourceWordIds, null);
});

test("returns unavailable amount IDs when neither label nor value geometry exists", () => {
  const text = ["Invoice Amount Payable", "GBP 350.00"].join("\n");
  const bill = extractBillData(makeOCRInput(text));

  assert.equal(bill.total.value, 350);
  assert.equal(bill.evidence.total.originalText, "GBP 350.00");
  assert.equal(bill.evidence.total.sourceBlockIds, null);
  assert.equal(bill.evidence.total.sourceWordIds, null);
});

test("maps a repeated amount to only the occurrence selected after its payable label", () => {
  const text = "Invoice Amount Payable GBP 350.00 Paid GBP 350.00";
  const bill = extractBillData(
    makeOCRInput(text, [
      makeOCRBlock(
        ["Invoice", "Amount", "Payable", "GBP", "350.00", "Paid", "GBP", "350.00"],
        10
      ),
    ])
  );

  assert.equal(bill.total.value, 350);
  assert.deepEqual(bill.evidence.total.sourceWordIds, [
    "block-0-p0-l0-w3",
    "block-0-p0-l0-w4",
  ]);
});

test("maps repeated amounts on separate lines only to the selected payable line", () => {
  const text = [
    "Invoice Amount Payable GBP 350.00",
    "Payment Received GBP 350.00",
  ].join("\n");
  const bill = extractBillData(
    makeOCRInput(text, [
      makeOCRBlock(["Invoice", "Amount", "Payable", "GBP", "350.00"], 10),
      makeOCRBlock(["Payment", "Received", "GBP", "350.00"], 40),
    ])
  );

  assert.equal(bill.total.value, 350);
  assert.deepEqual(bill.evidence.total.sourceBlockIds, ["block-0"]);
  assert.deepEqual(bill.evidence.total.sourceWordIds, [
    "block-0-p0-l0-w3",
    "block-0-p0-l0-w4",
  ]);
});

test("maps a repeated date to the invoice-date occurrence, not an unrelated date", () => {
  const text = [
    "Invoice Date: 05/11/2026",
    "Next Service Due: 05/11/2026",
    "Total GBP 13.50",
  ].join("\n");
  const bill = extractBillData(
    makeOCRInput(text, [
      makeOCRBlock(["Invoice", "Date:", "05/11/2026"], 10),
      makeOCRBlock(["Next", "Service", "Due:", "05/11/2026"], 40),
      makeOCRBlock(["Total", "GBP", "13.50"], 70),
    ])
  );

  assert.equal(bill.date.value, "05-11-2026");
  assert.deepEqual(bill.evidence.date.sourceBlockIds, ["block-0"]);
  assert.deepEqual(bill.evidence.date.sourceWordIds, ["block-0-p0-l0-w2"]);
});

test("returns unavailable IDs when exact candidate lines repeat in different sections", () => {
  const line = "Invoice Amount Payable GBP 350.00";
  const bill = extractBillData(
    makeOCRInput([line, "Store Copy", line].join("\n"), [
      makeOCRBlock(["Invoice", "Amount", "Payable", "GBP", "350.00"], 10),
      makeOCRBlock(["Store", "Copy"], 40),
      makeOCRBlock(["Invoice", "Amount", "Payable", "GBP", "350.00"], 70),
    ])
  );

  assert.equal(bill.total.value, 350);
  assert.equal(bill.evidence.total.originalText, "GBP 350.00");
  assert.equal(bill.evidence.total.sourceBlockIds, null);
  assert.equal(bill.evidence.total.sourceWordIds, null);
});

test("does not attribute evidence to a near-duplicate geometry line", () => {
  const text = "Invoice Amount Payable GBP 350.00";
  const bill = extractBillData(
    makeOCRInput(text, [
      makeOCRBlock(["Invoice", "Amount", "Payable", "GBP", "350.01"], 10),
    ])
  );

  assert.equal(bill.total.value, 350);
  assert.equal(bill.evidence.total.originalText, "GBP 350.00");
  assert.equal(bill.evidence.total.sourceBlockIds, null);
  assert.equal(bill.evidence.total.sourceWordIds, null);
});

test("limits evidence IDs to the selected date on a shared OCR line", () => {
  const text =
    "Invoice Date: 05/11/2026 Next Service Due: 05/11/2027\nTotal GBP 13.50";
  const bill = extractBillData(
    makeOCRInput(text, [
      makeOCRBlock(
        [
          "Invoice",
          "Date:",
          "05/11/2026",
          "Next",
          "Service",
          "Due:",
          "05/11/2027",
        ],
        10
      ),
      makeOCRBlock(["Total", "GBP", "13.50"], 50),
    ])
  );

  assert.equal(bill.date.value, "05-11-2026");
  assert.deepEqual(bill.evidence.date.sourceWordIds, ["block-0-p0-l0-w2"]);
});

test("leaves source evidence unavailable for conflicting date and amount candidates", () => {
  const text = [
    "Invoice Date: 05/11/2026",
    "Receipt Date: 06/11/2026",
    "Total GBP 13.50",
    "Total GBP 14.50",
  ].join("\n");
  const evidence = makeOCRInput(text, [
    makeOCRBlock(["Invoice", "Date:", "05/11/2026"], 10),
    makeOCRBlock(["Receipt", "Date:", "06/11/2026"], 40),
    makeOCRBlock(["Total", "GBP", "13.50"], 70),
    makeOCRBlock(["Total", "GBP", "14.50"], 100),
  ]);
  const bill = extractBillData(evidence);

  assert.equal(bill.date.value, null);
  assert.equal(bill.evidence.date.selectedValue, null);
  assert.equal(bill.evidence.date.originalText, null);
  assert.equal(bill.evidence.date.sourceBlockIds, null);
  assert.equal(bill.evidence.date.reason, "conflicting labeled invoice dates");
  assert.equal(bill.total.value, null);
  assert.equal(bill.evidence.total.selectedValue, null);
  assert.equal(bill.evidence.total.originalText, null);
  assert.equal(bill.evidence.total.sourceWordIds, null);
  assert.equal(
    bill.evidence.total.reason,
    "conflicting equally ranked payable amount candidates"
  );
});

test("keeps evidence tied to processed-full when an alternate pass conflicts", () => {
  const text = "Invoice Amount Payable ₹350.00";
  const primaryBlocks = [makeOCRBlock(["Invoice", "Amount", "Payable", "₹350.00"], 10)];
  const primaryConverted = convertOCRBlocks(primaryBlocks);
  const primary: OCRPassResult = {
    source: "processed-full",
    text,
    confidence: 55,
    pageSegmentationMode: "3",
    region: null,
    width: 800,
    height: 1200,
    blocks: primaryConverted,
    lines: groupOCRWordsIntoLines(
      primaryConverted.flatMap((block) => block.words)
    ),
  };
  const alternate: OCRPassResult = {
    ...primary,
    source: "original-full",
    text: "Invoice Amount Payable ₹900.00",
    blocks: convertOCRBlocks([
      makeOCRBlock(["Invoice", "Amount", "Payable", "₹900.00"], 10),
    ]),
    lines: [],
  };
  const bill = extractBillData(combineOCRPasses([primary, alternate]));

  assert.equal(bill.total.value, 350);
  assert.equal(bill.evidence.total.sourceOCRPass, "processed-full");
  assert.deepEqual(bill.evidence.total.sourceBlockIds, ["block-0"]);
  assert.equal(bill.evidence.total.originalText, "₹350.00");
});

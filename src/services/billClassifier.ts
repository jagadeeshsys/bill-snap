export type BillClassificationStatus = "bill" | "not_bill" | "uncertain";

export interface BillClassification {
  status: BillClassificationStatus;
  reasons: string[];
}

interface Signal {
  found: boolean;
  reason: string;
  weight: number;
}

export function classifyBillText(text: string): BillClassification {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (normalized.length < 20 || normalized.split(/\s+/).length < 4) {
    return {
      status: "uncertain",
      reasons: ["OCR text is too short to classify reliably."],
    };
  }

  const positiveSignals: Signal[] = [
    {
      found:
        /\b(?:tax\s+invoice|invoice|receipt|cash\s*memo|sales\s*receipt|purchase\s*receipt|bill)\b/i.test(
          normalized
        ),
      reason: "Invoice, bill, or receipt header detected.",
      weight: 3,
    },
    {
      found:
        /\b(?:merchant|business\s*name|store\s*name|company\s*name|gstin|gst\s*(?:no|number))\b/i.test(
          normalized
        ) ||
        /\b(?:private\s+limited|pvt\.?\s*ltd|llp|incorporated|proprietor|traders|enterprises|motors|jewellers|jewelry|supermarket)\b/i.test(
          normalized
        ),
      reason: "Merchant or business identity detected.",
      weight: 1,
    },
    {
      found:
        /\b(?:item\s*description|description\s+of\s+(?:goods|services)|particulars|qty|quantity|hsn|sac|unit\s*price|service\s+charges)\b/i.test(
          normalized
        ) ||
        lines.some(
          (line) =>
            /\b\d+\s*(?:x|@)\s*(?:₹|rs\.?|inr)?\s*\d/i.test(line) &&
            /\b(?:qty|quantity|item|service|description)\b/i.test(line)
        ),
      reason: "Item or service line details detected.",
      weight: 1,
    },
    {
      found:
        /(?:₹|rs\.?|inr)\s*\d|(?:\b\d{1,3}(?:,\d{3})+|\b\d+)\.\d{2}\b/i.test(
          normalized
        ),
      reason: "Currency amount detected.",
      weight: 1,
    },
    {
      found:
        /\b(?:invoice\s*amount\s*payable|amount\s*payable|total\s*payable|grand\s*total|total\s*amount|net\s*amount|balance\s*due)\b/i.test(
          normalized
        ),
      reason: "Final total or payable label detected.",
      weight: 2,
    },
    {
      found:
        /\b(?:gst(?:in|st)?|cgst|sgst|igst|tax\s*(?:amount|rate|invoice)|payment\s*(?:method|mode|received|status)|paid\s*(?:by|in|amount)|change\s*due)\b/i.test(
          normalized
        ),
      reason: "Tax, GST, or payment detail detected.",
      weight: 1,
    },
  ];

  const nonBillSignals: Signal[] = [
    {
      found:
        /\b(?:aadhaar|aadhar|passport|voter\s*id|driving\s*licen[cs]e|identity\s*card|date\s*of\s*birth|nationality)\b/i.test(
          normalized
        ),
      reason: "Identity-document wording detected.",
      weight: 2,
    },
    {
      found:
        /\b(?:whatsapp|messenger|chat\s*message|last\s*seen|typing\.\.\.|replying\s*to)\b/i.test(
          normalized
        ) &&
        /\b(?:sent|delivered|online|last\s*seen|message|typing|reply)\b/i.test(
          normalized
        ),
      reason: "Chat or messaging interface wording detected.",
      weight: 2,
    },
    {
      found:
        /\b(?:mrp|m\.r\.p\.|best\s*before|manufactured\s*on|ingredients|net\s*weight)\b/i.test(
          normalized
        ) &&
        !/\b(?:invoice|receipt|cash\s*memo|amount\s*payable|grand\s*total|total\s*payable)\b/i.test(
          normalized
        ),
      reason: "Product-label wording detected without transaction evidence.",
      weight: 2,
    },
    {
      found:
        /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|period\s*no|lecture|semester|timetable)\b/i.test(
          normalized
        ) &&
        /\b(?:am|pm|\d{1,2}:\d{2})\b/i.test(normalized),
      reason: "Schedule or timetable wording detected.",
      weight: 2,
    },
    {
      found:
        /\b(?:our\s*menu|starters|main\s*course|chef'?s\s*special|allergen)\b/i.test(
          normalized
        ) &&
        !/\b(?:receipt|invoice|paid|payment|total\s*paid|amount\s*payable)\b/i.test(
          normalized
        ),
      reason: "Menu wording detected without payment evidence.",
      weight: 2,
    },
  ];

  const foundPositive = positiveSignals.filter((signal) => signal.found);
  const foundNonBill = nonBillSignals.filter((signal) => signal.found);
  const positiveScore = foundPositive.reduce(
    (score, signal) => score + signal.weight,
    0
  );
  const nonBillScore = foundNonBill.reduce(
    (score, signal) => score + signal.weight,
    0
  );
  const [headerSignal, merchantSignal, itemSignal, amountSignal, totalSignal] =
    positiveSignals;
  const hasHeader = headerSignal.found;
  const hasAmount = amountSignal.found;
  const hasFinalTotal = totalSignal.found;
  const hasBusinessOrItemDetails =
    merchantSignal.found || itemSignal.found;
  const hasStrongBillEvidence =
    positiveScore >= 4 &&
    ((hasHeader && (hasAmount || hasFinalTotal || hasBusinessOrItemDetails)) ||
      (hasFinalTotal && hasAmount && hasBusinessOrItemDetails));
  const reasons = [
    ...foundPositive.filter((signal) => signal.found).map((signal) => signal.reason),
    ...foundNonBill.filter((signal) => signal.found).map((signal) => signal.reason),
  ];

  if (hasStrongBillEvidence && nonBillScore === 0) {
    return {
      status: "bill",
      reasons: [...reasons, "Independent transaction signals support a bill."],
    };
  }

  if (hasStrongBillEvidence && nonBillScore > 0) {
    return {
      status: "uncertain",
      reasons: [...reasons, "Bill and non-bill signals conflict."],
    };
  }

  if (nonBillScore >= 2 && !hasHeader && !hasFinalTotal) {
    return {
      status: "not_bill",
      reasons: [...reasons, "Document contains strong non-bill signals."],
    };
  }

  return {
    status: "uncertain",
    reasons: reasons.length
      ? [...reasons, "OCR evidence is insufficient to classify confidently."]
      : ["No clear bill or non-bill OCR signals were detected."],
  };
}

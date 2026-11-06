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
  const distinctWeekdays = new Set(
    normalized.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi) ?? []
  );

  if (normalized.length < 20 || normalized.split(/\s+/).length < 4) {
    return {
      status: "uncertain",
      reasons: ["OCR text is too short to classify reliably."],
    };
  }

  const positiveSignals: Signal[] = [
    {
      found:
        /\b(?:tax\s+invoice|invoice|receipt|cash\s*memo|sales\s*receipt|purchase\s*receipt|bill|invoi\w{2,8})\b/i.test(
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
        ) || /\b(?:restaurant|sushi|starbucks|barista|cafe|bistro|grill|lounge|nusr.?et|miami)\b/i.test(normalized),
      reason: "Merchant or business identity detected.",
      weight: 1,
    },
    {
      found:
        /\b(?:item\s*description|description\s+of\s+(?:goods|services)|particulars|qty|quantity|hsn|sac|unit\s*price|price|service\s+charges|paneer|naan|mutton|idli|dosa|samosa|makhana|wafer|cookie|chocolate|prawns|crab|ramen|mojito|tomahawk)\b/i.test(
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
        /(?:₹|£|€|\$|rs\.?|inr|gbp|usd|eur)\s*\d|(?:\b\d{1,3}(?:,\d{3})+|\b\d+)\.\d{2}\b/i.test(
          normalized
        ) || /\b\d{1,3}(?:,\d{3})+\b/.test(normalized) ||
        /\b\d{1,3}(?:\.\d{3})+,\d{2}\b/.test(normalized),
      reason: "Currency amount detected.",
      weight: 1,
    },
    {
      found:
        /\b(?:invoice\s*amount\s*payable|amount\s*payable|total\s*payable|net\s*payable|grand\s*total|total\s*amount|net\s*amount|balance\s*due|total\b|topl(?:am|n)\b)\b/i.test(
          normalized
        ),
      reason: "Final total or payable label detected.",
      weight: 2,
    },
    {
      found:
        /\b(?:gst(?:in|st)?|cgst|sgst|igst|tax\s*(?:amount|rate|invoice)|payment\s*(?:method|mode|received|status)|paid\s*(?:by|in|amount)|change\s*due|card|visa|mastercard|contactless|auth(?:orization)?\s*code|voucher|cash|chk)\b/i.test(
          normalized
        ),
      reason: "Tax, GST, or payment detail detected.",
      weight: 1,
    },
    {
      found: /\b(?:tesco|sainsbur(?:y|ies)|sainsbury'?s|new asian super market|new asian super mar[ke]{2})\b/i.test(normalized),
      reason: "Recognized grocery retailer detected.",
      weight: 2,
    },
    {
      found:
        /(?:\b(?:b|r)ill\s*(?:no\.?|number|#)\b|\b(?:receipt|invoice)\s*(?:no\.?|number|#)\b)/i.test(normalized) &&
        /\bdate\b/i.test(normalized) &&
        (normalized.match(/\b\d{1,3}(?:\.\d{3})+,\d{2}\b|\b\d+[.,]\d{2}\b|(?:₹|£|€|\$)\s*\d/gi)?.length ?? 0) >= 2,
      reason: "Bill number, transaction date, and multiple amounts detected.",
      weight: 2,
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
        /\b(?:period\s*no|lecture|semester|timetable)\b/i.test(normalized) &&
        /\b(?:am|pm|\d{1,2}:\d{2})\b/i.test(normalized) ||
        distinctWeekdays.size >= 2 &&
        /\b(?:am|pm|\d{1,2}:\d{2})\b/i.test(normalized),
      reason: "Schedule or timetable wording detected.",
      weight: 2,
    },
    {
      found:
        (normalized.match(/\b\d{1,2}:\d{2}\s*(?:am|pm)\b/gi)?.length ?? 0) >= 2 &&
        (normalized.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi)?.length ?? 0) >= 2 &&
        /\b[a-z]{2}\d{2}[a-z0-9]{3,}\b/i.test(normalized),
      reason: "Course schedule pattern detected.",
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
    {
      found:
        ["festival", "offer", "combo", "package", "salon", "grooming", "beauty"]
          .filter((term) => new RegExp(`\\b${term}s?\\b`, "i").test(normalized))
          .length >= 2 &&
        !/\b(?:receipt|invoice|cash\s*memo|amount\s*payable|grand\s*total|total\s*paid|payment\s*received)\b/i.test(normalized),
      reason: "Promotional price-list wording detected without transaction evidence.",
      weight: 2,
    },
    {
      found:
        /\b(?:replacement\s*value|valuation\s*certificate|appraisal\s*report|insurance\s*valuation)\b/i.test(normalized) &&
        !/\b(?:receipt|cash\s*memo|amount\s*paid|payment\s*received|sale\s*invoice)\b/i.test(normalized),
      reason: "Valuation document detected without proof of purchase.",
      weight: 3,
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
  const [headerSignal, merchantSignal, itemSignal, amountSignal, totalSignal, paymentSignal, retailerSignal] =
    positiveSignals;
  const hasHeader = headerSignal.found;
  const hasAmount = amountSignal.found;
  const hasFinalTotal = totalSignal.found;
  const hasValuationSignal = foundNonBill.some((signal) =>
    signal.reason.startsWith("Valuation document")
  );
  const hasRepeatedAmounts = lines.filter((line) =>
    /(?:₹|£|€|\$|\b(?:INR|GBP|USD|EUR)\b)\s*\d|\b\d{1,3}(?:,\d{3})+\b|\b\d{1,3}(?:\.\d{3})+,\d{2}\b|\b\d+\.\d{2}\b/i.test(line)
  ).length >= 2;
  const hasBusinessOrItemDetails =
    merchantSignal.found || itemSignal.found;
  const hasStrongBillEvidence =
    positiveScore >= 3 &&
    ((hasHeader && (hasAmount || hasFinalTotal || hasBusinessOrItemDetails)) ||
      (hasFinalTotal && hasAmount && hasBusinessOrItemDetails) ||
      (hasFinalTotal && hasAmount && hasRepeatedAmounts) ||
      (hasAmount && hasBusinessOrItemDetails && paymentSignal.found) ||
      (hasAmount && hasRepeatedAmounts && paymentSignal.found) ||
      (hasAmount && paymentSignal.found && /\bchange\b/i.test(normalized)) ||
      (hasAmount && itemSignal.found && hasRepeatedAmounts) ||
      (hasAmount && retailerSignal.found &&
        (itemSignal.found || paymentSignal.found || hasRepeatedAmounts)));
  const reasons = [
    ...foundPositive.filter((signal) => signal.found).map((signal) => signal.reason),
    ...foundNonBill.filter((signal) => signal.found).map((signal) => signal.reason),
  ];

  if (hasValuationSignal && !hasHeader && !paymentSignal.found) {
    return {
      status: "not_bill",
      reasons: [...reasons, "No purchase or payment evidence was detected."],
    };
  }

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

  if (
    nonBillScore >= 2 &&
    !hasHeader &&
    (!hasFinalTotal || hasValuationSignal) &&
    (!hasValuationSignal || !paymentSignal.found)
  ) {
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

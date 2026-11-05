
import type { OCRResult } from "./ocrEvidence";

export type ExpenseCategory =
  | "Food"
  | "Groceries"
  | "Utilities"
  | "Transport"
  | "Shopping"
  | "Healthcare"
  | "Entertainment"
  | "Other";

export interface ExtractedField<T> {
  value: T | null;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  reviewed?: boolean;
  userCorrected?: boolean;
}

export interface ExtractedBill {
  isBill: boolean;
  merchant: ExtractedField<string>;
  date: ExtractedField<string>;
  total: ExtractedField<number>;
  category: ExtractedField<ExpenseCategory>;
  rawText: string;
}

const BILL_KEYWORDS = [
  "invoice",
  "bill",
  "receipt",
  "tax invoice",
  "grand total",
  "amount payable",
  "total amount",
  "net bill value",
  "gstin",
  "cash memo",
];

const CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  Food: ["restaurant", "cafe", "food", "dining", "bakery"],
  Groceries: ["supermarket", "grocery", "mart", "provisions"],
  Utilities: ["electricity", "water bill", "broadband", "internet"],
  Transport: [
    "petrol",
    "fuel",
    "automobile",
    "motors",
    "motorcorp",
    "vehicle",
    "car service",
    "bike service",
    "two wheeler",
    "two-wheeler",
    "hero motocorp",
    "automotive",
    "repair charges",
  ],
  Shopping: [
    "jewellery",
    "jewelry",
    "jewel",
    "gold",
    "ornament",
    "shopping",
    "clothing",
    "fashion",
    "retail",
  ],
  Healthcare: ["hospital", "pharmacy", "medical", "clinic"],
  Entertainment: ["cinema", "movie", "theatre", "entertainment"],
  Other: [],
};

function makeField<T>(
  value: T | null,
  confidence: "high" | "medium" | "low"
): ExtractedField<T> {
  return {
    value,
    confidence,
    needsReview: confidence !== "high",
  };
}

export function markFieldUserCorrected<T>(
  field: ExtractedField<T>,
  value: T | null
): ExtractedField<T> {
  return {
    ...field,
    value,
    needsReview: false,
    reviewed: true,
    userCorrected: true,
  };
}

function getLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// --------------------------------------------------
// MERCHANT EXTRACTION
// --------------------------------------------------

function extractMerchant(text: string): ExtractedField<string> {
  const excludedLine =
    /\b(?:(?:tax\s+)?invoice|invoice\s*(?:no|number|date|amount)|bill\s*(?:no|number|date|amount)|receipt\s*(?:no|number|date|amount)|cash\s*memo|(?:original|duplicate|triplicate)\s+for\s+(?:recipient|transporter|supplier)|gstin|gst\s*(?:no|number|in)|pan\s*(?:no|number)|phone|mobile|contact|telephone|email|website|customer|buyer|supplier\s*details|place\s*of\s*supply|state\s*code|address|road|street|lane|nagar|pincode|pin\s*code|district|taluk|city|payment|amount|total|tax|subtotal|description|hsn|sac|quantity|qty|rate|authorized|authorised|signatory|round\s*off|service\s*due|expiry|warranty|delivery)\b/i;
  const genericHeader =
    /^(?:(?:tax\s+)?invoice|bill|receipt|original|duplicate|triplicate|original for recipient|duplicate for transporter|triplicate for supplier|customer copy|office copy|cash memo|estimate|quotation)$/i;
  const copyDesignation =
    /\b(?:original|duplicate|triplicate)\s+for\s+(?:recipient|transporter|supplier)\b/i;
  const documentTitle =
    /\b(?:tax\s+invoice|invoice|cash\s*memo|receipt|estimate|quotation)\b/i;
  const businessSuffix =
    /\b(?:motors?|jewell?ers?|traders?|stores?|enterprises?|services?|restaurant|supermarket|industries|hospital|medical|agency|limited|ltd|llp|private|pvt)\b/i;
  const affiliationDescription = /^\s*a\s+unit\s+of\b/i;
  const genericMerchantHeading =
    /^(?:store|sales|shop|business|company|merchant|customer|supplier|details|particulars|description|date|total|cash|tax|payment|address|phone|contact|welcome|thank\s+you)$/i;
  const merchantFieldLabel =
    /^(?:merchant|business\s*name|store\s*name|shop\s*name|company\s*name|name)\s*[:.-]\s*/i;

  const candidates = getLines(text)
    .map((originalLine, index) => {
      const hasMerchantLabel = merchantFieldLabel.test(originalLine);
      const forBusiness = /^for\s+(.+)$/i.exec(originalLine);
      const hasForBusiness = forBusiness !== null;
      const line = (forBusiness?.[1] ?? originalLine)
        .replace(/^for\s+/i, "")
        .replace(merchantFieldLabel, "")
        .replace(/^m\/s\.?\s*/i, "")
        .replace(/(?<=[\p{L}])\|\s*(?=[\p{L}])/gu, "I")
        .replace(/[^\p{L}\p{N}&'().\s-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      const letters = (line.match(/\p{L}/gu) ?? []).length;
      const digits = (line.match(/\d/g) ?? []).length;
      const words = line.match(/[\p{L}]+/gu) ?? [];
      const singleWordHeader =
        words.length === 1 &&
        index < 8 &&
        !genericMerchantHeading.test(line);

      if (
        line.length < 3 ||
        line.length > 60 ||
        letters < 3 ||
        digits >= 4 ||
        genericHeader.test(line) ||
        (genericMerchantHeading.test(line) && !hasMerchantLabel) ||
        copyDesignation.test(originalLine) ||
        documentTitle.test(line) ||
        excludedLine.test(line) ||
        (words.length < 2 &&
          !businessSuffix.test(line) &&
          !hasMerchantLabel &&
          !singleWordHeader) ||
        /\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/.test(line) ||
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line) ||
        /(?:https?:\/\/|www\.)/i.test(line)
      ) {
        return null;
      }

      let score = index < 8 ? 55 : 35;

      if (hasForBusiness) score += 35;
      if (hasMerchantLabel) score += 25;
      if (businessSuffix.test(line)) score += 20;
      if (words.length >= 2) score += 10;
      if (singleWordHeader) score += 10;
      if (affiliationDescription.test(line)) score -= 35;
      if (line === line.toUpperCase()) score += 5;
      if (digits > 0) score -= 15;

      return {
        line,
        normalizedLine: line.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        score,
        index,
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        line: string;
        normalizedLine: string;
        score: number;
        index: number;
      } => candidate !== null
    )
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const distinctCandidates = [
    ...candidates
      .reduce((groups, candidate) => {
        const group = groups.get(candidate.normalizedLine);

        if (group) {
          group.count += 1;
          if (candidate.score > group.score) {
            group.line = candidate.line;
            group.score = candidate.score;
            group.index = candidate.index;
          }
        } else {
          groups.set(candidate.normalizedLine, {
            line: candidate.line,
            normalizedLine: candidate.normalizedLine,
            score: candidate.score,
            index: candidate.index,
            count: 1,
          });
        }

        return groups;
      }, new Map<string, {
        line: string;
        normalizedLine: string;
        score: number;
        index: number;
        count: number;
      }>())
      .values(),
  ]
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + Math.min(candidate.count - 1, 2) * 10,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = distinctCandidates[0];

  if (!selected) {
    return makeField<string>(null, "low");
  }

  if (selected.score < 65) {
    if (affiliationDescription.test(selected.line)) {
      return makeField(selected.line.toUpperCase(), "low");
    }

    return makeField<string>(null, "low");
  }

  const secondCandidate = distinctCandidates[1];
  const isUnlabeledSingleWord =
    (selected.line.match(/[\p{L}]+/gu) ?? []).length === 1 &&
    !merchantFieldLabel.test(getLines(text)[selected.index] ?? "") &&
    !businessSuffix.test(selected.line);
  const rankedConfidence =
    secondCandidate && selected.score - secondCandidate.score < 10
      ? "low"
      : selected.score >= 80 &&
          (!secondCandidate || selected.score - secondCandidate.score >= 15)
        ? "high"
        : "medium";
  const confidence =
    isUnlabeledSingleWord && rankedConfidence === "high"
      ? "medium"
      : rankedConfidence;

  return makeField(
    selected.line.toUpperCase(),
    confidence
  );
}

// --------------------------------------------------
// DATE EXTRACTION
// --------------------------------------------------

function findDates(line: string): string[] {
  const dates: string[] = [];
  const monthNumbers: Record<string, number> = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };
  const addDate = (day: number, month: number, year: number) => {
    if (year < 1000 || year > 9999) return;

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      day < 1 ||
      month < 1 ||
      month > 12 ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return;
    }

    dates.push(
      `${String(day).padStart(2, "0")}-${String(month).padStart(
        2,
        "0"
      )}-${year}`
    );
  };

  for (const match of line.matchAll(
    /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g
  )) {
    addDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  for (const match of line.matchAll(
    /(?<![\p{L}\d])(\d{1,2})\s*[-./]?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*[-./]?\s*(\d{4})(?![\p{L}\d])/giu
  )) {
    const month = monthNumbers[match[2].toUpperCase()];
    if (month) {
      addDate(Number(match[1]), month, Number(match[3]));
    }
  }

  return dates;
}

function extractDate(text: string): ExtractedField<string> {
  const lines = getLines(text);
  const invoiceDateLabel =
    /\b(?:invoice\s*date|bill\s*date|receipt\s*date|date\s*of\s*(?:purchase|issue|invoice)|invoice\s*dale|invoicedate|billdate)\b/i;
  const excludedDateLabel =
    /\b(?:next\s*service\s*due|service\s*due|insurance\s*expiry|expiry|delivery\s*date|payment\s*due\s*date|warranty\s*expiry|date\s*of\s*transaction|transaction\s*date|card\s*(?:date|expiry)|valid\s*(?:thru|through)|authorization\s*date|payment\s*date)\b/i;
  const invoiceNumberLabel =
    /\b(?:invoice|bill|receipt)\s*(?:no|number|#)\b/i;

  const labeledDates = new Set<string>();

  lines.forEach((line, index) => {
    const labelMatch = invoiceDateLabel.exec(line);

    if (!labelMatch) return;

    for (let offset = 0; offset <= 2; offset++) {
      const candidateLine = lines[index + offset];

      if (!candidateLine) break;
      if (
        (offset > 0 &&
          (invoiceDateLabel.test(candidateLine) ||
            excludedDateLabel.test(candidateLine))) ||
        invoiceNumberLabel.test(candidateLine)
      ) {
        break;
      }

      let dateText = candidateLine;

      if (offset === 0) {
        dateText = candidateLine.slice(
          labelMatch.index + labelMatch[0].length
        );
        const nextLabel = [
          excludedDateLabel.exec(dateText),
          invoiceNumberLabel.exec(dateText),
        ]
          .filter((match) => match !== null)
          .sort((a, b) => a.index - b.index)[0];

        if (nextLabel) {
          dateText = dateText.slice(0, nextLabel.index);
        }

        if (!findDates(dateText).length) {
          dateText = candidateLine.slice(0, labelMatch.index);
        }
      }

      findDates(dateText).forEach((date) => labeledDates.add(date));
    }
  });

  if (labeledDates.size === 1) {
    const labeledDate = [...labeledDates][0];
    const competingDates = new Set<string>();

    lines.forEach((line) => {
      if (
        excludedDateLabel.test(line) ||
        invoiceNumberLabel.test(line)
      ) {
        return;
      }

      findDates(line).forEach((date) => {
        if (date !== labeledDate) competingDates.add(date);
      });
    });

    return makeField(
      labeledDate,
      competingDates.size > 0 ? "medium" : "high"
    );
  }

  if (labeledDates.size > 1) {
    return makeField<string>(null, "low");
  }

  const unlabelledDates = new Set<string>();

  lines.forEach((line) => {
    if (
      excludedDateLabel.test(line) ||
      invoiceNumberLabel.test(line)
    ) {
      return;
    }

    findDates(line).forEach((date) => unlabelledDates.add(date));
  });

  if (unlabelledDates.size === 1) {
    return makeField([...unlabelledDates][0], "medium");
  }

  return makeField<string>(null, "low");
}

// --------------------------------------------------
// TOTAL EXTRACTION
// --------------------------------------------------

function extractMoneyValues(line: string): number[] {
  const amountPattern =
    /(?:^|[^\d.,\p{L}])(-\s*)?(?:₹|INR\b|Rs\.?)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)(?![\d.,\p{L}])/giu;
  const amounts: number[] = [];

  for (const match of line.matchAll(amountPattern)) {
    const rawValue = match[2];

    if (match[1] || rawValue.startsWith("-")) continue;

    const integerPart = rawValue.split(".")[0];
    const hasValidGrouping =
      /^\d+$/.test(integerPart) ||
      /^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})$/.test(
        integerPart
      );

    if (!hasValidGrouping) continue;

    const value = Number(rawValue.replace(/,/g, ""));

    if (Number.isFinite(value) && value > 0 && value < 100000000) {
      amounts.push(value);
    }
  }

  return amounts;
}

function isStandaloneNearbyAmount(line: string): boolean {
  const amountOnlyPattern =
    /^\s*(?:(?:₹|£|€|\$)\s*|(?:INR|GBP|EUR|USD|Rs\.?)\s*)?\d[\d,]*(?:\.\d{2})?(?:\s*\/-)?\s*$/i;
  const hasCurrency =
    /(?:₹|£|€|\$|\b(?:INR|GBP|EUR|USD|Rs\.?)\b)/i.test(line);
  const hasTwoDecimalPlaces = /\d[\d,]*\.\d{2}(?!\d)/.test(line);

  return (
    amountOnlyPattern.test(line) &&
    (hasCurrency || hasTwoDecimalPlaces)
  );
}

function extractTotal(text: string): ExtractedField<number> {
  const lines = getLines(text);
  const totalLabels = [
    {
      pattern: /\binvoice\s*amount\s*payable\b/i,
      score: 300,
    },
    {
      pattern: /\bamount\s*payable\b/i,
      score: 290,
    },
    {
      pattern: /\btotal\s*payable\b/i,
      score: 280,
    },
    {
      pattern: /\b(?:amount|balance)\s*due\b/i,
      score: 270,
    },
    {
      pattern: /\btotal\s*invoice\s*value\b/i,
      score: 230,
    },
    {
      pattern: /\btotal\s*invo[iu]ce\s*value\b/i,
      score: 225,
    },
    {
      pattern: /\binvoice\s*amount\b/i,
      score: 210,
    },
    {
      pattern: /\bgrand\s*total\b/i,
      score: 170,
    },
    {
      pattern: /\btotal\s*amount\b/i,
      score: 160,
    },
    {
      pattern: /\btotal\s*invoice\b/i,
      score: 160,
    },
    {
      pattern: /\btotal\s*paid\b/i,
      score: 150,
    },
    {
      pattern: /\btotal\b/i,
      score: 145,
    },
    {
      pattern: /\bnet\s*bill\s*value\b/i,
      score: 130,
    },
    {
      pattern: /\bbill\s*value\b/i,
      score: 120,
    },
    {
      pattern: /\bnet\s*amount\b/i,
      score: 70,
    },
  ];

  const candidates: {
    value: number;
    score: number;
  }[] = [];

  const nonTotalLabels =
    /\b(?:total\s+tax|tax\s+total|gst|tax\s+(?:amount\s+)?payable|sub\s*total|round\s*off|item\s*(?:total|amount)|unit\s*price|discount|coupon|savings)\b/i;

  lines.forEach((line, index) => {
  const normalized = line.toLowerCase();
  const hasExplicitPayable = totalLabels
    .slice(0, 4)
    .some((label) => label.pattern.test(normalized));

  if (nonTotalLabels.test(normalized) && !hasExplicitPayable) return;

  for (const label of totalLabels) {
    const labelMatch = label.pattern.exec(normalized);

    if (!labelMatch) continue;

    if (
      label.score < 300 &&
      /\b(?:tax|gst)\b/.test(normalized.slice(0, labelMatch.index))
    ) {
      continue;
    }

    const sameLineValues = extractMoneyValues(
      line.slice(labelMatch.index + labelMatch[0].length)
    );
    const valuesOnLabelLine = sameLineValues.length
      ? [sameLineValues[0]]
      : extractMoneyValues(line);

    if (valuesOnLabelLine.length) {
      candidates.push({
        value: valuesOnLabelLine[0],
        score: label.score,
      });
      continue;
    }

    // Only use following lines when they contain an unlabeled value.
    for (let offset = 1; offset <= 2; offset++) {
      const nearbyLine = lines[index + offset];

      if (!nearbyLine) continue;

      const nearbyNormalized = nearbyLine.toLowerCase();

      if (
        nonTotalLabels.test(nearbyNormalized) ||
        totalLabels.some((otherLabel) =>
          otherLabel.pattern.test(nearbyNormalized)
        )
      ) {
        continue;
      }

      if (!isStandaloneNearbyAmount(nearbyLine)) continue;

      const values = extractMoneyValues(nearbyLine);

      if (values.length) {
        candidates.push({
          value: values[0],
          score: label.score - offset * 25,
        });
        break;
      }
    }
  }
  });

  candidates.sort((a, b) => b.score - a.score);

  const selected = candidates[0];

  if (!selected) {
    return makeField<number>(null, "low");
  }

  const distinctCandidates = new Map<number, number>();
  for (const candidate of candidates) {
    distinctCandidates.set(
      candidate.value,
      Math.max(
        distinctCandidates.get(candidate.value) ?? Number.NEGATIVE_INFINITY,
        candidate.score
      )
    );
  }

  const competingScores = [...distinctCandidates]
    .filter(([value]) => value !== selected.value)
    .map(([, score]) => score);
  const strongestCompetitor = Math.max(
    Number.NEGATIVE_INFINITY,
    ...competingScores
  );
  if (strongestCompetitor === selected.score) {
    return makeField<number>(null, "low");
  }

  const confidence =
    strongestCompetitor >= selected.score - 25
      ? "low"
      : strongestCompetitor >= 120
        ? "medium"
        : selected.score >= 170
          ? "high"
          : "medium";

  return makeField(
    selected.value,
    confidence
  );
}

// --------------------------------------------------
// CATEGORY EXTRACTION
// --------------------------------------------------

function extractCategory(
  text: string,
  merchant: string | null
): ExtractedField<ExpenseCategory> {
  const searchableText =
    `${merchant ?? ""}\n${text}`.toLowerCase();

  const scores: Record<ExpenseCategory, number> = {
    Food: 0,
    Groceries: 0,
    Utilities: 0,
    Transport: 0,
    Shopping: 0,
    Healthcare: 0,
    Entertainment: 0,
    Other: 0,
  };

  for (const [category, keywords] of Object.entries(
    CATEGORY_KEYWORDS
  )) {
    for (const keyword of keywords) {
      if (searchableText.includes(keyword)) {
        scores[category as ExpenseCategory] +=
          merchant?.toLowerCase().includes(keyword) ? 4 : 2;
      }
    }
  }

  const ranked = Object.entries(scores)
    .filter(([category]) => category !== "Other")
    .sort((a, b) => b[1] - a[1]);

  const best = ranked[0];
  const second = ranked[1];

  if (!best || best[1] === 0) {
    return makeField<ExpenseCategory>("Other", "low");
  }

  const confidence =
    second && best[1] - second[1] < 2
      ? "low"
      : best[1] >= 6 && (!second || best[1] - second[1] >= 4)
        ? "high"
        : "medium";

  return makeField(
    best[0] as ExpenseCategory,
    confidence
  );
}

// --------------------------------------------------
// MAIN BILL EXTRACTION FUNCTION
// --------------------------------------------------

export function extractBillData(input: string | OCRResult): ExtractedBill {
  const text = typeof input === "string" ? input : input.primaryFullPage.text;
  const lower = text.toLowerCase();

  const keywordCount = BILL_KEYWORDS.filter((keyword) =>
    lower.includes(keyword)
  ).length;

  const hasAmount = /\d+[.,]\d{2}/.test(text);
  const isBill = keywordCount >= 1 && hasAmount;

  const merchant = extractMerchant(text);
  const date = extractDate(text);
  const total = extractTotal(text);

  if (!isBill) {
    return {
      isBill: false,
      merchant,
      date,
      total,
      category: makeField<ExpenseCategory>(null, "low"),
      rawText: text,
    };
  }

  const category = extractCategory(text, merchant.value);

  return {
    isBill: true,
    merchant,
    date,
    total,
    category,
    rawText: text,
  };
}

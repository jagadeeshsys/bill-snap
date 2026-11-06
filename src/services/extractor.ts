
import type {
  OCRLineEvidence,
  OCRPassSource,
  OCRResult,
} from "./ocrEvidence";

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

export type EvidenceFieldName = "merchant" | "date" | "total";

export interface ExtractionEvidence<T> {
  field: EvidenceFieldName;
  selectedValue: T | null;
  originalText: string | null;
  sourceBlockIds: string[] | null;
  sourceWordIds: string[] | null;
  matchingLabel: string | null;
  reason: string;
  confidence: "high" | "medium" | "low";
  sourceOCRPass: OCRPassSource | null;
}

export interface ExtractedBillEvidence {
  merchant: ExtractionEvidence<string>;
  date: ExtractionEvidence<string>;
  total: ExtractionEvidence<number>;
}

export type CurrencyCode = "INR" | "GBP" | "USD" | "EUR";

export interface ExtractedCurrency {
  selectedAmount: number | null;
  normalizedAmount: number | null;
  code: CurrencyCode | null;
  originalText: string | null;
  confidence: "high" | "medium" | "low";
  normalization: "certain" | "ambiguous" | "unavailable";
  normalizationReason: string;
  reason: string;
}

export interface ExtractedBill {
  isBill: boolean;
  merchant: ExtractedField<string>;
  date: ExtractedField<string>;
  total: ExtractedField<number>;
  currency: ExtractedCurrency;
  category: ExtractedField<ExpenseCategory>;
  rawText: string;
  evidence: ExtractedBillEvidence;
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
  Groceries: [
    "supermarket", "grocery", "mart", "provisions", "tesco",
    "sainsbury", "sainsburys", "new asian super market",
  ],
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

function getSourceLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

interface CandidateSource {
  sourceLine: string;
  valueText: string;
  valueOccurrence: number;
  matchingLabel: string | null;
  labelOccurrence: number;
  reason: string;
  labelSourceLine?: string;
}

function getEvidenceTokens(text: string): string[] {
  return (
    text.toUpperCase().match(/[\p{L}\p{N}]+(?:[./-][\p{L}\p{N}]+)*/gu) ??
    []
  );
}

interface TokenSpan {
  text: string;
  start: number;
  end: number;
}

function getTokenSpans(text: string): TokenSpan[] {
  return Array.from(
    text.toUpperCase().matchAll(
      /[\p{L}\p{N}]+(?:[./-][\p{L}\p{N}]+)*/gu
    ),
    (match) => ({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  );
}

function findTokenSpan(
  line: string,
  value: string,
  occurrence: number
): { start: number; end: number } | null {
  const lineTokens = getTokenSpans(line);
  const targetTokens = getEvidenceTokens(value);
  if (targetTokens.length === 0 || occurrence < 0) return null;

  let seen = 0;
  for (let index = 0; index <= lineTokens.length - targetTokens.length; index++) {
    const matches = targetTokens.every(
      (token, offset) => lineTokens[index + offset].text === token
    );
    if (!matches) continue;

    if (seen === occurrence) {
      const span = {
        start: lineTokens[index].start,
        end: lineTokens[index + targetTokens.length - 1].end,
      };
      const currencyPrefix = /^\s*(?:₹|£|€|\$)\s*/u.exec(value);
      if (currencyPrefix) {
        const rawPrefix = line.slice(0, span.start);
        const symbol = currencyPrefix[0].trim();
        const symbolIndex = rawPrefix.lastIndexOf(symbol);
        if (
          symbolIndex >= 0 &&
          /^\s*$/u.test(rawPrefix.slice(symbolIndex + symbol.length))
        ) {
          span.start = symbolIndex;
        }
      }

      return span;
    }
    seen += 1;
  }

  return null;
}

function countTokenSpansBefore(
  line: string,
  value: string,
  characterIndex: number
): number {
  const lineTokens = getTokenSpans(line);
  const targetTokens = getEvidenceTokens(value);
  let count = 0;

  for (let index = 0; index <= lineTokens.length - targetTokens.length; index++) {
    if (
      lineTokens[index].start < characterIndex &&
      targetTokens.every(
        (token, offset) => lineTokens[index + offset].text === token
      )
    ) {
      count += 1;
    }
  }

  return count;
}

function resolveLineSource(
  lines: OCRLineEvidence[] | undefined,
  sourceLine: string,
  spans: Array<{ text: string; occurrence: number }>
): { blockIds: string[]; wordIds: string[]; originalText: string } | null {
  if (!lines?.length || spans.length === 0) return null;

  const sourceTokens = getEvidenceTokens(sourceLine);
  if (sourceTokens.length === 0) return null;

  const exactMatches = lines.filter((line) => {
    const lineTokens = getEvidenceTokens(line.text);
    const wordTokens = line.words.flatMap((word) =>
      getEvidenceTokens(word.text)
    );
    return (
      lineTokens.length === sourceTokens.length &&
      lineTokens.every((token, index) => token === sourceTokens[index]) &&
      wordTokens.length === sourceTokens.length &&
      wordTokens.every((token, index) => token === sourceTokens[index])
    );
  });
  if (exactMatches.length !== 1) return null;

  const line = exactMatches[0];
  const tokenSpans = getTokenSpans(sourceLine);
  const ranges = spans.map((span) =>
    findTokenSpan(sourceLine, span.text, span.occurrence)
  );
  if (ranges.some((range) => range === null)) return null;

  let tokenIndex = 0;
  const wordRanges = line.words.map((word) => {
    const start = tokenIndex;
    tokenIndex += getEvidenceTokens(word.text).length;
    return { word, start, end: tokenIndex };
  });
  const selectedWords = wordRanges.filter(({ start, end }) =>
    ranges.some((range) => {
      if (!range) return false;
      const startToken = tokenSpans.findIndex(
        (token) => token.end > range.start
      );
      const endTokenExclusive = tokenSpans.findIndex(
        (token) => token.start >= range.end
      );
      const endToken =
        endTokenExclusive === -1 ? tokenSpans.length : endTokenExclusive;
      return startToken >= 0 && start < endToken && end > startToken;
    })
  );
  if (selectedWords.length === 0) return null;

  const originalText = ranges
    .map((range) => (range ? sourceLine.slice(range.start, range.end) : ""))
    .join(" ");

  return {
    blockIds: [...new Set(selectedWords.map(({ word }) => word.blockId))],
    wordIds: selectedWords.map(({ word }) => word.id),
    originalText,
  };
}

function makeExtractionEvidence<T>(
  field: EvidenceFieldName,
  selectedValue: T | null,
  confidence: "high" | "medium" | "low",
  candidate: CandidateSource | null,
  source: OCRResult | null,
  reasonWhenMissing: string
): ExtractionEvidence<T> {
  if (!candidate || selectedValue === null) {
    return {
      field,
      selectedValue,
      originalText: null,
      sourceBlockIds: null,
      sourceWordIds: null,
      matchingLabel: null,
      reason: reasonWhenMissing,
      confidence,
      sourceOCRPass: source?.primaryFullPage.source ?? null,
    };
  }

  const valueSource = resolveLineSource(
    source?.primaryFullPage.lines,
    candidate.sourceLine,
    [{ text: candidate.valueText, occurrence: candidate.valueOccurrence }]
  );
  const rawValueSpan = findTokenSpan(
    candidate.sourceLine,
    candidate.valueText,
    candidate.valueOccurrence
  );

  return {
    field,
    selectedValue,
    originalText: rawValueSpan
      ? candidate.sourceLine.slice(rawValueSpan.start, rawValueSpan.end)
      : null,
    sourceBlockIds: valueSource?.blockIds ?? null,
    sourceWordIds: valueSource?.wordIds ?? null,
    matchingLabel: candidate.matchingLabel,
    reason: candidate.reason,
    confidence,
    sourceOCRPass: source?.primaryFullPage.source ?? null,
  };
}

// --------------------------------------------------
// MERCHANT EXTRACTION
// --------------------------------------------------

function extractMerchant(text: string): {
  field: ExtractedField<string>;
  candidate: CandidateSource | null;
  missingReason: string;
} {
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
  const sourceLines = getSourceLines(text);

  const candidates = getLines(text)
    .map((originalLine, index) => {
      const hasMerchantLabel = merchantFieldLabel.test(originalLine);
      const forBusiness = /^for\s+(.+)$/i.exec(originalLine);
      const hasForBusiness = forBusiness !== null;
      const sourceLine = sourceLines[index] ?? originalLine;
      const sourceTextLine = sourceLine.trim();
      const sourceForBusiness = /^for\s+(.+)$/i.exec(sourceTextLine);
      const originalCandidateText = (
        sourceForBusiness?.[1] ?? sourceTextLine
      )
        .replace(merchantFieldLabel, "")
        .trim();
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
        originalLine,
        sourceLine,
        originalCandidateText,
        normalizedLine: line.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        score,
        index,
        matchingLabel: hasMerchantLabel
          ? merchantFieldLabel
              .exec(sourceTextLine)?.[0]
              .replace(/[:.-]\s*$/, "")
              .trim() ?? null
          : hasForBusiness
            ? "For"
            : null,
        labelOccurrence: hasMerchantLabel
          ? countTokenSpansBefore(
              sourceTextLine,
              merchantFieldLabel.exec(sourceTextLine)?.[0] ?? "",
              0
            )
          : 0,
        reason: hasMerchantLabel
          ? "business-name label"
          : hasForBusiness
            ? "for-business header"
            : index < 8
              ? "header position"
              : businessSuffix.test(line)
                ? "business-name pattern"
                : "merchant candidate",
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        line: string;
        originalLine: string;
        sourceLine: string;
        originalCandidateText: string;
        normalizedLine: string;
        score: number;
        index: number;
        matchingLabel: string | null;
        labelOccurrence: number;
        reason: string;
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
            group.originalLine = candidate.originalLine;
            group.sourceLine = candidate.sourceLine;
            group.originalCandidateText = candidate.originalCandidateText;
            group.matchingLabel = candidate.matchingLabel;
            group.labelOccurrence = candidate.labelOccurrence;
            group.reason = candidate.reason;
          }
        } else {
          groups.set(candidate.normalizedLine, {
            line: candidate.line,
            originalLine: candidate.originalLine,
            sourceLine: candidate.sourceLine,
            originalCandidateText: candidate.originalCandidateText,
            normalizedLine: candidate.normalizedLine,
            score: candidate.score,
            index: candidate.index,
            count: 1,
            matchingLabel: candidate.matchingLabel,
            labelOccurrence: candidate.labelOccurrence,
            reason: candidate.reason,
          });
        }

        return groups;
      }, new Map<string, {
        line: string;
        originalLine: string;
        sourceLine: string;
        originalCandidateText: string;
        normalizedLine: string;
        score: number;
        index: number;
        count: number;
        matchingLabel: string | null;
        labelOccurrence: number;
        reason: string;
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
    return {
      field: makeField<string>(null, "low"),
      candidate: null,
      missingReason: "no merchant candidate selected",
    };
  }

  if (selected.score < 65) {
    if (affiliationDescription.test(selected.line)) {
      return {
        field: makeField(selected.line.toUpperCase(), "low"),
        candidate: {
          sourceLine: selected.sourceLine,
          valueText: selected.originalCandidateText,
          valueOccurrence: 0,
          matchingLabel: null,
          labelOccurrence: 0,
          reason: "low-confidence affiliation header",
        },
        missingReason: "",
      };
    }

    return {
      field: makeField<string>(null, "low"),
      candidate: null,
      missingReason: "merchant candidate confidence below selection threshold",
    };
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

  return {
    field: makeField(selected.line.toUpperCase(), confidence),
    candidate: {
      sourceLine: selected.sourceLine,
      valueText: selected.originalCandidateText,
      valueOccurrence: 0,
      matchingLabel: selected.matchingLabel,
      labelOccurrence: selected.labelOccurrence,
      reason: selected.reason,
    },
    missingReason: "",
  };
}

// --------------------------------------------------
// DATE EXTRACTION
// --------------------------------------------------

interface DateCandidate {
  value: string;
  originalText: string;
  index: number;
}

function findDateCandidates(line: string): DateCandidate[] {
  const dates: DateCandidate[] = [];
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
  const addDate = (
    day: number,
    month: number,
    year: number,
    originalText: string,
    index: number
  ) => {
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

    dates.push({
      value: `${String(day).padStart(2, "0")}-${String(month).padStart(
        2,
        "0"
      )}-${year}`,
      originalText,
      index,
    });
  };

  for (const match of line.matchAll(
    /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g
  )) {
    addDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      match[0],
      match.index
    );
  }

  for (const match of line.matchAll(
    /(?<![\p{L}\d])(\d{1,2})\s*[-./]?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*[-./]?\s*(\d{4})(?![\p{L}\d])/giu
  )) {
    const month = monthNumbers[match[2].toUpperCase()];
    if (month) {
      addDate(
        Number(match[1]),
        month,
        Number(match[3]),
        match[0],
        match.index
      );
    }
  }

  return dates;
}

function findDates(line: string): string[] {
  return findDateCandidates(line).map((candidate) => candidate.value);
}

function extractDate(text: string): {
  field: ExtractedField<string>;
  candidate: CandidateSource | null;
  missingReason: string;
} {
  const lines = getLines(text);
  const sourceLines = getSourceLines(text);
  const invoiceDateLabel =
    /\b(?:invoice\s*date|bill\s*date|receipt\s*date|date\s*of\s*(?:purchase|issue|invoice)|invoice\s*dale|invoicedate|billdate)\b/i;
  const excludedDateLabel =
    /\b(?:next\s*service\s*due|service\s*due|insurance\s*expiry|expiry|delivery\s*date|payment\s*due\s*date|warranty\s*expiry|date\s*of\s*transaction|transaction\s*date|card\s*(?:date|expiry)|valid\s*(?:thru|through)|authorization\s*date|payment\s*date)\b/i;
  const invoiceNumberLabel =
    /\b(?:invoice|bill|receipt)\s*(?:no|number|#)\b/i;

  const labeledDates = new Map<string, CandidateSource>();

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
      let dateTextOffset = 0;

      if (offset === 0) {
        dateTextOffset = labelMatch.index + labelMatch[0].length;
        dateText = candidateLine.slice(
          dateTextOffset
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
          dateTextOffset = 0;
        }
      }

      findDateCandidates(dateText).forEach((date) => {
        if (!labeledDates.has(date.value)) {
          const sourceLine = sourceLines[index + offset] ?? candidateLine;
          const originalLabel =
            invoiceDateLabel.exec(sourceLines[index] ?? line)?.[0] ??
            labelMatch[0];
          const labelOccurrence = countTokenSpansBefore(
            line,
            labelMatch[0],
            labelMatch.index
          );
          labeledDates.set(date.value, {
            sourceLine,
            valueText: date.originalText,
            valueOccurrence: countTokenSpansBefore(
              candidateLine,
              date.originalText,
              dateTextOffset + date.index
            ),
            matchingLabel: originalLabel,
            labelOccurrence,
            reason: "explicit invoice-date label",
            labelSourceLine: sourceLines[index] ?? line,
          });
        }
      });
    }
  });

  if (labeledDates.size === 1) {
    const [labeledDate, candidate] = [...labeledDates.entries()][0];
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

    const confidence = competingDates.size > 0 ? "medium" : "high";
    return {
      field: makeField(labeledDate, confidence),
      candidate,
      missingReason: "",
    };
  }

  if (labeledDates.size > 1) {
    return {
      field: makeField<string>(null, "low"),
      candidate: null,
      missingReason: "conflicting labeled invoice dates",
    };
  }

  const unlabelledDates = new Map<string, CandidateSource>();

  lines.forEach((line, index) => {
    if (
      excludedDateLabel.test(line) ||
      invoiceNumberLabel.test(line)
    ) {
      return;
    }

    findDateCandidates(line).forEach((date) => {
      if (!unlabelledDates.has(date.value)) {
        const sourceLine = sourceLines[index] ?? line;
        unlabelledDates.set(date.value, {
          sourceLine,
          valueText: date.originalText,
          valueOccurrence: countTokenSpansBefore(
            line,
            date.originalText,
            date.index
          ),
          matchingLabel: null,
          labelOccurrence: 0,
          reason: "single unlabelled date candidate",
        });
      }
    });
  });

  if (unlabelledDates.size === 1) {
    const [date, candidate] = [...unlabelledDates.entries()][0];
    return {
      field: makeField(date, "medium"),
      candidate,
      missingReason: "",
    };
  }

  return {
    field: makeField<string>(null, "low"),
    candidate: null,
    missingReason:
      unlabelledDates.size > 1
        ? "conflicting unlabelled date candidates"
        : "no valid invoice date candidate",
  };
}

// --------------------------------------------------
// TOTAL EXTRACTION
// --------------------------------------------------

interface MoneyCandidate {
  value: number;
  originalText: string;
  startIndex: number;
}

function parseEuropeanAmount(value: string): number | null {
  const match =
    /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(value);
  if (!match) return null;

  const normalized = `${match[1].replace(/\./g, "")}.${match[2]}`;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function extractMoneyCandidates(line: string): MoneyCandidate[] {
  const amountPattern =
    /(?:^|[^\d.,\p{L}])(-\s*)?(?:₹|INR\b|Rs\.?)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)(?![\d.,\p{L}])/giu;
  const amounts: MoneyCandidate[] = [];

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
      const numericOffset = match[0].search(/\d/);
      const numericStart = match.index + numericOffset;
      const precedingCurrency =
        /(?:(?:US\$|₹|£|€|\$|INR|GBP|EUR|USD|Rs\.?)(?:\s*[:.]?\s*)){1,3}$/i.exec(
          line.slice(0, numericStart)
        )?.[0] ?? "";
      const trailingCurrency =
        /^\s*(?:(?:US\$|₹|£|€|\b(?:INR|GBP|EUR|USD)\b|Rs\.?)(?:\s*[:.]?\s*)){1,3}(?!\p{L})/iu.exec(
          line.slice(match.index + match[0].length)
        )?.[0] ?? "";
      amounts.push({
        value,
        originalText: `${precedingCurrency}${match[0]
          .slice(numericOffset)}${trailingCurrency}`.trim(),
        startIndex: precedingCurrency
          ? numericStart - precedingCurrency.length
          : numericStart,
      });
    }
  }

  const euroAmountPattern =
    /(?:€|EUR\b)\s*[:.]?\s*(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})(?![\d.,\p{L}])/giu;
  for (const match of line.matchAll(euroAmountPattern)) {
    const rawNumber = `${match[1]},${match[2]}`;
    const value = parseEuropeanAmount(rawNumber);
    if (value === null) continue;

    const startIndex = match.index;
    const endIndex = match.index + match[0].length;
    amounts.push({
      value,
      originalText: line.slice(startIndex, endIndex).trim(),
      startIndex,
    });
  }

  const euroSuffixPattern =
    /(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})\s*(?:€|EUR\b)(?!\p{L})/giu;
  for (const match of line.matchAll(euroSuffixPattern)) {
    const rawNumber = `${match[1]},${match[2]}`;
    const value = parseEuropeanAmount(rawNumber);
    if (value === null) continue;

    amounts.push({
      value,
      originalText: match[0].trim(),
      startIndex: match.index,
    });
  }

  return amounts;
}

function isStandaloneNearbyAmount(line: string): boolean {
  const amountOnlyPattern =
    /^\s*(?:(?:US\$|₹|£|€|\$)\s*|(?:INR|GBP|EUR|USD|Rs\.?)\s*[:.]?\s*)?(?:\d[\d,]*(?:\.\d{2})?|\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+,\d{1,2})(?:\s*(?:€|EUR))?(?:\s*\/-)?\s*$/i;
  const hasCurrency =
    /(?:₹|£|€|\$|\b(?:INR|GBP|EUR|USD|Rs\.?)\b)/i.test(line);
  const hasTwoDecimalPlaces = /\d[\d,]*\.\d{2}(?!\d)/.test(line);

  return (
    amountOnlyPattern.test(line) &&
    (hasCurrency || hasTwoDecimalPlaces)
  );
}

function extractTotal(text: string): {
  field: ExtractedField<number>;
  candidate: CandidateSource | null;
  missingReason: string;
} {
  const lines = getLines(text);
  const sourceLines = getSourceLines(text);
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
    candidate: CandidateSource;
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

    const sameLineValues = extractMoneyCandidates(
      line.slice(labelMatch.index + labelMatch[0].length)
    );
    const sameLineHasValues = sameLineValues.length > 0;
    const valuesOnLabelLine = sameLineHasValues
      ? sameLineValues
      : extractMoneyCandidates(line);

    if (valuesOnLabelLine.length) {
      const selectedAmount = valuesOnLabelLine[0];
      const selectedAmountStart =
        selectedAmount.startIndex +
        (sameLineHasValues
          ? labelMatch.index + labelMatch[0].length
          : 0);
      const labelOccurrence = countTokenSpansBefore(
        line,
        labelMatch[0],
        labelMatch.index
      );
      candidates.push({
        value: selectedAmount.value,
        score: label.score,
        candidate: {
          sourceLine: sourceLines[index] ?? line,
          valueText: selectedAmount.originalText,
          valueOccurrence: countTokenSpansBefore(
            line,
            selectedAmount.originalText,
            selectedAmountStart
          ),
          matchingLabel:
            label.pattern.exec(sourceLines[index] ?? line)?.[0] ??
            line.slice(
              labelMatch.index,
              labelMatch.index + labelMatch[0].length
            ),
          labelOccurrence,
          reason: "matched payable label and amount on the same line",
          labelSourceLine: sourceLines[index] ?? line,
        },
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

      const values = extractMoneyCandidates(nearbyLine);

      if (values.length) {
        const selectedAmount = values[0];
        candidates.push({
          value: selectedAmount.value,
          score: label.score - offset * 25,
          candidate: {
            sourceLine: sourceLines[index + offset] ?? nearbyLine,
            valueText: selectedAmount.originalText,
            valueOccurrence: countTokenSpansBefore(
              nearbyLine,
              selectedAmount.originalText,
              selectedAmount.startIndex
            ),
            matchingLabel:
              label.pattern.exec(sourceLines[index] ?? line)?.[0] ??
              line.slice(
                labelMatch.index,
                labelMatch.index + labelMatch[0].length
              ),
            labelOccurrence: countTokenSpansBefore(
              line,
              labelMatch[0],
              labelMatch.index
            ),
            reason: `matched payable label with standalone amount ${offset} line${offset === 1 ? "" : "s"} later`,
            labelSourceLine: sourceLines[index] ?? line,
          },
        });
        break;
      }
    }
  }
  });

  candidates.sort((a, b) => b.score - a.score);

  const selected = candidates[0];

  if (!selected) {
    return {
      field: makeField<number>(null, "low"),
      candidate: null,
      missingReason: "no payable amount candidate selected",
    };
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
    return {
      field: makeField<number>(null, "low"),
      candidate: null,
      missingReason: "conflicting equally ranked payable amount candidates",
    };
  }

  const confidence =
    strongestCompetitor >= selected.score - 25
      ? "low"
      : strongestCompetitor >= 120
        ? "medium"
        : selected.score >= 170
          ? "high"
          : "medium";

  return {
    field: makeField(selected.value, confidence),
    candidate: selected.candidate,
    missingReason: "",
  };
}

function isValidGroupedInteger(value: string, separator: "," | "."): boolean {
  const escapedSeparator = separator === "." ? "\\." : ",";
  const westernGrouping = new RegExp(
    `^\\d{1,3}(?:${escapedSeparator}\\d{3})+$`
  );
  const indianGrouping =
    separator === "," && /^\d{1,2}(?:,\d{2})+,\d{3}$/.test(value);
  return westernGrouping.test(value) || indianGrouping;
}

function normalizeSelectedAmount(
  amountText: string,
  currency: CurrencyCode | null
): { value: number | null; status: ExtractedCurrency["normalization"]; reason: string } {
  const numbers = amountText.match(/\d[\d.,]*/g) ?? [];
  if (numbers.length !== 1) {
    return {
      value: null,
      status: "unavailable",
      reason: "selected amount text could not be isolated",
    };
  }

  const raw = numbers[0];
  const commas = [...raw.matchAll(/,/g)].length;
  const periods = [...raw.matchAll(/\./g)].length;

  if (commas > 0 && periods > 0) {
    const decimalSeparator =
      raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    const decimalIndex = raw.lastIndexOf(decimalSeparator);
    const integerPart = raw.slice(0, decimalIndex);
    const fractionalPart = raw.slice(decimalIndex + 1);
    const validGrouping =
      !integerPart.includes(groupingSeparator) ||
      isValidGroupedInteger(integerPart, groupingSeparator);

    if (
      !validGrouping ||
      !/^\d{1,2}$/.test(fractionalPart) ||
      integerPart.includes(decimalSeparator)
    ) {
      return {
        value: null,
        status: "ambiguous",
        reason: "mixed separators do not form a supported amount format",
      };
    }

    const value = Number(
      `${integerPart.replace(/[.,]/g, "")}.${fractionalPart}`
    );
    return {
      value,
      status: "certain",
      reason: "distinct thousands and decimal separators",
    };
  }

  if (commas + periods === 0) {
    return {
      value: Number(raw),
      status: "certain",
      reason: "amount contains no separators",
    };
  }

  const separator: "," | "." = commas > 0 ? "," : ".";
  if ((commas > 1 || periods > 1) && isValidGroupedInteger(raw, separator)) {
    return {
      value: Number(raw.replace(/[.,]/g, "")),
      status: "certain",
      reason: "valid repeated thousands grouping",
    };
  }

  const [integerPart, fractionalPart] = raw.split(separator);
  if (!integerPart || !fractionalPart) {
    return {
      value: null,
      status: "ambiguous",
      reason: "separator placement is incomplete",
    };
  }

  if (/^\d{1,2}$/.test(fractionalPart)) {
    return {
      value: Number(`${integerPart}.${fractionalPart}`),
      status: "certain",
      reason: "one or two trailing digits indicate decimal precision",
    };
  }

  if (
    /^\d{3}$/.test(fractionalPart) &&
    isValidGroupedInteger(raw, separator) &&
    currency !== null &&
    ((separator === "," && currency !== "EUR") ||
      (separator === "." && currency === "EUR"))
  ) {
    return {
      value: Number(raw.replace(/[.,]/g, "")),
      status: "certain",
      reason: "grouping separator matches the detected currency convention",
    };
  }

  return {
    value: null,
    status: "ambiguous",
    reason: "three trailing digits could be decimal or thousands grouping",
  };
}

function extractCurrency(
  candidate: CandidateSource | null,
  selectedAmount: number | null
): ExtractedCurrency {
  if (!candidate || selectedAmount === null) {
    return {
      selectedAmount,
      normalizedAmount: null,
      code: null,
      originalText: null,
      confidence: "low",
      normalization: "unavailable",
      normalizationReason: "no selected payable amount",
      reason: "currency cannot be detected without a selected payable candidate",
    };
  }

  const originalText = candidate.valueText;
  const searchableText = [
    candidate.valueText,
    candidate.labelSourceLine !== candidate.sourceLine
      ? candidate.labelSourceLine ?? ""
      : "",
  ].join(" ");
  const currencies = new Set<CurrencyCode>();
  let hasBareDollar = false;
  const markerPattern =
    /US\$|₹|£|€|\bINR\b|\bGBP\b|\bUSD\b|\bEUR\b|\bRs\.?|\$/giu;

  for (const match of searchableText.matchAll(markerPattern)) {
    const marker = match[0].toUpperCase();
    if (marker === "$") {
      hasBareDollar = true;
    } else if (marker === "₹" || marker === "INR" || marker.startsWith("RS")) {
      currencies.add("INR");
    } else if (marker === "£" || marker === "GBP") {
      currencies.add("GBP");
    } else if (marker === "€" || marker === "EUR") {
      currencies.add("EUR");
    } else if (marker === "US$" || marker === "USD") {
      currencies.add("USD");
    }
  }

  let code: CurrencyCode | null = null;
  let confidence: ExtractedCurrency["confidence"] = "low";
  let reason: string;
  if (
    currencies.size > 1 ||
    (hasBareDollar && currencies.size > 0 && !currencies.has("USD"))
  ) {
    reason = "conflicting currency indicators on the selected payable candidate";
  } else if (currencies.size === 1) {
    code = [...currencies][0];
    confidence = "high";
    reason = `currency identified by an explicit ${code} code or symbol`;
  } else if (hasBareDollar) {
    reason = "bare dollar symbol is ambiguous between currencies";
  } else {
    reason = "no reliable currency indicator on the selected payable candidate";
  }

  const normalized = normalizeSelectedAmount(originalText, code);
  return {
    selectedAmount,
    normalizedAmount: normalized.value,
    code,
    originalText,
    confidence,
    normalization: normalized.status,
    normalizationReason: normalized.reason,
    reason,
  };
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
  const ocrSource = typeof input === "string" ? null : input;
  const lower = text.toLowerCase();

  const keywordCount = BILL_KEYWORDS.filter((keyword) =>
    lower.includes(keyword)
  ).length;

  const hasAmount = /\d+[.,]\d{2}/.test(text);
  const isBill = keywordCount >= 1 && hasAmount;

  const merchantExtraction = extractMerchant(text);
  const dateExtraction = extractDate(text);
  const totalExtraction = extractTotal(text);
  const merchant = merchantExtraction.field;
  const date = dateExtraction.field;
  const total = totalExtraction.field;
  const currency = extractCurrency(totalExtraction.candidate, total.value);
  const evidence: ExtractedBillEvidence = {
    merchant: makeExtractionEvidence(
      "merchant",
      merchant.value,
      merchant.confidence,
      merchantExtraction.candidate,
      ocrSource,
      merchantExtraction.missingReason
    ),
    date: makeExtractionEvidence(
      "date",
      date.value,
      date.confidence,
      dateExtraction.candidate,
      ocrSource,
      dateExtraction.missingReason
    ),
    total: makeExtractionEvidence(
      "total",
      total.value,
      total.confidence,
      totalExtraction.candidate,
      ocrSource,
      totalExtraction.missingReason
    ),
  };

  if (!isBill) {
    return {
      isBill: false,
      merchant,
      date,
      total,
      currency,
      category: makeField<ExpenseCategory>(null, "low"),
      rawText: text,
      evidence,
    };
  }

  const category = extractCategory(text, merchant.value);

  return {
    isBill: true,
    merchant,
    date,
    total,
    currency,
    category,
    rawText: text,
    evidence,
  };
}

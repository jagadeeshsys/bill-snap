export type OCRPassSource =
  | "processed-full"
  | "original-full"
  | "grayscale-contrast-full"
  | "processed-header-region"
  | "processed-total-region";

export interface OCRRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  coordinateSpace: "normalized";
}

export interface OCRBoundingBox {
  coordinateSpace: "pass-image-pixels";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OCRWordEvidence {
  id: string;
  blockId: string;
  nativeParagraphId: string | null;
  nativeLineId: string | null;
  paragraphIndex: number | null;
  lineIndex: number | null;
  wordIndex: number;
  text: string;
  confidence: number | null;
  bbox: OCRBoundingBox | null;
}

export interface OCRBlockEvidence {
  id: string;
  text: string;
  confidence: number | null;
  bbox: OCRBoundingBox | null;
  words: OCRWordEvidence[];
}

export interface OCRLineEvidence {
  id: string;
  text: string;
  confidence: number | null;
  bbox: OCRBoundingBox;
  words: OCRWordEvidence[];
}

export interface OCRPassResult {
  source: OCRPassSource;
  text: string;
  confidence: number;
  pageSegmentationMode: string;
  region: OCRRegion | null;
  width: number;
  height: number;
  blocks: OCRBlockEvidence[];
  lines: OCRLineEvidence[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readConfidence(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

function readBoundingBox(value: unknown): OCRBoundingBox | null {
  const box = asRecord(value);
  if (!box) return null;

  const { x0, y0, x1, y1 } = box;
  if (
    typeof x0 !== "number" ||
    typeof y0 !== "number" ||
    typeof x1 !== "number" ||
    typeof y1 !== "number" ||
    !Number.isFinite(x0) ||
    !Number.isFinite(y0) ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    x1 < x0 ||
    y1 < y0
  ) {
    return null;
  }

  return {
    coordinateSpace: "pass-image-pixels",
    x0,
    y0,
    x1,
    y1,
  };
}

export function convertOCRBlocks(blocks: unknown): OCRBlockEvidence[] {
  return asArray(blocks).flatMap((rawBlock, blockIndex) => {
    const block = asRecord(rawBlock);
    if (!block) return [];

    const blockId = `block-${blockIndex}`;
    const words: OCRWordEvidence[] = [];
    const appendWords = (
      rawWords: unknown,
      paragraphIndex: number | null,
      lineIndex: number | null
    ) => {
      asArray(rawWords).forEach((rawWord, wordIndex) => {
        const word = asRecord(rawWord);
        if (!word || typeof word.text !== "string") return;

        words.push({
          id: `${blockId}-p${paragraphIndex ?? "x"}-l${lineIndex ?? "x"}-w${wordIndex}`,
          blockId,
          nativeParagraphId:
            paragraphIndex === null ? null : `${blockId}-p${paragraphIndex}`,
          nativeLineId:
            lineIndex === null
              ? null
              : `${blockId}-p${paragraphIndex}-l${lineIndex}`,
          paragraphIndex,
          lineIndex,
          wordIndex,
          text: word.text,
          confidence: readConfidence(word.confidence),
          bbox: readBoundingBox(word.bbox),
        });
      });
    };

    asArray(block.paragraphs).forEach((rawParagraph, paragraphIndex) => {
      const paragraph = asRecord(rawParagraph);
      if (!paragraph) return;

      if (!Array.isArray(paragraph.lines)) {
        appendWords(paragraph.words, paragraphIndex, null);
        return;
      }

      paragraph.lines.forEach((rawLine, lineIndex) => {
        const line = asRecord(rawLine);
        if (!line) return;
        appendWords(line.words, paragraphIndex, lineIndex);
      });
    });

    if (!Array.isArray(block.paragraphs)) {
      appendWords(block.words, null, null);
    }

    return [
      {
        id: blockId,
        text: typeof block.text === "string" ? block.text : "",
        confidence: readConfidence(block.confidence),
        bbox: readBoundingBox(block.bbox),
        words,
      },
    ];
  });
}

export function groupOCRWordsIntoLines(
  words: OCRWordEvidence[],
  verticalToleranceRatio = 0.35
): OCRLineEvidence[] {
  const positionedWords = words
    .filter((word) => word.bbox !== null)
    .map((word, index) => ({
      word,
      index,
      centerY: (word.bbox!.y0 + word.bbox!.y1) / 2,
      height: word.bbox!.y1 - word.bbox!.y0,
    }))
    .sort(
      (a, b) =>
        a.centerY - b.centerY ||
        a.word.bbox!.x0 - b.word.bbox!.x0 ||
        a.index - b.index
    );

  if (positionedWords.length === 0) return [];

  const nativeGroups = new Map<string, typeof positionedWords>();
  const fallbackWords: typeof positionedWords = [];

  for (const positionedWord of positionedWords) {
    const { nativeLineId } = positionedWord.word;
    if (nativeLineId) {
      const nativeGroup = nativeGroups.get(nativeLineId) ?? [];
      nativeGroup.push(positionedWord);
      nativeGroups.set(nativeLineId, nativeGroup);
    } else {
      fallbackWords.push(positionedWord);
    }
  }

  const fallbackGroups: Array<{
    words: typeof positionedWords;
    centerY: number;
    blockId: string;
    nativeParagraphId: string | null;
  }> = [];
  const heights = fallbackWords
    .map(({ height }) => height)
    .filter((height) => height > 0)
    .sort((a, b) => a - b);
  const medianHeight = heights.length
    ? heights[Math.floor(heights.length / 2)]
    : 1;
  const tolerance =
    medianHeight *
    (Number.isFinite(verticalToleranceRatio)
      ? Math.max(0, verticalToleranceRatio)
      : 0.35);

  for (const positionedWord of fallbackWords) {
    const closestGroup = fallbackGroups
      .filter(
        (group) =>
          group.blockId === positionedWord.word.blockId &&
          group.nativeParagraphId ===
            positionedWord.word.nativeParagraphId &&
          Math.abs(group.centerY - positionedWord.centerY) <= tolerance &&
          group.words.every((member) => {
            const horizontalGap = Math.max(
              0,
              member.word.bbox!.x0 - positionedWord.word.bbox!.x1,
              positionedWord.word.bbox!.x0 - member.word.bbox!.x1
            );
            return horizontalGap <= medianHeight * 2;
          })
      )
      .sort(
        (a, b) =>
          Math.abs(a.centerY - positionedWord.centerY) -
          Math.abs(b.centerY - positionedWord.centerY)
      )[0];

    if (closestGroup) {
      closestGroup.words.push(positionedWord);
      closestGroup.centerY =
        closestGroup.words.reduce((sum, item) => sum + item.centerY, 0) /
        closestGroup.words.length;
    } else {
      fallbackGroups.push({
        words: [positionedWord],
        centerY: positionedWord.centerY,
        blockId: positionedWord.word.blockId,
        nativeParagraphId: positionedWord.word.nativeParagraphId,
      });
    }
  }

  const allGroups = [
    ...nativeGroups.values(),
    ...fallbackGroups.map(({ words: groupWords }) => groupWords),
  ];

  return allGroups
    .map((groupWords) => {
      const orderedWords = groupWords
        .slice()
        .sort(
          (a, b) =>
            a.word.bbox!.x0 - b.word.bbox!.x0 ||
            a.index - b.index
        )
        .map(({ word }) => word);
      const boxes = orderedWords.map((word) => word.bbox!);
      const confidences = orderedWords
        .map((word) => word.confidence)
        .filter((value): value is number => value !== null);

      return {
        id: `line-${orderedWords[0].id}`,
        text: orderedWords.map((word) => word.text).join(" ").trim(),
        confidence: confidences.length
          ? confidences.reduce((sum, value) => sum + value, 0) /
            confidences.length
          : null,
        bbox: {
          coordinateSpace: "pass-image-pixels" as const,
          x0: Math.min(...boxes.map((box) => box.x0)),
          y0: Math.min(...boxes.map((box) => box.y0)),
          x1: Math.max(...boxes.map((box) => box.x1)),
          y1: Math.max(...boxes.map((box) => box.y1)),
        },
        words: orderedWords,
      };
    })
    .sort(
      (a, b) =>
        a.bbox.y0 - b.bbox.y0 ||
        a.bbox.x0 - b.bbox.x0 ||
        a.id.localeCompare(b.id)
    );
}

export function createOCRPassResult(
  data: { text: string; confidence: number; blocks: unknown },
  metadata: Omit<
    OCRPassResult,
    "text" | "confidence" | "blocks" | "lines"
  >
): OCRPassResult {
  try {
    const blocks = convertOCRBlocks(data.blocks);
    const lines = groupOCRWordsIntoLines(
      blocks.flatMap((block) => block.words)
    );

    return {
      ...metadata,
      text: data.text.trim(),
      confidence: data.confidence,
      blocks,
      lines,
    };
  } catch {
    return {
      ...metadata,
      text: data.text.trim(),
      confidence: data.confidence,
      blocks: [],
      lines: [],
    };
  }
}

export interface OCRPassFailure {
  source: OCRPassSource;
  message: string;
  region: OCRRegion | null;
}

export interface OCRResult {
  passes: OCRPassResult[];
  failures: OCRPassFailure[];
  fullPagePasses: OCRPassResult[];
  targetedPasses: OCRPassResult[];
  primaryFullPage: OCRPassResult;
  text: string;
  confidence: number;
  dateRegionText: string;
}

export async function captureOptionalOCRPass<T>(
  source: OCRPassSource,
  region: OCRRegion | null,
  operation: () => Promise<T>,
  failures: OCRPassFailure[]
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    failures.push({
      source,
      region,
      message:
        error instanceof Error ? error.message : "OCR pass failed unexpectedly.",
    });
    return undefined;
  }
}

export const MAX_ORIGINAL_OCR_DECODED_PIXELS = 24_000_000;

export function shouldRunOCRComparison(
  pass: OCRPassResult,
  minimumConfidence = 60,
  minimumTextLength = 80
): boolean {
  return (
    pass.confidence < minimumConfidence || pass.text.length < minimumTextLength
  );
}

export function shouldRunOriginalResolutionOCR(
  width: number,
  height: number
): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width * height <= MAX_ORIGINAL_OCR_DECODED_PIXELS
  );
}

export function combineOCRPasses(
  passes: OCRPassResult[],
  failures: OCRPassFailure[] = []
): OCRResult {
  const fullPagePasses = passes.filter((pass) => pass.region === null);
  const targetedPasses = passes.filter((pass) => pass.region !== null);
  const primaryFullPage = fullPagePasses.find(
    (pass) => pass.source === "processed-full"
  );

  if (!primaryFullPage) {
    throw new Error("OCR did not produce the processed full-page result.");
  }

  return {
    passes: [...passes],
    failures: [...failures],
    fullPagePasses,
    targetedPasses,
    primaryFullPage,
    text: primaryFullPage.text,
    confidence: primaryFullPage.confidence,
    dateRegionText:
      targetedPasses
        .find((pass) => pass.source === "processed-header-region")
        ?.text ?? "",
  };
}

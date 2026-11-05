export type OCRPassSource =
  | "processed-full"
  | "original-full"
  | "grayscale-contrast-full"
  | "processed-header-region";

export interface OCRRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  coordinateSpace: "normalized";
}

export interface OCRPassResult {
  source: OCRPassSource;
  text: string;
  confidence: number;
  pageSegmentationMode: string;
  region: OCRRegion | null;
  width: number;
  height: number;
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

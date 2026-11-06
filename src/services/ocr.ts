import { createWorker, PSM } from "tesseract.js";
import { classifyBillText } from "./billClassifier";
import workerPath from "tesseract.js/dist/worker.min.js?url";
import coreScriptPath from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import "tesseract.js-core/tesseract-core-simd-lstm.wasm?url";
import engLanguageDataPath from "@tesseract.js-data/eng/4.0.0/eng.traineddata.gz?url";
import { createGrayscaleContrastImage } from "./image";
import { extractBillData } from "./extractor";
import {
  captureOptionalOCRPass,
  combineOCRPasses,
  createOCRPassResult,
  shouldRunOriginalResolutionOCR,
  shouldRunOCRComparison,
  type OCRPassFailure,
  type OCRPassResult,
  type OCRResult,
} from "./ocrEvidence";
import {
  createPromiseQueue,
  createRetryablePromise,
} from "./ocrRuntime";

function assetDirectory(assetUrl: string): string {
  return assetUrl.slice(0, assetUrl.lastIndexOf("/") + 1);
}

const workerManager = createRetryablePromise(() =>
  createWorker("eng", undefined, {
    workerPath,
    corePath: assetDirectory(coreScriptPath),
    langPath: assetDirectory(engLanguageDataPath),
    gzip: true,
  })
);
const enqueueWorkerOperation = createPromiseQueue();
const HEADER_REGION = {
  // Receipt logos are not reliably centered: some sit on either edge, while
  // invoices often place the merchant name across the full page width.
  left: 0.03,
  top: 0.02,
  width: 0.94,
  height: 0.4,
} as const;
const TOTAL_REGION = {
  // Totals on long receipts are often printed near the middle, before a long
  // payment/loyalty footer. Include both the total row and footer candidates.
  left: 0.04,
  top: 0.3,
  width: 0.92,
  height: 0.66,
} as const;

async function getWorker() {
  return workerManager.get();
}

async function recognizePass(
  image: File | Blob,
  options: {
    source: OCRPassResult["source"];
    mode: PSM;
    region?: OCRPassResult["region"];
    width: number;
    height: number;
  }
): Promise<OCRPassResult> {
  return enqueueWorkerOperation(async () => {
    const worker = await getWorker();
    await worker.setParameters({
      tessedit_pageseg_mode: options.mode,
    });
    const result = await worker.recognize(image, {}, { text: true, blocks: true });

    return createOCRPassResult(result.data, {
      source: options.source,
      pageSegmentationMode: options.mode,
      region: options.region ?? null,
      width: options.width,
      height: options.height,
    });
  });
}

async function recognizeRegion(
  bitmap: ImageBitmap,
  imageWidth: number,
  imageHeight: number,
  source: OCRPassResult["source"],
  region: { left: number; top: number; width: number; height: number }
): Promise<OCRPassResult> {
  const normalizedRegion = {
    ...region,
    coordinateSpace: "normalized" as const,
  };
  const cropX = Math.floor(imageWidth * region.left);
  const cropY = Math.floor(imageHeight * region.top);
  const cropWidth = Math.max(1, Math.floor(imageWidth * region.width));
  const cropHeight = Math.max(1, Math.floor(imageHeight * region.height));
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth * 2;
  canvas.height = cropHeight * 2;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the region OCR canvas.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const cropBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!cropBlob) throw new Error("Unable to encode the region OCR image.");

  return recognizePass(cropBlob, {
    source,
    mode: PSM.SPARSE_TEXT,
    region: normalizedRegion,
    width: canvas.width,
    height: canvas.height,
  });
}

function shouldRunFieldRecovery(
  passes: OCRPassResult[],
  failures: OCRPassFailure[]
): boolean {
  const combined = combineOCRPasses(passes, failures);
  const classification = classifyBillText(
    combined.passes.map((pass) => pass.text).join("\n")
  );
  if (classification.status !== "bill") return false;

  const fields = extractBillData(combined);
  return [fields.merchant, fields.date, fields.total].some(
    (field) => field.value === null || (field.needsReview && field.confidence === "low")
  );
}

/**
 * Runs a primary full-page pass, a small header crop, and selective
 * comparison passes when the primary OCR result is weak.
 */
export async function extractTextFromImage(
  image: File,
  onProgress?: (progress: number) => void,
  originalImage?: File,
  originalDimensions?: { width: number; height: number }
): Promise<OCRResult> {
  const bitmap = await createImageBitmap(image);
  const imageWidth = bitmap.width;
  const imageHeight = bitmap.height;
  const passes: OCRPassResult[] = [];
  const failures: OCRPassFailure[] = [];

  try {
    passes.push(
      await recognizePass(image, {
        source: "processed-full",
        mode: PSM.AUTO,
        width: imageWidth,
        height: imageHeight,
      })
    );
    onProgress?.(35);

    const headerPass = await captureOptionalOCRPass(
      "processed-header-region",
      { ...HEADER_REGION, coordinateSpace: "normalized" },
      async () => {
        return recognizeRegion(
          bitmap,
          imageWidth,
          imageHeight,
          "processed-header-region",
          HEADER_REGION
        );
      },
      failures
    );
    if (headerPass) passes.push(headerPass);

    const totalPass = await captureOptionalOCRPass(
      "processed-total-region",
      { ...TOTAL_REGION, coordinateSpace: "normalized" },
      async () =>
        recognizeRegion(
          bitmap,
          imageWidth,
          imageHeight,
          "processed-total-region",
          TOTAL_REGION
        ),
      failures
    );
    if (totalPass) passes.push(totalPass);

    onProgress?.(55);

    const needsFieldRecovery = shouldRunFieldRecovery(passes, failures);
    if (originalImage && (shouldRunOCRComparison(passes[0]) || needsFieldRecovery)) {
      const originalPass = await captureOptionalOCRPass(
        "original-full",
        null,
        async () => {
        const dimensions =
          originalDimensions ?? (await createImageBitmap(originalImage));
        try {
          if (
            shouldRunOriginalResolutionOCR(
              dimensions.width,
              dimensions.height
            )
          ) {
            return await recognizePass(originalImage, {
                source: "original-full",
                mode: PSM.AUTO,
                width: dimensions.width,
                height: dimensions.height,
            });
          }
          return undefined;
        } finally {
          if ("close" in dimensions) dimensions.close();
        }
        },
        failures
      );
      if (originalPass) passes.push(originalPass);
    }
    onProgress?.(78);

    const bestFullPage = combineOCRPasses(passes, failures).primaryFullPage;
    if (
      shouldRunOCRComparison(bestFullPage) ||
      shouldRunFieldRecovery(passes, failures)
    ) {
      const enhancedPass = await captureOptionalOCRPass(
        "grayscale-contrast-full",
        null,
        async () => {
        const enhancedImage = await createGrayscaleContrastImage(image);
        return recognizePass(enhancedImage, {
            source: "grayscale-contrast-full",
            mode: PSM.AUTO,
            width: imageWidth,
            height: imageHeight,
        });
        },
        failures
      );
      if (enhancedPass) passes.push(enhancedPass);
    }

    onProgress?.(100);
    return combineOCRPasses(passes, failures);
  } finally {
    bitmap.close();
  }
}

export async function terminateOCRWorker() {
  await enqueueWorkerOperation(async () => {
    const workerPromise = workerManager.peek();
    if (!workerPromise) return;

    const worker = await workerPromise;
    await worker.terminate();
    workerManager.clear();
  });
}

import { createWorker, PSM } from "tesseract.js";
import workerPath from "tesseract.js/dist/worker.min.js?url";
import coreScriptPath from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import "tesseract.js-core/tesseract-core-simd-lstm.wasm?url";
import engLanguageDataPath from "@tesseract.js-data/eng/4.0.0/eng.traineddata.gz?url";
import { createGrayscaleContrastImage } from "./image";
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
  left: 0.43,
  top: 0.08,
  width: 0.55,
  height: 0.34,
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

    const headerRegion = {
      ...HEADER_REGION,
      coordinateSpace: "normalized" as const,
    };
    const headerPass = await captureOptionalOCRPass(
      "processed-header-region",
      headerRegion,
      async () => {
      const cropX = Math.floor(imageWidth * HEADER_REGION.left);
      const cropY = Math.floor(imageHeight * HEADER_REGION.top);
      const cropWidth = Math.max(1, Math.floor(imageWidth * HEADER_REGION.width));
      const cropHeight = Math.max(1, Math.floor(imageHeight * HEADER_REGION.height));
      const canvas = document.createElement("canvas");
      canvas.width = cropWidth * 2;
      canvas.height = cropHeight * 2;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to create the header-region OCR canvas.");
      }

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
      if (!cropBlob) {
        throw new Error("Unable to encode the header-region OCR image.");
      }

      return recognizePass(cropBlob, {
        source: "processed-header-region",
        mode: PSM.SPARSE_TEXT,
        region: headerRegion,
        width: canvas.width,
        height: canvas.height,
      });
      },
      failures
    );
    if (headerPass) passes.push(headerPass);

    onProgress?.(55);

    if (originalImage && shouldRunOCRComparison(passes[0])) {
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
    if (shouldRunOCRComparison(bestFullPage)) {
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

import { createWorker } from "tesseract.js";

export interface OCRResult {
  text: string;
  confidence: number;
  dateRegionText: string;
}

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }

  return workerPromise;
}

/**
 * Extracts text from the complete bill image.
 */
export async function extractTextFromImage(
  image: File,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  const worker = await getWorker();

  const result = await worker.recognize(image, {}, {
    text: true,
  });

  onProgress?.(65);

  /*
   * Second OCR pass:
   * Focus on the upper-right invoice information area.
   */
  let dateRegionText = "";

  try {
    const bitmap = await createImageBitmap(image);

    const canvas = document.createElement("canvas");

    const cropX = Math.floor(bitmap.width * 0.43);
    const cropY = Math.floor(bitmap.height * 0.08);
    const cropWidth = Math.floor(bitmap.width * 0.55);
    const cropHeight = Math.floor(bitmap.height * 0.34);

    canvas.width = cropWidth * 2;
    canvas.height = cropHeight * 2;

    const context = canvas.getContext("2d");

    if (context) {
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

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });

      if (blob) {
        const regionResult = await worker.recognize(blob, {}, {
          text: true,
        });

        dateRegionText = regionResult.data.text.trim();
      }
    }

    bitmap.close();
  } catch (error) {
    console.warn("Date-region OCR failed:", error);
  }

  onProgress?.(100);

  return {
    text: result.data.text.trim(),
    confidence: result.data.confidence,
    dateRegionText,
  };
}

export async function terminateOCRWorker() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
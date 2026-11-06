import { extractTextFromImage } from "./ocr";
import { extractBillData } from "./extractor";
import {
  classifyBillText,
  type BillClassification,
} from "./billClassifier";
import type { OCRResult } from "./ocrEvidence";

export interface ProcessedBillResult {
  success: boolean;
  error: string | null;
  data: ReturnType<typeof extractBillData> | null;
  ocrConfidence: number | null;
  classification: BillClassification | null;
  ocrEvidence: OCRResult | null;
}

export async function processBillImage(
  image: File,
  onProgress?: (progress: number) => void,
  originalImage?: File,
  originalDimensions?: { width: number; height: number }
): Promise<ProcessedBillResult> {
  try {
    if (!image.type.startsWith("image/")) {
      throw new Error("Please upload a valid image.");
    }

    onProgress?.(10);

    const ocrResult = await extractTextFromImage(
      image,
      (progress) => {
        onProgress?.(10 + progress * 0.8);
      },
      originalImage,
      originalDimensions
    );

    const classificationText = ocrResult.passes
      .map((pass) => pass.text)
      .join("\n");
    const classification = classifyBillText(classificationText);
    onProgress?.(100);

    if (classification.status === "not_bill") {
      return {
        success: false,
        error:
          "This image doesn't appear to be a bill or receipt. Please choose a bill image.",
        data: null,
        ocrConfidence: ocrResult.confidence,
        classification,
        ocrEvidence: ocrResult,
      };
    }

    const billData = extractBillData(ocrResult);
    // A strong document classification can still be valid when OCR misses a
    // date or amount. Keep the image reviewable and let the user fill gaps.
    billData.isBill = classification.status === "bill";

    return {
      success: classification.status === "bill",
      error: null,
      data: billData,
      ocrConfidence: ocrResult.confidence,
      classification,
      ocrEvidence: ocrResult,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to process this image.",
      data: null,
      ocrConfidence: null,
      classification: null,
      ocrEvidence: null,
    };
  }
}

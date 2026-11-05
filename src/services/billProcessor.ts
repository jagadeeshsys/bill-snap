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

    const classification = classifyBillText(ocrResult.primaryFullPage.text);
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

    return {
      success: true,
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
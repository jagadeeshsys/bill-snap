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

    // Classification and extraction are separate heuristics. Do not expose a
    // saveable receipt form unless both agree that transaction evidence exists.
    if (!billData.isBill) {
      return {
        success: false,
        error: "We couldn't confirm this image contains a bill or receipt. Try a clearer, full-frame photo.",
        data: null,
        ocrConfidence: ocrResult.confidence,
        classification: {
          status: "uncertain",
          reasons: ["Receipt classifier and field extractor disagreed."],
        },
        ocrEvidence: ocrResult,
      };
    }

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

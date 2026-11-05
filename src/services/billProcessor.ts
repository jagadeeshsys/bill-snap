import { extractTextFromImage } from "./ocr";
import { extractBillData } from "./extractor";
import {
  classifyBillText,
  type BillClassification,
} from "./billClassifier";

export interface ProcessedBillResult {
  success: boolean;
  error: string | null;
  data: ReturnType<typeof extractBillData> | null;
  ocrConfidence: number | null;
  classification: BillClassification | null;
}

export async function processBillImage(
  image: File,
  onProgress?: (progress: number) => void
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
      }
    );

    /*
     * Put the focused invoice-region OCR first.
     * Keep the complete OCR text for the remaining fields.
     */
    const combinedText = [
      ocrResult.dateRegionText,
      ocrResult.text,
    ]
      .filter(Boolean)
      .join("\n\n");

    const classification = classifyBillText(combinedText);
    onProgress?.(100);

    if (classification.status === "not_bill") {
      return {
        success: false,
        error:
          "This image doesn't appear to be a bill or receipt. Please choose a bill image.",
        data: null,
        ocrConfidence: ocrResult.confidence,
        classification,
      };
    }

    const billData = extractBillData(combinedText);

    return {
      success: true,
      error: null,
      data: billData,
      ocrConfidence: ocrResult.confidence,
      classification,
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
    };
  }
}
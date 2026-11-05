import assert from "node:assert/strict";
import test from "node:test";
import {
  captureOptionalOCRPass,
  combineOCRPasses,
  MAX_ORIGINAL_OCR_DECODED_PIXELS,
  shouldRunOriginalResolutionOCR,
  shouldRunOCRComparison,
  type OCRPassResult,
} from "../src/services/ocrEvidence.ts";
import { extractBillData } from "../src/services/extractor.ts";

function makePass(
  overrides: Partial<OCRPassResult> = {}
): OCRPassResult {
  return {
    source: "processed-full",
    text: "Invoice Amount Payable ₹100.00",
    confidence: 72,
    pageSegmentationMode: "3",
    region: null,
    width: 1600,
    height: 1200,
    ...overrides,
  };
}

test("keeps processed full-page OCR as primary despite a higher-confidence alternate", () => {
  const first = makePass();
  const second = makePass({
    source: "original-full",
    text: "Invoice Amount Payable ₹1,000.00",
    confidence: 80,
  });
  const result = combineOCRPasses([first, second]);

  assert.equal(result.primaryFullPage, first);
  assert.equal(result.text, first.text);
  assert.deepEqual(result.fullPagePasses, [first, second]);
  assert.equal(result.passes.length, 2);
  assert.ok(!result.text.includes(second.text));
});

test("keeps targeted OCR separate and retains its region provenance", () => {
  const targeted = makePass({
    source: "processed-header-region",
    text: "Invoice Date 05/11/2026",
    confidence: 65,
    region: {
      left: 0.43,
      top: 0.08,
      width: 0.55,
      height: 0.34,
      coordinateSpace: "normalized",
    },
  });
  const result = combineOCRPasses([makePass(), targeted]);

  assert.deepEqual(result.targetedPasses, [targeted]);
  assert.equal(result.dateRegionText, targeted.text);
  assert.equal(result.primaryFullPage.text, "Invoice Amount Payable ₹100.00");
});

test("keeps the baseline usable when an optional OCR pass is missing", () => {
  const baseline = makePass();
  const result = combineOCRPasses([baseline]);

  assert.equal(result.primaryFullPage, baseline);
  assert.deepEqual(result.targetedPasses, []);
  assert.deepEqual(result.failures, []);
});

test("records failed optional OCR passes without discarding the baseline", async () => {
  const baseline = makePass();
  const failures = [];
  const region = {
    left: 0.43,
    top: 0.08,
    width: 0.55,
    height: 0.34,
    coordinateSpace: "normalized" as const,
  };
  const result = await captureOptionalOCRPass(
    "processed-header-region",
    region,
    async () => {
      throw new Error("canvas encoding failed");
    },
    failures
  );
  const evidence = combineOCRPasses([baseline], failures);

  assert.equal(result, undefined);
  assert.equal(evidence.primaryFullPage, baseline);
  assert.deepEqual(evidence.failures, [
    {
      source: "processed-header-region",
      region,
      message: "canvas encoding failed",
    },
  ]);
});

test("retains primary, alternate, and failed-pass diagnostic metadata", () => {
  const primary = makePass({
    source: "processed-full",
    text: "Primary invoice text",
    confidence: 61,
    pageSegmentationMode: "3",
    width: 1600,
    height: 1200,
  });
  const alternate = makePass({
    source: "original-full",
    text: "Alternate invoice text",
    confidence: 74,
    pageSegmentationMode: "3",
    width: 2400,
    height: 1800,
  });
  const failure = {
    source: "grayscale-contrast-full" as const,
    message: "Image canvas is unavailable.",
    region: null,
  };
  const evidence = combineOCRPasses([primary, alternate], [failure]);

  assert.equal(evidence.primaryFullPage, primary);
  assert.deepEqual(evidence.passes, [primary, alternate]);
  assert.deepEqual(evidence.failures, [failure]);
  assert.equal(evidence.primaryFullPage.text, "Primary invoice text");
  assert.equal(evidence.passes[1].source, "original-full");
  assert.equal(evidence.passes[1].width, 2400);
  assert.equal(evidence.passes[1].height, 1800);
  assert.equal(evidence.passes[1].confidence, 74);
  assert.equal(evidence.failures[0].source, "grayscale-contrast-full");
  assert.equal(evidence.failures[0].message, "Image canvas is unavailable.");
});

test("runs comparison OCR only for weak or very short full-page results", () => {
  assert.equal(shouldRunOCRComparison(makePass({ confidence: 80 }), 60, 0), false);
  assert.equal(shouldRunOCRComparison(makePass({ confidence: 45 })), true);
  assert.equal(shouldRunOCRComparison(makePass({ text: "Few words" })), true);
});

test("skips original-resolution OCR above the decoded-pixel budget", () => {
  assert.equal(shouldRunOriginalResolutionOCR(4000, 3000), true);
  assert.equal(
    shouldRunOriginalResolutionOCR(MAX_ORIGINAL_OCR_DECODED_PIXELS + 1, 1),
    false
  );
  assert.equal(shouldRunOriginalResolutionOCR(0, 100), false);
});

test("extracts from processed baseline without merging alternate conflicts", () => {
  const evidence = combineOCRPasses([
    makePass({ text: "Invoice Amount Payable ₹100.00", confidence: 65 }),
    makePass({
      source: "original-full",
      text: "Invoice Amount Payable ₹120.00",
      confidence: 80,
    }),
  ]);

  assert.equal(extractBillData(evidence).total.value, 100);
});

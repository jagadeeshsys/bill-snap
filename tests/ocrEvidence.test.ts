import assert from "node:assert/strict";
import test from "node:test";
import {
  captureOptionalOCRPass,
  combineOCRPasses,
  createOCRPassResult,
  convertOCRBlocks,
  groupOCRWordsIntoLines,
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
    blocks: [],
    lines: [],
    ...overrides,
  };
}

test("converts Tesseract blocks into stable block and word evidence", () => {
  const blocks = convertOCRBlocks([
    {
      text: "Invoice Total",
      confidence: 91,
      bbox: { x0: 10, y0: 20, x1: 210, y1: 50 },
      paragraphs: [
        {
          lines: [
            {
              words: [
                {
                  text: "Invoice",
                  confidence: 96,
                  bbox: { x0: 10, y0: 20, x1: 100, y1: 50 },
                },
                {
                  text: "Total",
                  confidence: 86,
                  bbox: { x0: 120, y0: 21, x1: 210, y1: 49 },
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, "block-0");
  assert.deepEqual(blocks[0].bbox, {
    coordinateSpace: "pass-image-pixels",
    x0: 10,
    y0: 20,
    x1: 210,
    y1: 50,
  });
  assert.equal(blocks[0].confidence, 91);
  assert.deepEqual(
    blocks[0].words.map(({ id, text, blockId }) => ({ id, text, blockId })),
    [
      {
        id: "block-0-p0-l0-w0",
        text: "Invoice",
        blockId: "block-0",
      },
      {
        id: "block-0-p0-l0-w1",
        text: "Total",
        blockId: "block-0",
      },
    ]
  );
});

test("retains text while marking malformed coordinates and confidence unavailable", () => {
  const blocks = convertOCRBlocks([
    {
      text: "2SC",
      confidence: Number.NaN,
      bbox: { x0: 12, y0: 8, x1: 4, y1: 18 },
      paragraphs: [
        {
          lines: [
            {
              words: [
                {
                  text: "2SC",
                  confidence: 101,
                  bbox: { x0: 5, y0: 8, x1: Infinity, y1: 18 },
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

  assert.equal(blocks[0].text, "2SC");
  assert.equal(blocks[0].confidence, null);
  assert.equal(blocks[0].bbox, null);
  assert.equal(blocks[0].words[0].text, "2SC");
  assert.equal(blocks[0].words[0].confidence, null);
  assert.equal(blocks[0].words[0].bbox, null);
});

test("groups words by vertical proximity and orders words and lines spatially", () => {
  const blocks = convertOCRBlocks([
    {
      paragraphs: [
        {
          lines: [
            {
              words: [
                {
                  text: "right",
                  confidence: 80,
                  bbox: { x0: 120, y0: 22, x1: 170, y1: 42 },
                },
                {
                  text: "left",
                  confidence: 90,
                  bbox: { x0: 10, y0: 20, x1: 60, y1: 40 },
                },
              ],
            },
            {
              words: [
                {
                  text: "bottom",
                  confidence: 70,
                  bbox: { x0: 12, y0: 80, x1: 70, y1: 100 },
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
  const lines = groupOCRWordsIntoLines(blocks[0].words);

  assert.deepEqual(
    lines.map((line) => line.text),
    ["left right", "bottom"]
  );
  assert.deepEqual(
    lines[0].words.map((word) => word.text),
    ["left", "right"]
  );
  assert.deepEqual(lines[0].bbox, {
    coordinateSpace: "pass-image-pixels",
    x0: 10,
    y0: 20,
    x1: 170,
    y1: 42,
  });
  assert.equal(lines[0].confidence, 85);
});

test("handles empty OCR blocks and words without geometry", () => {
  assert.deepEqual(convertOCRBlocks(null), []);
  assert.deepEqual(convertOCRBlocks([]), []);
  assert.deepEqual(groupOCRWordsIntoLines([]), []);

  const blocks = convertOCRBlocks([
    {
      text: "No geometry",
      paragraphs: [
        {
          lines: [
            {
              words: [{ text: "No" }, { text: "geometry", bbox: null }],
            },
          ],
        },
      ],
    },
  ]);

  assert.equal(blocks[0].words.length, 2);
  assert.ok(blocks[0].words.every((word) => word.bbox === null));
  assert.deepEqual(groupOCRWordsIntoLines(blocks[0].words), []);
});

test("keeps words from two native receipt columns on separate lines", () => {
  const blocks = convertOCRBlocks([
    {
      paragraphs: [
        {
          lines: [
            {
              words: [
                {
                  text: "Invoice",
                  confidence: 90,
                  bbox: { x0: 10, y0: 20, x1: 75, y1: 40 },
                },
              ],
            },
            {
              words: [
                {
                  text: "Total",
                  confidence: 88,
                  bbox: { x0: 260, y0: 21, x1: 310, y1: 41 },
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
  const lines = groupOCRWordsIntoLines(blocks[0].words);

  assert.deepEqual(
    lines.map((line) => line.text),
    ["Invoice", "Total"]
  );
  assert.notEqual(lines[0].id, lines[1].id);
});

test("keeps adjacent native rows separate despite similar vertical positions", () => {
  const blocks = convertOCRBlocks([
    {
      paragraphs: [
        {
          lines: [
            {
              words: [
                {
                  text: "Item",
                  confidence: 90,
                  bbox: { x0: 10, y0: 20, x1: 50, y1: 40 },
                },
                {
                  text: "Tea",
                  confidence: 90,
                  bbox: { x0: 55, y0: 20, x1: 85, y1: 40 },
                },
              ],
            },
            {
              words: [
                {
                  text: "Qty",
                  confidence: 90,
                  bbox: { x0: 10, y0: 28, x1: 40, y1: 48 },
                },
                {
                  text: "2",
                  confidence: 90,
                  bbox: { x0: 55, y0: 28, x1: 65, y1: 48 },
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
  const lines = groupOCRWordsIntoLines(blocks[0].words);

  assert.deepEqual(
    lines.map((line) => line.text),
    ["Item Tea", "Qty 2"]
  );
});

test("preserves native line relationships across blocks and paragraphs", () => {
  const blocks = convertOCRBlocks([
    {
      paragraphs: [
        {
          lines: [
            {
              words: [
                {
                  text: "First",
                  confidence: 90,
                  bbox: { x0: 10, y0: 20, x1: 55, y1: 40 },
                },
              ],
            },
          ],
        },
        {
          lines: [
            {
              words: [
                {
                  text: "Second",
                  confidence: 90,
                  bbox: { x0: 60, y0: 20, x1: 120, y1: 40 },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      paragraphs: [
        {
          lines: [
            {
              words: [
                {
                  text: "Third",
                  confidence: 90,
                  bbox: { x0: 125, y0: 20, x1: 170, y1: 40 },
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
  const lines = groupOCRWordsIntoLines(blocks.flatMap((block) => block.words));

  assert.deepEqual(
    lines.map((line) => line.text),
    ["First", "Second", "Third"]
  );
  assert.equal(new Set(lines.map((line) => line.id)).size, 3);
});

test("uses a conservative spatial fallback when native line information is absent", () => {
  const blocks = convertOCRBlocks([
    {
      words: [
        {
          text: "Left",
          confidence: 90,
          bbox: { x0: 10, y0: 20, x1: 50, y1: 40 },
        },
        {
          text: "Right",
          confidence: 90,
          bbox: { x0: 250, y0: 20, x1: 300, y1: 40 },
        },
        {
          text: "Next",
          confidence: 90,
          bbox: { x0: 10, y0: 28, x1: 50, y1: 48 },
        },
      ],
    },
  ]);
  const lines = groupOCRWordsIntoLines(blocks[0].words);

  assert.deepEqual(
    lines.map((line) => line.text),
    ["Left", "Right", "Next"]
  );
});

test("keeps recognized text when optional geometry processing throws", () => {
  const blocks = new Proxy([], {
    get(target, property, receiver) {
      if (property === "flatMap") {
        throw new Error("malformed geometry result");
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const pass = createOCRPassResult(
    {
      text: "Invoice Amount Payable 100.00",
      confidence: 75,
      blocks,
    },
    {
      source: "processed-full",
      pageSegmentationMode: "3",
      region: null,
      width: 1600,
      height: 1200,
    }
  );

  assert.equal(pass.text, "Invoice Amount Payable 100.00");
  assert.equal(pass.confidence, 75);
  assert.deepEqual(pass.blocks, []);
  assert.deepEqual(pass.lines, []);
});

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

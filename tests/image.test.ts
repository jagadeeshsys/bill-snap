import assert from "node:assert/strict";
import test from "node:test";
import {
  enhanceGrayscaleContrast,
  getScaledDimensions,
} from "../src/services/image.ts";

test("limits the longest image dimension without upscaling smaller images", () => {
  assert.deepEqual(getScaledDimensions(4000, 2000), {
    width: 1600,
    height: 800,
  });
  assert.deepEqual(getScaledDimensions(800, 1200), {
    width: 800,
    height: 1200,
  });
});

test("rejects invalid decoded image dimensions", () => {
  assert.throws(() => getScaledDimensions(0, 100), /dimensions are invalid/i);
  assert.throws(() => getScaledDimensions(100, Number.POSITIVE_INFINITY), /dimensions are invalid/i);
});

test("grayscale contrast adjustment preserves alpha and avoids binarizing pixels", () => {
  const pixels = new Uint8ClampedArray([
    100, 120, 140, 255,
    240, 230, 220, 128,
  ]);

  enhanceGrayscaleContrast(pixels);

  assert.equal(pixels[0], pixels[1]);
  assert.equal(pixels[1], pixels[2]);
  assert.equal(pixels[3], 255);
  assert.equal(pixels[4], pixels[5]);
  assert.equal(pixels[5], pixels[6]);
  assert.equal(pixels[7], 128);
  assert.ok(pixels[0] > 0 && pixels[0] < 255);
  assert.ok(pixels[4] > 0 && pixels[4] < 255);
});

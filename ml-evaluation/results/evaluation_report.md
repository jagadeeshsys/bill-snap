# Bill Snap full image evaluation

Run: 2026-11-06T15:43:21.731Z. Dataset: 34 images, manually checked against the supplied images and labeled in [test-manifest.json](../test-manifest.json).

## Method and scope

The runner applies Tesseract.js to each original source image, then uses the same bill classifier and extractor modules as the app. This isolates OCR and downstream rules, but does not execute the app’s browser canvas resizing, compression, header crop, optional original-image pass, or contrast pass. Treat this as a reproducible diagnostic; it is not a device/browser end-to-end test.

Field correctness is exact after case/punctuation normalization for merchant, date, and category, and within 0.01 for total. Expected fields were transcribed by visual review. B17 is a jewelry replacement valuation rather than a purchase receipt. Blank expected values are omitted where the image did not provide a reliable ground truth.

## Classification

Correct classifications: **30/34** (88.2%). Uncertain predictions count as incorrect in this accuracy figure.

| Expected | Predicted bill | Predicted uncertain | Predicted not bill |
|---|---:|---:|---:|
| bill | 26 | 2 | 0 |
| not_bill | 0 | 2 | 4 |

## Field correctness

| Field | Correct | Evaluated |
|---|---:|---:|
| merchant | 7 | 28 |
| date | 16 | 27 |
| total | 15 | 28 |
| category | 25 | 28 |

## Per-image results

| Image | Expected | Predicted | Class | Merchant | Date | Total | Category |
|---|---|---|---|---:|---:|---:|---:|
| B16.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| B17.JPG | not_bill | not_bill | ✓ | — | — | — | — |
| B18.JPG | bill | bill | ✓ | ✓ | ✗ | ✓ | ✓ |
| B19.JPG | bill | uncertain | ✗ | ✗ | ✗ | ✗ | ✗ |
| B20.jpeg | bill | bill | ✓ | ✗ | ✗ | ✗ | ✓ |
| B21.JPG | bill | bill | ✓ | ✓ | ✓ | ✗ | ✓ |
| B22.JPG | bill | bill | ✓ | ✗ | ✓ | ✗ | ✓ |
| B23.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| B24.JPG | bill | bill | ✓ | ✗ | ✓ | ✗ | ✓ |
| B25.JPG | bill | bill | ✓ | ✗ | ✗ | ✓ | ✓ |
| B26.JPG | bill | uncertain | ✗ | ✗ | ✗ | ✗ | ✗ |
| B27.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| B28.JPG | bill | bill | ✓ | ✗ | ✗ | ✓ | ✓ |
| B29.JPG | bill | bill | ✓ | ✓ | ✗ | ✗ | ✓ |
| bills/B1.JPG | bill | bill | ✓ | ✗ | — | ✓ | ✓ |
| bills/B10.JPG | bill | bill | ✓ | ✗ | ✗ | ✗ | ✓ |
| bills/B11.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B12.jpg | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B13.jpg | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B14.jpg | bill | bill | ✓ | ✗ | ✗ | ✗ | ✗ |
| bills/B15.jpg | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B2.JPG | bill | bill | ✓ | ✗ | ✗ | ✗ | ✓ |
| bills/B3.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B4.JPG | bill | bill | ✓ | ✗ | ✓ | ✗ | ✓ |
| bills/B5.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B6.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B7.JPG | bill | bill | ✓ | ✗ | ✗ | ✗ | ✓ |
| bills/B8.JPG | bill | bill | ✓ | ✗ | ✓ | ✗ | ✓ |
| bills/B9.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| non-bills/NB1.JPG | not_bill | not_bill | ✓ | — | — | — | — |
| non-bills/NB2.jpg | not_bill | uncertain | ✗ | — | — | — | — |
| non-bills/NB3.jpg | not_bill | not_bill | ✓ | — | — | — | — |
| non-bills/NB4.jpg | not_bill | uncertain | ✗ | — | — | — | — |
| non-bills/NB5.jpg | not_bill | not_bill | ✓ | — | — | — | — |

The full OCR text, extracted values, confidence/review flags, expected values, and per-field comparisons are in [latest-run.json](./latest-run.json).

## Reproduce

```bash
node --experimental-strip-types ml-evaluation/run-evaluation.mjs
npm test
npm run lint
npm run build
```

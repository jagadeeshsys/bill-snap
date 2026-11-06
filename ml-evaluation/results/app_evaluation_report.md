# Bill Snap browser-pipeline evaluation

Run: 2026-11-06T16:23:59.354Z. Dataset: 34 images from [test-manifest.json](../test-manifest.json).

## Method

Runs the app’s actual browser services in headless Chrome with a 390×844 mobile viewport: `processImage` for MIME/size validation, orientation-aware decoding, 1600-pixel resize, and JPEG compression, followed by `processBillImage` for bundled Tesseract OCR, full-page and targeted crops, optional source-resolution/contrast OCR, classification, and field extraction. This exercises the OCR processing path but not camera hardware, gallery picker UI, manual edits, IndexedDB save, or a physical phone.

Uncertain classification counts as incorrect. Expected fields were visually transcribed; B17 is a jewelry replacement valuation, not a purchase. Totals are correct within 0.01; other fields use case/punctuation-insensitive exact comparison.

## Classification

Correct classifications: **29/34** (85.3%).

| Expected | Predicted bill | Predicted uncertain | Predicted not bill |
|---|---:|---:|---:|
| bill | 26 | 2 | 0 |
| not_bill | 0 | 3 | 3 |

## Field correctness

| Field | Correct | Evaluated |
|---|---:|---:|
| merchant | 14 | 28 |
| date | 19 | 27 |
| total | 22 | 28 |
| category | 25 | 28 |

## Per-image results

| Image | Expected | Predicted | Class | Merchant | Date | Total | Category |
|---|---|---|---:|---:|---:|---:|---:|
| B16.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| B17.JPG | not_bill | not_bill | ✓ | — | — | — | — |
| B18.JPG | bill | bill | ✓ | ✓ | ✓ | ✗ | ✓ |
| B19.JPG | bill | bill | ✓ | ✗ | ✗ | ✗ | ✗ |
| B20.jpeg | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| B21.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| B22.JPG | bill | bill | ✓ | ✗ | ✗ | ✗ | ✓ |
| B23.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| B24.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| B25.JPG | bill | bill | ✓ | ✗ | ✗ | ✓ | ✓ |
| B26.JPG | bill | uncertain | ✗ | ✗ | ✗ | ✗ | ✗ |
| B27.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| B28.JPG | bill | uncertain | ✗ | ✗ | ✗ | ✗ | ✓ |
| B29.JPG | bill | bill | ✓ | ✓ | ✗ | ✓ | ✓ |
| bills/B1.JPG | bill | bill | ✓ | ✓ | — | ✓ | ✓ |
| bills/B10.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B11.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B12.jpg | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B13.jpg | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B14.jpg | bill | bill | ✓ | ✗ | ✗ | ✗ | ✗ |
| bills/B15.jpg | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B2.JPG | bill | bill | ✓ | ✓ | ✗ | ✓ | ✓ |
| bills/B3.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B4.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B5.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B6.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B7.JPG | bill | bill | ✓ | ✗ | ✓ | ✓ | ✓ |
| bills/B8.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills/B9.JPG | bill | bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| non-bills/NB1.JPG | not_bill | not_bill | ✓ | — | — | — | — |
| non-bills/NB2.jpg | not_bill | uncertain | ✗ | — | — | — | — |
| non-bills/NB3.jpg | not_bill | not_bill | ✓ | — | — | — | — |
| non-bills/NB4.jpg | not_bill | uncertain | ✗ | — | — | — | — |
| non-bills/NB5.jpg | not_bill | uncertain | ✗ | — | — | — | — |

Raw primary and targeted OCR text, field evidence, confidence/review flags, and pass failures are in [app-run.json](./app-run.json).

## Reproduce

Start the dev server at `http://127.0.0.1:5175/bill-snap/`, launch Chrome with remote debugging on port 9222, then run:

```bash
node ml-evaluation/run-app-evaluation.mjs
```

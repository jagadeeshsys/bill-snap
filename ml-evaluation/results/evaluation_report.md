cat > ml-evaluation/results/evaluation_report.md <<'EOF'
# Bill Snap — Evaluation Report

## 1. Dataset

The evaluation dataset contains 20 images:

- 15 real bill images (B01–B15).
- 5 non-bill images (N01–N05).
- Includes printed receipts, tax invoices, difficult photographs and a handwritten invoice.

Each image was processed using the local Bill Snap application.

The application uses Tesseract.js OCR and rule-based classification and extraction.

## 2. Evaluation Method

Each image was processed through the application and compared against the source image.

The following were evaluated:

1. Bill / non-bill classification.
2. Merchant name extraction.
3. Date extraction.
4. Total payable amount extraction.
5. Suggested expense category.

Results use the following labels:

- Correct: output matches the verified ground truth.
- Incorrect: output does not match the ground truth.
- Not extracted: application returned no value.
- Uncertain: application could not confidently classify the image.
- Not verifiable: source information is insufficient to determine correctness.
- N/A: field does not apply to the test.

The complete results are recorded in `evaluation.csv`.

## 3. Classification Results

### Bill images

| Outcome | Count |
|---|---:|
| Entered bill review flow | 6/15 |
| Uncertain / manual review | 9/15 |

### Non-bill images

| Test | Image | Application outcome |
|---|---|---|
| N01 | College timetable | Uncertain / manual review |
| N02 | Road and motorcycle photograph | Uncertain / manual review |
| N03 | Restaurant/menu display | Uncertain / manual review |
| N04 | Personal selfie | Uncertain / manual review |
| N05 | Clothing product tag | Rejected as not a bill |

Only 1 of the 5 non-bill images was explicitly rejected.

The remaining 4 were routed to manual review. This shows that the current classifier is conservative and needs better non-bill rejection.

An uncertain result is not counted as a confirmed correct classification.

## 4. Extraction Results

Based on the recorded app outputs:

| Field | Correct | Incorrect | Not extracted | Not verifiable |
|---|---:|---:|---:|---:|
| Merchant | 1 | 3 | 10 | 1 |
| Date | 2 | 1 | 11 | 1 |
| Total amount | 0 | 1 | 14 | 0 |

These counts describe the recorded bill observations. They are not a general-world accuracy estimate.

### Merchant extraction

- Nidhi Motors was extracted correctly.
- Vernon Fox Trading and Choice Fashion & Home produced noisy partial merchant text.
- The Rajalakshmi invoice produced a partial merchant/header match.
- Several other receipts and invoices returned blank merchant fields.

### Date extraction

- Sakala Jewellery House: correct date, 06-06-2026.
- Sri Rajalakshmi Silvermine: correct date, 06-06-2026.
- Nidhi Motors: extracted 06-11-2026 instead of 05-11-2026.
- Handwritten GET Electronics date could not be verified.

### Total amount extraction

- No recorded bill total matched the verified ground truth.
- Nidhi Motors returned ₹2,841.36 instead of the payable amount ₹2,841.00.
- The remaining recorded bill outputs had blank total fields.

## 5. Category Results

The following provisional category evaluation is recorded:

| Result | Count |
|---|---:|
| Correct | 4 |
| Incorrect | 10 |
| Not verifiable | 1 |

The supermarket receipts were provisionally labelled Groceries based on merchant and document context. These labels should be checked against the purchased items where possible.

The application frequently suggested Other for supermarket receipts and the electronics invoice.

## 6. OCR Observations

OCR quality varies with image quality and document layout.

Difficult examples include:

- Crumpled and folded receipts.
- Long receipts with small printed text.
- Images photographed at an angle.
- Handwritten invoices.
- Documents containing multiple dates and monetary values.

OCR recognition scores represent text recognition confidence. They are not field extraction accuracy percentages.

## 7. Failure Analysis Summary

1. Non-bill images frequently enter manual review instead of being rejected.
2. Long receipts and low-quality photographs produce noisy OCR.
3. Merchant extraction fails on fragmented or unfamiliar business names.
4. Date extraction can select an unrelated date from an invoice.
5. Amount extraction can select net amount instead of final payable amount.
6. Category suggestions frequently fall back to Other.
7. Handwritten documents are difficult for the current OCR pipeline.

Further details are documented in `failure_analysis.md`.

## 8. Implementation Approach and Limitations

Bill Snap currently uses:

- Tesseract.js for browser-based OCR.
- Rule-based document classification.
- Heuristic merchant, date and amount extraction.
- Rule-based category suggestions.
- Manual review and correction.

The current implementation does not use a trained machine-learning classifier.

This approach was selected to keep the application local, avoid paid API dependencies and make the processing pipeline explainable.

The results show that the current approach needs improvement, particularly in non-bill rejection, total extraction and merchant recognition.

## 9. Future Improvements

- Improve non-bill rejection using stronger document-level signals.
- Improve merchant extraction across different invoice layouts.
- Improve selection of invoice dates when multiple dates are present.
- Improve final payable amount selection.
- Improve grocery and electronics category detection.
- Evaluate a lightweight on-device bill classification model.
- Expand the evaluation dataset with more varied receipts.

## Release preparation evidence review (2026-11-06)

No fresh receipt-evaluation run was performed against the Phase 4 release
build. The results below describe only the older retained records and must not
be presented as current-release predictions or as an improvement measurement.

### Historical classification record

The `classification_result` and `predicted_type` columns in
`evaluation.csv` record 6 bill outcomes as `Bill`, 9 bill outcomes as
`Uncertain`, 1 non-bill outcome as `Non-bill`, and 4 non-bill outcomes as
`Uncertain`. For that historical record, strict accuracy is **7/20 (35%)**:
all 20 outcomes are captured, and all 13 `Uncertain` outcomes count as
incorrect. This is not a measurement of the current release.

### Field, currency, and correction evidence

- The historical CSV contains field labels such as `Not extracted`, but it
  predates the current evidence-status distinctions. Where the app output or
  verified ground truth cannot be established from retained evidence, those
  labels are not reclassified as genuinely blank or incorrect. No release
  field-accuracy rates are reported.
- In `evaluation_phase2_1.csv`, ground-truth field verification is blank for
  all 20 rows; 19 classification outputs are marked unavailable, and all 20
  currency outputs are unavailable. The one captured B06 observation is not a
  complete or current-build evaluation. These values are not release accuracy
  data.
- Currency extraction is not exposed by the review UI. No currency accuracy
  is reported.
- Manual corrections are not captured as a complete paired set of initial
  predictions and corrected values. Corrections are not counted as OCR
  successes.
- Ground-truth merchant, date, total, currency, and category values require
  manual verification against their source images before a new accuracy
  calculation.

### Supplemental cohort and next evaluation

B16–B29 remain a separate, unscored supplemental cohort. Their class and field
ground truth have not been verified for this release. Follow
`evaluation_protocol_phase3.md` and record results in a new run CSV; do not
overwrite either historical CSV. Distinguish verified outcomes, unverified
ground truth, unavailable output, genuinely blank fields, uncertainty, and
manual corrections as specified in the protocol.

The tests, lint, build, and application smoke checks validate software
behavior, not receipt-field accuracy. No accuracy improvement is claimed.

EOF
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

EOF
# Bill Snap — Failure Analysis

## 1. Non-Bill Classification

Five non-bill images were tested.

| Image | Description | Application result |
|---|---|---|
| NB1 | College timetable | Uncertain / manual review |
| NB2 | Road and motorcycle photograph | Uncertain / manual review |
| NB3 | Restaurant/menu display | Uncertain / manual review |
| NB4 | Personal selfie | Uncertain / manual review |
| NB5 | Clothing product tag | Rejected as not a bill |

Only one of five non-bill images was explicitly rejected.

The remaining four entered manual review. The classifier is therefore conservative and does not reliably reject non-bill images.

A possible reason is that OCR text and weak transaction-related signals are insufficient to distinguish all document and photograph types.

## 2. Merchant Extraction Failures

Merchant extraction was unreliable across several receipt formats.

Observed examples:

- B01: Vernon Fox Trading was not extracted correctly. OCR returned noisy text: `I JS AT FL`.
- B06: Choice Fashion & Home produced partial/noisy text: `OICE JB`.
- B12: Sakala Jewellery House returned no merchant.
- B13: The application returned `A UNIT OF RAJALAKSHMI JEWELLERY MART`, which did not exactly match the expected merchant name.
- B15: NIDHI MOTORS was extracted correctly.

Possible causes include OCR character errors, unfamiliar invoice layouts, fragmented business names and competing header text.

## 3. Date Extraction Failures

Date extraction worked on some printed invoices but failed on several receipts.

Observed examples:

- B12: Correctly extracted `06-06-2026`.
- B13: Correctly extracted `06-06-2026`.
- B15: Extracted `06-11-2026` instead of the invoice date `05-11-2026`.
- B14: The handwritten date could not be extracted reliably.

The Nidhi Motors invoice contains multiple dates, including insurance expiry and next-service dates. The application selected the wrong date candidate.

This indicates that date selection needs stronger use of invoice-date labels and contextual information.

## 4. Total Amount Extraction Failures

No recorded bill total matched the verified ground-truth total.

The Nidhi Motors invoice demonstrates a specific amount-selection failure:

- Net amount: ₹2,841.36
- Round off: -₹0.36
- Invoice amount payable: ₹2,841.00
- Total invoice amount: ₹2,841.00

The application selected ₹2,841.36 instead of the final payable amount.

For other bill images, the total field was blank.

Possible causes include multiple monetary values on invoices, OCR errors, currency formatting and insufficient association between amount labels and values.

## 5. Category Suggestion Failures

The application frequently suggested `Other` for supermarket receipts.

Examples include:

- Sainsbury's
- Tesco
- New Asian Super Market

These were provisionally labelled Groceries during evaluation, but the actual purchased items should be checked before treating every category label as definitive.

The GET Electronics invoice was also assigned `Other` instead of the provisional Electronics category.

The application correctly suggested Shopping for several jewellery and retail invoices and Transport for Nidhi Motors.

## 6. Difficult Image Conditions

The dataset includes different image conditions:

- Crumpled and folded receipts.
- Long receipts with small text.
- Photographs taken at different angles.
- Low-quality or blurry images.
- Handwritten invoices.
- Documents containing multiple dates and amounts.

These conditions can reduce OCR quality and make rule-based extraction less reliable.

The GET Electronics handwritten invoice was particularly difficult for the current OCR pipeline.

## 7. Why These Failures Occur

Bill Snap uses Tesseract.js for OCR and rule-based logic for classification and extraction.

The current approach has limitations:

1. OCR may misread characters in low-quality images.
2. Rule-based classification can struggle with non-bill photographs and documents.
3. Merchant extraction depends on recognizable business-name text.
4. Date extraction can select unrelated dates from the same invoice.
5. Amount extraction can select net amount instead of the final payable amount.
6. Category rules may not recognize unfamiliar merchant names.
7. Handwriting is difficult for the current OCR pipeline.

## 8. Limitations of the Evaluation

- The dataset contains only 20 images and is not statistically representative of all bill formats.
- Some ground-truth fields require further verification.
- B01's actual category is not verified.
- B02's date remains unverified.
- B14's handwritten date remains unverified.
- Some OCR scores were not captured.
- OCR recognition confidence is not the same as field extraction accuracy.
- The current classifier is rule-based, not a trained machine-learning model.

## 9. Potential Improvements

1. Improve non-bill rejection using stronger document-level classification signals.
2. Improve merchant extraction for unfamiliar receipt and invoice layouts.
3. Prioritize explicitly labelled invoice dates.
4. Improve payable-total selection when net amount, round-off and invoice total are present.
5. Improve category detection for groceries and electronics.
6. Explore a lightweight on-device model for bill/non-bill classification.
7. Expand the test dataset with more handwritten, blurry and angled bill images.

The main lesson from this evaluation is that OCR text recognition alone is not sufficient. Correct document classification, contextual field extraction and user review are all important.

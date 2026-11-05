# Bill Snap — Failure Analysis

## Confirmed from recorded tests

### 1. Non-bill classification
Four non-bill images (college timetable, road/motorcycle photo, menu display and selfie) entered the uncertain/manual-review flow. Only the clothing product tag was explicitly rejected. This indicates the classifier errs toward uncertainty rather than confidently rejecting weak or irrelevant OCR evidence.

### 2. Long receipt OCR
The New Asian Super Market and Tesco receipt screenshots show low OCR scores (roughly 32%–49% for the examples with visible scores) and extensive OCR corruption. Likely contributing factors visible in the images include narrow receipt text, small fonts, folds/wrinkles, perspective, and patterned backgrounds.

### 3. Printed tax invoice extraction
The Sakala Jewellery House invoice reached review with the date correctly extracted (`06-06-2026`) and category Shopping, but merchant and total were blank. This suggests that a document can be correctly recognized as invoice-like while the field-specific heuristics fail to identify important values.

### 4. Handwritten invoice
The GET Electronics handwritten invoice reached review with merchant/date/amount blank. Handwriting is outside the reliable capability of the current Tesseract + heuristic pipeline.

### 5. Multiple competing dates and amounts
The Nidhi Motors invoice has:
- Invoice date: `05-11-2026`
- Insurance expiry date: `26-07-2023`
- Next service due date: `13-02-2027`
- Net amount: `₹2,841.36`
- Round off: `-₹0.36`
- Invoice amount payable / total invoice amount: `₹2,841.00`

The app extracted `06-11-2026` and `₹2,841.36`. This demonstrates two concrete selection errors: the wrong date candidate and the net amount instead of the payable total.

## Limitations of this analysis
This is based on the uploaded bill images and app screenshots available in the conversation. No missing app results have been inferred. OCR recognition score is not treated as field accuracy. The report does not claim a statistically representative dataset or trained-ML performance.

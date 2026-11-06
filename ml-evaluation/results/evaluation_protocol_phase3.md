# Phase 3 Real-Receipt Evaluation Protocol

## Purpose and run scope

This protocol measures one recorded application build on fixed source images.
It evaluates classification, merchant, date, total, currency, confidence, and
uncertainty separately. It does not treat an unavailable output as an
extraction error, and it keeps predictions separate from verified ground
truth.

Use two cohorts and report them separately:

1. **Core cohort (20 images):** the 15 files in `test-images/bills/` and the
   5 files in `test-images/non-bills/`. Their classification labels come from
   the dataset folders. Verify each field ground truth from the source image.
2. **Supplemental cohort (B16–B29, 14 images):** these files are in the root
   of `test-images/`, outside the labeled folders. Do not infer their class or
   field ground truth from their filenames. Verify each image independently
   before including it in any accuracy denominator. Until then, report its
   predictions as exploratory only.

Keep all results in a new run file, for example
`evaluation_phase3.csv`. Do not edit `evaluation.csv` or
`evaluation_phase2_1.csv`; use the Phase 2.1 CSV header as a schema reference
only. Keep the run-specific results and evidence separate from historical
reports.

## Run metadata

Record before starting:

- Source revision and whether the source working tree has changes.
- Run date and time.
- Browser/version, device/OS, and app URL or local build.
- Build command and build outcome.
- Dataset cohort and ordered image list.
- Evidence folder or screenshot naming convention.

For a reproducible local run, use the same source revision, lockfile, and
browser for all images. Do not change application code during the run. Do not
save test bills; saving is not part of this evaluation.

## Ground-truth preparation

1. Review each source image before viewing its app prediction.
2. Enter ground truth only when the image supports a clear value. Use the
   source's displayed invoice/receipt date and final payable amount, not an
   unrelated service, delivery, expiry, subtotal, or tax value.
3. Use the app's category vocabulary: Food, Groceries, Utilities, Transport,
   Shopping, Healthcare, Entertainment, or Other. Mark category ground truth
   `not_verifiable` when the purchase or category cannot be determined from
   the image; do not infer it from merchant name alone.
4. Record currency as an ISO code only when the source provides reliable
   currency evidence. Keep unverified values empty. Never copy a prior
   `historical_candidate_*` value into a verified `gt_*` field without checking
   the image.
5. Mark field verification as `verified`, `unverified`, or `not_applicable`.
   A blank verification cell is pending, not verified.

## Per-image app procedure

Process images in ascending ID order, using the exact original file. Do not
crop, rotate, resize, or otherwise alter the source image.

1. Start from the same app state for each image. Upload one image.
2. Before typing, correcting, or saving anything, record the initial
   classification:
   - `Bill` when the app opens the review flow as a bill.
   - `Non-bill` only when the app explicitly rejects it as not a bill.
   - `Uncertain` when the app routes it to manual review because it cannot
     confidently classify the document.
   - `output_unavailable` if no result can be observed (for example, the app
     fails or the result screen cannot be captured).
3. Capture the initial screen. Record the displayed merchant, date, numeric
   total, category, OCR recognition score, and the visible confidence label
   for each extraction field. Empty visible fields are `genuinely_blank`;
   inaccessible fields or absent results are `output_unavailable`.
4. Expand OCR diagnostics when available. Record the primary OCR pass and
   primary OCR text evidence. Alternate passes may be captured for diagnosis,
   but must not be used as predictions or to replace primary-pass output.
5. Record whether manual correction was needed and which fields were
   corrected. Keep corrected values separate from initial predictions and
   capture the initial screen before making corrections. Do not save the test
   bill.
6. Link the screenshot and diagnostic evidence to the test ID. Use filenames
   such as `B01-initial.png` and `B01-diagnostics.png`.

### Currency and current UI limitation

The Phase 3 extractor result includes currency metadata, but the current
review UI does not display a currency prediction or its confidence. The
amount label displays a fixed `₹`; that label is not an extracted currency
prediction. For an app-UI-only run, leave `app_currency` empty, mark its
evidence `output_unavailable`, and do not count it as correct or incorrect.
Do not derive the app prediction from the receipt, the fixed label, or a
manually corrected value. Currency accuracy is not measurable through the
current UI until the currency result is exposed by an approved evaluation
surface.

Similarly, field-confidence labels are shown for merchant, date, total, and
category on review results. The numeric OCR recognition score is a separate
measure, not a field-confidence score. Classification has Bill/Non-bill/
Uncertain outcomes rather than a displayed numeric confidence.

## Recording and status rules

Use the Phase 2.1 CSV status vocabulary in the new run file:

- Evidence availability: `captured`, `genuinely_blank`,
  `output_unavailable`, `not_applicable`.
- Correctness: `correct`, `incorrect`, `not_verifiable`, `not_applicable`.
- Classification: `Bill`, `Non-bill`, `Uncertain`, or empty when unavailable.
- Field confidence: record the visible `high`, `medium`, or `low` label;
  leave empty when not shown.

Do not treat `Uncertain`, a genuinely blank field, or unavailable output as
equivalent:

- `Uncertain` is a captured classification outcome, not a correct
  classification.
- A visible blank field is a captured blank. If its verified ground truth is
  applicable, count it as incorrect for field accuracy.
- `output_unavailable` is missing evidence, not a failed extraction.
- For an actual non-bill, merchant/date/total/currency/category are
  `not_applicable` unless the experiment explicitly evaluates incidental
  extraction on non-bills.
- If an image is a verified bill but classification uncertainty prevents the
  review fields from being shown, mark those field outputs
  `output_unavailable`, not `genuinely_blank`.

## Metrics

Report the core and supplemental cohorts separately. Always give numerator
and denominator; omit a rate when its denominator is zero.

### Classification

Create a confusion table with verified ground-truth rows (`Bill`, `Non-bill`)
and app outcome columns (`Bill`, `Non-bill`, `Uncertain`, `output_unavailable`).
Strict classification accuracy counts every captured outcome, including
`Uncertain`, in its denominator. `Uncertain` is an incorrect captured
outcome, not an excluded or unavailable result. The numerator includes only
correct `Bill` and `Non-bill` outcomes:

`correct captured classifications / all captured classifications (including Uncertain)`

Report unavailable classification outputs separately from captured outcomes.

### Field accuracy

For merchant, date, total, currency, and category, report correct, incorrect,
not-verifiable, genuinely-blank, and output-unavailable counts separately.
The correctness denominator includes only applicable fields with verified
ground truth and captured app output:

`field accuracy = correct / (correct + incorrect)`

`genuinely_blank` is a subset of `incorrect` when the ground truth is verified
and applicable. Count it for reporting, but do not add it again to the
denominator. Exclude `not_verifiable`, `not_applicable`, and
`output_unavailable` from the denominator. Do not calculate currency accuracy
from the current UI-only run while currency is unavailable.

Use consistent comparisons:

- Merchant: case-insensitive and whitespace-normalized exact text; do not use
  fuzzy matching.
- Date: compare calendar dates after normalizing supported display formats.
- Total: compare numeric values to the verified final payable amount with a
  maximum difference of 0.01 only when both prediction and ground truth have
  verified compatible currency. If either currency is unknown or they
  mismatch, mark the amount comparison `not_verifiable`.
- Currency: exact ISO currency code.
- Category: exact app category label after independently verifying the
  expected category.

### Confidence and uncertainty

For each visible field-confidence level (`high`, `medium`, `low`), report the
number of correct and incorrect captured predictions. This is descriptive
confidence-stratified accuracy, not a calibrated probability. Also report:

- Count and rate of `Uncertain` classifications.
- Per-field output-unavailable and genuinely-blank counts.
- Manual-correction-required count and corrected-field counts.
- OCR recognition scores captured, summarized separately from field accuracy.
- Currency confidence as unavailable for the UI-only run.

## Interpretation and limitations

The 20-image core set is small and should not be treated as representative of
all receipt layouts. The B16–B29 images are an additional cohort whose
ground-truth class and fields require independent verification. Missing
screenshots or inaccessible output reduce evidence coverage; they do not
establish extraction failures. Do not claim improvement over earlier reports
unless the same images, app revision, protocol, device/browser conditions,
and denominator rules were used.

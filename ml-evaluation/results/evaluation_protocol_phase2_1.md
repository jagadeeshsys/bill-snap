# Phase 2.1 Real-Image Evaluation Protocol

Use `evaluation_phase2_1.csv` for a fresh run of the 15 bill and 5 non-bill images. The original `evaluation.csv`, report, and failure analysis are historical records and must remain unchanged.

## Before the run

1. Record the evaluated commit or source snapshot, whether the working tree is modified, date, browser, device, and app build.
2. Independently verify ground-truth fields from each source image before looking at app predictions. Enter verified values only in `gt_*`; mark unknown or unverified values accordingly. Prior `actual_*` values are copied only into `historical_candidate_*` and are not verified ground truth.
3. Use exactly the image filename assigned to each ID. Do not edit, crop, rotate, or otherwise alter the source images.

## Per-image procedure

1. Load the app build recorded above and select one source image from `test-images/bills/` or `test-images/non-bills/`.
2. Before editing or saving, record the displayed classification as `Bill`, `Non-bill`, or `Uncertain`.
3. For a review result, record each initially suggested merchant, date, numeric total, currency only if explicitly emitted, and category. Record OCR confidence and the primary pass (`processed-full`). Alternate OCR diagnostics are supplementary evidence, not primary extracted values.
4. Capture the initial result screen and, when available, the expanded OCR diagnostic output. Name or otherwise link evidence with the test ID and store its location in `evidence_reference`.
5. Mark each prediction’s evidence as `captured`, `genuinely_blank`, `output_unavailable`, or `not_applicable`. Use `genuinely_blank` only when the app output was actually visible and the field was empty. A missing screenshot or inaccessible result is `output_unavailable`, never an extraction failure.
6. Compare predictions only against verified ground truth. Use `correct`, `incorrect`, `not_verifiable`, or `not_applicable` for each correctness field. Never count `Uncertain` as a correct classification.
7. Record whether manual correction was required and which fields were corrected. Preserve the initial predictions; corrections are separate observations. Do not save the test bill unless persistence is explicitly part of a separate experiment.

## Status and blank-value rules

- `ground_truth_type_verification`: `verified` means the image is in the corresponding assignment dataset folder.
- Ground-truth field verification columns use `verified`, `unverified`, or `not_applicable`. Keep unverified values out of `gt_*`; retain any prior candidate only in `historical_candidate_*`.
- In the prepared CSV, the `gt_*_verification` cells are blank and the `gt_*` values are empty because no fields have yet been re-verified for this run. Treat those verification cells as pending/unverified, never as verified.
- Prediction evidence columns and `evidence_availability` use only `captured`, `genuinely_blank`, `output_unavailable`, or `not_applicable`.
- Correctness columns use only `correct`, `incorrect`, `not_verifiable`, or `not_applicable`.
- Leave a prediction value empty when it is unavailable or genuinely blank; its evidence status conveys which meaning applies. Never enter a guessed app value.
- The app does not currently emit currency as an extracted field. Record `app_currency` as empty with `output_unavailable`; do not infer currency from the source image or fixed UI label.
- If a definite rejection does not expose OCR diagnostics, record OCR confidence and primary pass as empty and diagnostic evidence as `output_unavailable`.

## Evidence handling

Keep the original image, initial app output capture, and any diagnostic capture associated by test ID. Do not use manual corrections, ground-truth inspection notes, or historical app output as a substitute for the current build’s initial prediction.

# Bill Snap — Release Evaluation

## Fixed submission cohort

Evaluate exactly 20 tracked images:

- Bills: `test-images/bills/B1.JPG` through `B15.jpg` (15 images)
- Non-bills: `test-images/non-bills/NB1.JPG` through `NB5.jpg` (5 images)

The untracked `B16`–`B29` files are supplemental and are not part of the
submission score.

## How to record a release run

1. Build the production app with `npm run build` and record the Git commit.
2. For each fixed image, use the production app's gallery flow once. Do not
   edit the initial prediction before recording it.
3. Verify merchant, date, total, currency, and category from the source image.
   Mark a field `unverifiable` rather than guessing.
4. Record the initial class and fields in `evaluation_release_template.csv`.
   Record a correction separately; a correction is not an OCR success.
5. Count an uncertain result as a failed classification for the bill/not-bill
   metric. The app intentionally blocks saving uncertain images.

## Reporting rules

Report only rates calculated from rows with verified ground truth and a
recorded initial prediction. Distinguish `blank`, `unavailable`, `uncertain`,
and `incorrect`; they are not interchangeable.

`evaluation.csv`, `evaluation_phase2_1.csv`, and the older failure analysis
are historical investigation notes. They must not be presented as results from
this release.

## Expected release limitations

The app uses local Tesseract OCR and transparent rules rather than a trained
vision classifier. Crumpled, angled, blurry, tiny-text, and handwritten bills
may be blocked as uncertain or require field correction. Non-document photos
with little or no text are conservatively blocked rather than converted into
editable expenses.

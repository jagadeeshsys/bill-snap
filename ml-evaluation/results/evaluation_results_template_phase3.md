# Phase 3 Real-Receipt Evaluation Results

Use this summary with a new run CSV (for example `evaluation_phase3.csv`) and
the procedure in [evaluation_protocol_phase3.md](./evaluation_protocol_phase3.md).
Do not overwrite Phase 2.1 or historical evaluation records.

## Run metadata

| Item | Recorded value |
|---|---|
| Source revision | |
| Working tree changes (including untracked files) | |
| Run date/time | |
| Browser/version | |
| Device/OS | |
| App URL or local build | |
| Build command/result | |
| Core cohort | 15 bills, 5 non-bills |
| Supplemental cohort | B16–B29; verify ground truth before scoring |
| Run CSV | |
| Evidence location | |

## Dataset verification

| Cohort | Images | Ground-truth class verified | Merchant/date/total/currency/category verified |
|---|---:|---:|---:|
| Core | 20 | | |
| Supplemental | 14 | | |

## Classification

Report the cohorts separately. Strict classification accuracy includes all
captured Bill, Non-bill, and Uncertain outcomes in its denominator.
`Uncertain` is an incorrect captured outcome, not an excluded result.

| Ground truth | Bill | Non-bill | Uncertain | Output unavailable | Total |
|---|---:|---:|---:|---:|---:|
| Bill | | | | | |
| Non-bill | | | | | |

| Metric | Numerator / denominator | Result |
|---|---:|---:|
| Strict classification accuracy | correct / captured | |
| Uncertain rate | uncertain / captured | |
| Classification output unavailable | unavailable / total images | |

## Field-level results

Only verified, applicable ground truth can enter a field correctness
denominator. Keep missing evidence separate from incorrect predictions.
`Genuinely blank` is a subset of `Incorrect` when ground truth is verified and
applicable; report it as a breakdown, but do not add it again to the accuracy
denominator.

| Field | Correct | Incorrect | Not verifiable | Not applicable | Output unavailable | Genuinely blank | Accuracy denominator | Accuracy |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Merchant | | | | | | | | |
| Date | | | | | | | | |
| Total | | | | | | | | |
| Currency | | | | | | | | |
| Category | | | | | | | | |

For Total, compare amounts only when the predicted and verified ground-truth
currencies are known and compatible. If either currency is unknown or they
mismatch, mark the amount comparison `not_verifiable`.

## Confidence and uncertainty

| Field | Confidence | Correct | Incorrect | Captured count |
|---|---|---:|---:|---:|
| Merchant | High | | | |
| Merchant | Medium | | | |
| Merchant | Low | | | |
| Date | High | | | |
| Date | Medium | | | |
| Date | Low | | | |
| Total | High | | | |
| Total | Medium | | | |
| Total | Low | | | |
| Category | High | | | |
| Category | Medium | | | |
| Category | Low | | | |
| Currency | Not exposed by UI | | | |

| Measure | Count / notes |
|---|---|
| OCR recognition score captured / unavailable | |
| Uncertain classifications | |
| Manual correction required | |
| Merchant corrected | |
| Date corrected | |
| Total corrected | |
| Currency corrected | |
| Category corrected | |
| Primary OCR pass distribution | |
| Diagnostic evidence unavailable | |
| App currency output unavailable | |
| Evidence references missing | |

## Error analysis

| Test ID | Field | Initial prediction | Verified ground truth | Confidence/status | Error or limitation | Evidence reference |
|---|---|---|---|---|---|---|
| | | | | | | |

## Interpretation

State the numerator and denominator for every accuracy or rate. Discuss the
core and supplemental cohorts separately. Do not count manual corrections as
initial prediction successes. Do not report currency accuracy for a UI-only
run where the currency output is unavailable. Distinguish application errors
from unverified ground truth, uncertainty, missing output, and missing
evidence. Do not claim improvement over a historical run without comparable
images, app revision, device/browser conditions, and protocol.

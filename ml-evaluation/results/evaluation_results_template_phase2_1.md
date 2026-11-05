# Phase 2.1 Evaluation Results Template

Do not fill metrics until the 20-image run is complete and ground truth and app evidence have been reviewed. Do not treat unavailable output as incorrect or `Uncertain` as correct.

## Run metadata

| Item | Recorded value |
|---|---|
| Source revision / snapshot | |
| Working tree modified? | |
| Run date | |
| Browser and version | |
| Device / OS | |
| Dataset | 15 bills, 5 non-bills |
| Results CSV | `evaluation_phase2_1.csv` |

## Classification

Report a 3-way confusion table. The denominator for strict accuracy is the number of images with captured app classification (maximum 20). Uncertain predictions remain a separate outcome and are not counted as correct.

| Ground truth | App Bill | App Non-bill | App Uncertain | Captured denominator |
|---|---:|---:|---:|---:|
| Bill (15) | | | | |
| Non-bill (5) | | | | |

| Metric | Numerator / denominator | Result |
|---|---:|---:|
| Strict classification correct | correct / captured classifications | |
| Uncertain predictions | uncertain / captured classifications | |
| Classification output unavailable | unavailable / 20 | |

## Field results

For each field, count only rows with captured output and verified applicable ground truth in the correctness denominator. Report unavailable, genuinely blank, and not-verifiable separately.

| Field | Correct | Incorrect | Not verifiable | Output unavailable | Genuinely blank | Denominator for correctness |
|---|---:|---:|---:|---:|---:|---:|
| Merchant | | | | | | |
| Date | | | | | | |
| Total | | | | | | |
| Currency | | | | | | |
| Category | | | | | | |

## Manual review and OCR diagnostics

| Measure | Count / notes |
|---|---|
| Manual correction required | |
| Merchant corrected | |
| Date corrected | |
| Total corrected | |
| Currency corrected | |
| Category corrected | |
| Primary OCR pass distribution | |
| OCR confidence captured / unavailable | |
| Diagnostic evidence unavailable | |
| Evidence references missing | |

## Interpretation

Document observed errors and representative cases with test IDs and evidence references. State denominators for every reported rate. Distinguish extraction errors from missing evidence and unverified ground truth. Do not claim improvement over another build unless the same images, protocol, device conditions, and evidence standards were used for both runs.

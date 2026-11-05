# Bill Snap — Evaluation Report

## Dataset
- 15 bill images: `B1.JPG`–`B11.JPG`, `B12.jpg`–`B15.jpg`
- 5 non-bill examples recorded in the conversation
- Evaluation approach: run each image through the local app at `http://localhost:5173`, compare the app output with the source image, and record uncertain/missing fields rather than guessing.

## Evidence limitations
This report is a reconstruction from the uploaded image ZIP and screenshots retained in the conversation. It is **not** a complete run log for all 20 tests. The app-output evidence is available for B09–B12, B14–B15 and N01–N05; the remaining bill app outputs are marked `Not recorded` in `evaluation.csv`.
Some ground-truth fields are also not confidently readable from the current evidence and are left blank or explicitly flagged for verification.

## Observed non-bill results
| Test | Non-bill image | App outcome | OCR score |
|---|---|---|---:|
| N01 | College timetable screenshot | Uncertain / manual review | 76% |
| N02 | Road and motorcycle photograph | Uncertain / manual review | 42% |
| N03 | Restaurant/menu display | Uncertain / manual review | 32% |
| N04 | Personal selfie | Uncertain / manual review | 31% |
| N05 | Clothing product tag | Rejected as not a bill | Not shown |

Observed result: 1 of 5 non-bills was explicitly rejected; 4 of 5 were routed to manual review. This is a descriptive result for the five recorded examples, not a claim about general-world performance.

## Observed bill outcomes
- B12 (Sakala Jewellery House): date extracted correctly as `06-06-2026`; merchant and total were blank; category suggested as Shopping; OCR score shown as 51%.
- B14 (GET Electronics): merchant, date and total were blank; category was Other; OCR score shown as 47%. The source is handwritten, so this is a difficult extraction case.
- B15 (Nidhi Motors): merchant was correct; date was extracted as `06-11-2026` while the invoice date is `05-11-2026`; app selected `₹2,841.36` (Net Amount) rather than the invoice payable/total invoice amount `₹2,841.00`; category was Transport; OCR score shown as 61%.
- B09, B10 and B11 were shown in the uncertain/manual-review flow with blank extracted fields in the available screenshots.

## Metrics
A complete 20-image accuracy score is **not reported**, because app outputs for B01–B08 and B13 are not available in the retained evidence, and some ground-truth fields need verification. OCR recognition scores are not field-accuracy scores and are not used as a substitute for accuracy.

## Key failure analysis
1. **Non-bill false uncertainty:** timetable, scenic photograph, menu and selfie examples were not rejected; they entered manual review. The classifier is conservative and can mistake OCR text/noise for possible bill evidence.
2. **Low OCR quality on long receipts:** the photographed New Asian Super Market and Tesco receipts had OCR scores around 32–49% in the screenshots. Long, narrow receipts, wrinkles, small print, perspective and background clutter reduce text quality.
3. **Merchant/date/amount extraction can all be missing:** the Sakala Jewellery and GET Electronics examples reached review with blank merchant and amount fields. Handwriting and invoice layouts are especially challenging for generic OCR/rules.
4. **Wrong date candidate:** the Nidhi Motors invoice contains multiple dates (invoice date, insurance expiry, next service due date). The app selected `06-11-2026` instead of the invoice date `05-11-2026`.
5. **Wrong amount candidate:** the Nidhi Motors invoice contains Net Amount `₹2,841.36`, Round Off `-₹0.36`, Invoice Amount Payable `₹2,841.00`, and Total Invoice Amount `₹2,841.00`. The app selected the net amount instead of the payable total.
6. **Confidence interpretation:** the displayed OCR score measures OCR recognition, not the correctness of merchant/date/amount fields. Field confidence is heuristic and should not be presented as a calibrated probability.

## Recommended next actions
- Re-run B01–B08 and B13 and save screenshots of each review result.
- Verify B02, B04 and B08 ground-truth totals, B01/B02 dates, and B14's handwritten date.
- Keep the Nidhi Motors payable-total regression test and add explicit invoice-date selection tests where service/insurance dates are present.
- Report the app as a local, browser-based OCR and heuristic extraction prototype with human review, not as a trained ML model.

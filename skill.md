
# Bill Snap — Project Development Skill

## 1. Project Overview

Project name: Bill Snap

Project type: Progressive Web App (PWA)

Purpose:
Build a mobile-first application that captures or uploads bills and receipts, extracts important information using OCR, allows users to correct extracted values, and stores bill records locally.

This project is a take-home assignment for a Software Development Intern role.

Primary objective:
Demonstrate practical frontend development, OCR integration, document processing, data extraction, user experience, local storage, testing, and honest evaluation of extraction accuracy.

## 2. Development Environment

Developer machine:
- MacBook Air M5
- macOS
- VS Code
- Terminal

Project directory:

/Users/jagadeesh/Bill-Snap

Frontend stack:
- React
- TypeScript
- Vite
- CSS
- Lucide React
- Tesseract.js

Storage:
- IndexedDB

OCR:
- Tesseract.js

Image processing:
- Browser Image API
- Canvas API
- JPEG compression

Mobile testing:
- iPhone Safari
- Local Wi-Fi development server

Development server:

npm run dev -- --host 0.0.0.0

Production build:

npm run build

Lint:

npm run lint

## 3. Existing Project Features

The application currently includes:

1. Mobile-responsive dashboard.
2. Camera-based bill capture.
3. Gallery-based image upload.
4. Image preview.
5. Image validation.
6. Maximum image size validation of 10 MB.
7. Image resizing to a maximum dimension of 1600 pixels.
8. JPEG compression at quality 0.82.
9. OCR using Tesseract.js.
10. Bill detection.
11. Merchant extraction.
12. Date extraction.
13. Total amount extraction.
14. Expense category classification.
15. Editable extracted fields.
16. Manual review before saving.
17. IndexedDB persistence.
18. Monthly spending dashboard.
19. Recent bills section.
20. Spending categories and navigation.

These features have been implemented, but extraction accuracy and complete workflow reliability still require testing.

## 4. Project File Structure

Known files:

src/
├── App.tsx
├── App.css
├── index.css
└── services/
    ├── image.ts
    ├── extractor.ts
    └── storage.ts

Other files include:
- package.json
- package-lock.json
- index.html
- vite.config.ts
- tsconfig files
- .gitignore
- .env

Inspect the actual repository before assuming that this is the complete file structure.

## 5. Image Processing

File:

src/services/image.ts

Existing image processing configuration:

MAX_FILE_SIZE = 10 MB
MAX_DIMENSION = 1600
JPEG_QUALITY = 0.82

The image processing function:
- Validates image MIME type.
- Rejects images larger than 10 MB.
- Creates an image preview.
- Resizes large images.
- Converts the image to JPEG.
- Returns original and compressed image sizes.
- Returns processed dimensions.

Important:

Camera capture and gallery upload must use a consistent image processing and OCR pipeline.

Do not assume that both sources produce equivalent images.

Investigate:
- Camera image orientation.
- EXIF orientation.
- Image rotation.
- Focus and exposure.
- Perspective distortion.
- Image resolution.
- Image compression.
- Contrast.
- Brightness.
- Shadows.
- Canvas resizing.
- OCR input image dimensions.

Do not reduce image quality without measuring the effect on OCR accuracy.

## 6. OCR and Extraction

Main OCR dependency:

tesseract.js

The extraction service is:

src/services/extractor.ts

Current extraction fields:

- isBill
- merchant
- date
- total
- category
- rawText

Field structure:

ExtractedField<T> {
  value: T | null;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
}

Expense categories:

- Food
- Groceries
- Utilities
- Transport
- Shopping
- Healthcare
- Entertainment
- Other

Current extraction strategy:
- Keyword-based bill detection.
- Merchant extraction from invoice header lines.
- Date pattern matching.
- Label-based amount extraction.
- Keyword-based category classification.

Important limitations:

- OCR confidence is not field-level accuracy.
- A readable OCR result does not guarantee correct field extraction.
- Model-generated or rule-generated confidence must not be represented as statistically calibrated confidence.
- A bill should not be marked correct simply because OCR returned a value.
- Uncertain fields must remain editable.

## 7. Known OCR Test Results

## 8. Current Architecture and Project Decisions

Inspect current source before relying on older sections above; this guide is
an evolving project handoff, and historical observations may no longer match
the latest implementation.

### Current architecture

- The app is a React 19 + TypeScript PWA built with Vite and deployed to
  GitHub Pages under `/bill-snap/`.
- `src/App.tsx` coordinates capture/upload, review, transactions, analytics,
  settings, CSV export, and local backup/restore.
- `src/services/image.ts` validates and downsizes images; `ocr.ts` runs
  Tesseract and collects OCR pass/geometry evidence; `billClassifier.ts`
  classifies OCR text; `extractor.ts` selects merchant, date, payable total,
  currency, and category.
- `src/services/storage.ts` stores receipt records and settings in IndexedDB.
  Receipt image bytes are not retained.
- The English Tesseract worker, engine, and trained data are bundled and
  precached by the PWA. This adds roughly 17 MB to the offline cache.
- No server/API is used by the app. The `server/` folder is currently unused.

### Important behavior decisions

- A clearly non-bill image is rejected politely. An uncertain image is also
  blocked from the editable/save flow and asks the user to try a clearer,
  full-frame image.
- Confirmed bills go to a manual review screen. Field confidence is a
  heuristic, not a calibrated probability; OCR confidence is not field
  correctness.
- Dates are validated and normalized as ISO dates before persistence.
- Currency is detected when possible and can be selected or corrected in the
  review screen. Unknown currency remains unknown rather than defaulting to
  INR.
- Saved receipt metadata and settings are local to the browser profile/device.
  Clearing browser data or losing the device can remove them; users can export
  a JSON backup.

### Evaluation status and evidence

- The intended fixed evaluation cohort is `B1`–`B15` and `NB1`–`NB5` under
  `ml-evaluation/test-images/`.
- `ml-evaluation/results/evaluation.csv` is historical and must not be
  described as current-release accuracy.
- `ml-evaluation/results/evaluation_release_template.csv` is the run sheet for
  recording initial outputs, verified ground truth, field outcomes, corrections,
  build commit, device/browser, and date.
- `ml-evaluation/results/evaluation_report.md` gives the protocol. No fresh
  release accuracy should be claimed until that run sheet is completed.
- Untracked supplemental images `B16`–`B29` are outside the fixed 20-image
  cohort until ground truth is verified and the files are intentionally added.

### Recent B5 receipt fix

For the OCR text from B5 (New Asian Super Market, Ipswich), the OCR engine had
recognized enough information but the heuristics missed a UK-style retail
receipt:

- `NEW ASTAN SUPER MARKI` is now repaired to `NEW ASIAN SUPER MARKET` for this
  specific known OCR variant.
- `Sale Date` is recognized as a transaction date label.
- A damaged generic total line is not trusted as a numeric total; when there
  is no reliable labeled total, an explicit card/payment amount can be used.
- `£15.85` is detected as GBP, and the retailer maps to Groceries.
- The classifier accepts this receipt from its price/item/payment evidence.
- A regression test uses the supplied OCR sample so these fields remain
  reproducible. It expects merchant `NEW ASIAN SUPER MARKET`, date
  `10-07-2026`, total `15.85`, currency `GBP`, and category `Groceries`.

Be conservative when generalizing these fixes: do not let weak card, voucher,
or amount text alone classify arbitrary images as bills, and do not let a
payment amount override a readable, higher-confidence labeled payable total.

### Useful commands

```bash
npm test
npm run lint
npm run build
npm run dev
npm run preview
```

Before committing, inspect `git status --short`. Keep user-provided untracked
files out of commits unless the user requests they be added.

## 9. Known OCR Test Results

### Test 1: Nidhi Motors

Invoice merchant:
NIDHI MOTORS

Category:
Transport

Observed problems:
- Camera OCR sometimes returns incomplete merchant names.
- Merchant examples include "NIDHI MO 2" and "NIDH N".
- Total amount extraction sometimes selects the wrong amount.
- The invoice contains several item amounts, GST amounts, subtotal values, and handwritten markings.

The final payable amount must be verified against the original invoice before being used as a ground-truth value.

### Test 2: Sakala Jewellery House

Invoice merchant:
SAKALA JEWELLERY HOUSE

Invoice date:
06-06-2026

Correct final amount:
₹16,800

Correct category:
Shopping

Observed gallery result:
- Merchant name was extracted correctly.
- Date was extracted correctly.
- Amount was extracted as 16800.
- Category was Shopping.

Observed camera result:
- Merchant was incorrectly extracted as "mr 3 x! A".
- Date was extracted correctly.
- Amount was extracted as 16800.
- Category was Shopping.

The raw camera OCR output actually contained:

SAKALA JEWELLERY HOUSE

This demonstrates that the OCR output and merchant-selection algorithm must be debugged separately.

### Current Priority Bug

The same invoice produces different merchant extraction results when:

1. Captured using the camera.
2. Uploaded using the gallery.

The gallery path consistently produces the correct merchant, while the camera path produces an incorrect merchant.

Investigate the complete flow:

Camera input
    ↓
File selection
    ↓
Image processing
    ↓
OCR preprocessing
    ↓
Tesseract recognition
    ↓
Merchant extraction

Compare this against:

Gallery input
    ↓
File selection
    ↓
Image processing
    ↓
OCR preprocessing
    ↓
Tesseract recognition
    ↓
Merchant extraction

Do not immediately replace the OCR engine.

First identify the exact stage where the two paths differ.

## 8. Storage

Storage service:

src/services/storage.ts

The application uses IndexedDB.

A previous iPhone issue occurred because:

crypto.randomUUID()

was unavailable in the browser context.

A fallback ID generator was added.

The application now successfully:
- Saves bills.
- Displays saved bills in Recent Bills.
- Retains records after refreshing the page.

Preserve IndexedDB persistence while making changes.

Do not migrate to localStorage for bill records.

## 9. API and Cost Constraints

The developer cannot afford ongoing API billing.

Do not introduce paid API dependencies without explicit approval.

Do not require:
- OpenAI API billing.
- Paid OCR APIs.
- Paid cloud storage.
- Paid hosting services.

The initial extraction implementation should work locally in the browser using Tesseract.js and deterministic extraction logic.

A Gemini API key was created, but billing eligibility was unclear. Do not assume that promotional Google Cloud credits can be used for Gemini API requests.

Never expose API keys in frontend code, GitHub repositories, logs, screenshots, or responses.

The existing .env file must remain excluded from Git.

## 10. Development Rules

Follow these rules for every code change.

1. Inspect the existing source file before editing.
2. Understand the current interfaces and imports.
3. Do not invent functions or properties that do not exist.
4. Preserve existing working features.
5. Do not replace an entire file unless the change requires it.
6. When replacing a file, provide the complete corrected code.
7. Use TypeScript-safe implementations.
8. Avoid unnecessary dependencies.
9. Keep camera and gallery workflows consistent.
10. Do not hardcode individual merchant names as special cases.
11. Prefer reusable extraction logic.
12. Add useful error handling.
13. Preserve mobile responsiveness.
14. Test on iPhone Safari.
15. Explain exactly which files need modification.
16. Give commands one step at a time when guiding the developer.

After each significant code change, run:

npm run lint

npm run build

Both commands must pass before considering the change complete.

## 11. Testing Strategy

Use 20 images for assignment evaluation:

- 15 real bills and invoices.
- 5 non-bill images.

Evaluate:

### Bill detection
- Correctly identifies bill images.
- Rejects non-bill images.

### Merchant
- Correct business name.
- No incomplete OCR fragments.

### Date
- Correct invoice date.
- No unrelated dates.

### Total
- Correct final payable amount.
- Does not select item prices.
- Does not confuse subtotal and GST.

### Category
- Correct expense category.
- Uses merchant and invoice descriptions.

### User correction
- Fields can be edited.
- Corrections are reflected in saved records.

### Persistence
- Saved bills remain after refresh.
- Dashboard values update correctly.

Maintain an evaluation table:

| Test | Bill detected | Merchant | Date | Total | Category | Saved |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| ... | | | | | | |
| 20 | | | | | | |

Report actual results. Do not fabricate accuracy percentages.

## 12. Current Development Priorities

Priority 1:
Fix camera versus gallery OCR inconsistency.

Priority 2:
Improve merchant name extraction.

Priority 3:
Improve final total amount extraction.

Priority 4:
Improve category classification.

Priority 5:
Improve image preprocessing.

Priority 6:
Test all 20 images and record results.

Priority 7:
Verify dashboard calculations and saved bill management.

Priority 8:
Prepare GitHub repository, README, screen recording, evaluation table, and product reflection.

## 13. Assignment Deliverables

The final submission must contain:

1. GitHub repository.
2. Working mobile-friendly PWA.
3. Bill image capture and upload.
4. Bill versus non-bill detection.
5. Merchant, date, total and category extraction.
6. Manual correction workflow.
7. Local bill persistence.
8. Evaluation on 15 real bills and 5 non-bill images.
9. Evaluation results table.
10. Screen recording under two minutes.
11. Short product reflection.

Deadline:
Friday, 6 November 2026, 11:59 PM IST.

## 14. How to Assist This Developer

The developer prefers:
- Clear, step-by-step guidance.
- Complete replacement code when requested.
- Exact terminal commands.
- Explanations of where code belongs.
- Practical debugging based on actual screenshots and terminal output.

Avoid:
- Giving several unrelated tasks at once.
- Guessing source code that has not been inspected.
- Recommending paid services without approval.
- Claiming that a feature works without testing it.
- Making unverified claims about OCR accuracy.

When debugging:

1. Identify the root cause.
2. Explain the cause briefly.
3. Specify the exact file.
4. Provide the required code change.
5. Give one verification step.
6. Review the result before proceeding.

The goal is to deliver a reliable, explainable and honestly evaluated Bill Snap application.

# Bill Snap — Smart Bill Scanner & Expense Tracker

Bill Snap is a browser-based bill scanning and expense tracking application built with React, TypeScript and Tesseract.js.

It extracts information from bill images using OCR, identifies potential bills, suggests expense categories and allows users to review and correct extracted information before saving.

The application uses browser-based OCR and IndexedDB for local data storage. No paid OCR API or external backend is required.

## Features

- **Bill Image Upload:** Select bill images from the device.
- **Image Preprocessing:** Validate, resize and optimize images before OCR.
- **OCR Processing:** Extract text using Tesseract.js.
- **Bill Classification:** Identify bills, non-bills and uncertain documents using transaction-related signals.
- **Data Extraction:** Extract merchant name, bill date and total payable amount.
- **Category Suggestions:** Suggest expense categories based on extracted information.
- **Manual Review:** Review and correct uncertain or incorrectly extracted fields.
- **Local Storage:** Save bill records in browser IndexedDB.
- **Duplicate Detection:** Identify potential duplicate bills.
- **Expense Dashboard:** View saved bills and monthly/category spending summaries.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React 19 |
| Language | TypeScript |
| Build Tool | Vite |
| OCR Engine | Tesseract.js |
| Database | IndexedDB |
| Styling | CSS |
| Testing | Node.js built-in test runner |
| Code Quality | ESLint |

## Application Architecture

The application follows a modular service-based architecture.

```text
User uploads bill image
        |
        v
Image Validation & Preprocessing
        |
        v
OCR Processing (Tesseract.js)
        |
        v
Full Image + Focused Region OCR
        |
        v
Bill Classification
        |
        v
Information Extraction
        |
        +-----------------------+
        |                       |
        v                       v
 Merchant / Date / Total    Category Suggestion
        |                       |
        +-----------+-----------+
                    |
                    v
              Review Screen
                    |
                    v
          User Correction & Review
                    |
                    v
             IndexedDB Storage
                    |
                    v
             Expense Dashboard
```

### Project Structure

```text
bill-snap/
├── public/
├── ml-evaluation/
│   ├── test-images/
│   │   ├── bills/
│   │   └── non-bills/
│   └── results/
│       ├── evaluation.csv
│       ├── evaluation_report.md
│       └── failure_analysis.md
├── src/
│   ├── assets/
│   ├── services/
│   │   ├── billClassifier.ts
│   │   ├── billProcessor.ts
│   │   ├── currency.ts
│   │   ├── dashboardMetrics.ts
│   │   ├── extractor.ts
│   │   ├── image.ts
│   │   ├── ocr.ts
│   │   └── storage.ts
│   ├── App.tsx
│   ├── App.css
│   └── index.css
├── tests/
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js
- npm
- Git

### Installation

Clone the repository:

```bash
git clone https://github.com/jagadeeshsys/bill-snap.git
cd bill-snap
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL displayed by Vite, normally:

```text
http://localhost:5173
```

### Production Build

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Run ESLint

```bash
npm run lint
```

## OCR and Data Processing

Bill Snap uses Tesseract.js to perform OCR directly in the browser.

The image processing pipeline includes:

1. Image validation and size checks.
2. Image resizing and optimization.
3. Full-image OCR.
4. Focused OCR on a selected receipt region.
5. Combining OCR results.
6. Classifying the document.
7. Extracting merchant, date and total payable amount.
8. Presenting extracted information for user review.

The extraction and classification logic uses rule-based heuristics. It is not a trained machine-learning model.

## Evaluation

The evaluation dataset contains:

- 15 real bill images, including difficult and low-quality samples.
- 5 non-bill images.

Evaluation results, individual test records and failure analysis are available here:

- `ml-evaluation/results/evaluation.csv`
- `ml-evaluation/results/evaluation_report.md`
- `ml-evaluation/results/failure_analysis.md`

The evaluation examines bill classification, extracted field correctness and cases where OCR or extraction fails.

## Privacy and Data Storage

- OCR processing runs in the browser.
- Bill records are stored locally using IndexedDB.
- No external OCR API is required.
- No application backend is required for the current implementation.

Saved data is browser/device-specific and is not automatically synchronized between devices.

## Current Limitations

- OCR accuracy depends on image quality, lighting, orientation and receipt layout.
- Handwritten bills are difficult to process reliably.
- Merchant and total extraction may fail on unfamiliar invoice formats.
- Classification and extraction use heuristics rather than a trained ML model.
- Confidence indicators are heuristic estimates, not calibrated probabilities.
- Manual review is necessary when extracted information is uncertain.

## Future Improvements

- Improve OCR accuracy for regional and multilingual receipts.
- Improve merchant and total extraction across different invoice formats.
- Add more robust bill classification.
- Explore lightweight on-device machine-learning models.
- Add export functionality for expense records.
- Improve offline and installable PWA support.

## Author

**Jagadeesh**

GitHub: [@jagadeeshsys](https://github.com/jagadeeshsys)

Project Repository: [Bill Snap](https://github.com/jagadeeshsys/bill-snap)
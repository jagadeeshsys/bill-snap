# Bill Snap

Bill Snap is a local-first receipt scanner and expense manager. It helps people
turn receipt photos into editable transaction records, organize everyday
spending, and keep their financial information on their own device.

## Features

- Capture a receipt with a supported device camera or upload an image from the
  gallery.
- Preprocess receipt images and use Tesseract.js OCR to extract merchant, date,
  payable amount, currency metadata, and a suggested category.
- Classify an image as a bill, non-bill, or uncertain.
- Review extraction confidence and correct fields before saving.
- Keep saved receipt metadata and local preferences in IndexedDB.
- Search transactions by merchant; filter by category, date, and amount; sort,
  edit, and delete saved transactions.
- View spending summaries, category breakdowns, and monthly trends, keeping
  currency totals separate and unknown currency in its own group.
- Store an optional local profile, preferences, and a currency-specific monthly
  budget.
- Export saved transactions to CSV and export/restore a versioned JSON backup.

## Technology stack

| Area | Technology |
|---|---|
| UI | React 19, TypeScript |
| Build and development server | Vite |
| OCR | Tesseract.js |
| Local persistence | IndexedDB |
| PWA | `vite-plugin-pwa` and Workbox-generated service worker |
| Styling and icons | CSS, lucide-react |
| Tests | Node.js built-in test runner |
| Linting | ESLint |

No application backend, account system, or cloud receipt store is used.

## Architecture and data flow

```text
Camera or gallery image
        |
        v
Image validation and preprocessing (src/services/image.ts)
        |
        v
OCR passes and geometry evidence (src/services/ocr.ts, ocrEvidence.ts)
        |
        v
Bill classification and field/currency extraction
        |
        v
Review, manual correction, and category selection (src/App.tsx)
        |
        v
Receipt metadata in IndexedDB (src/services/storage.ts)
        |
        +--> Transaction search, filters, sorting, edits, and deletion
        +--> Currency-separated dashboard and analytics
        +--> CSV export and versioned JSON backup/restore
```

`src/App.tsx` coordinates the application screens and user actions. Business
logic is separated into services: `billProcessor.ts`, `image.ts`, `ocr.ts`,
`billClassifier.ts`, and `extractor.ts` process receipts;
`expenseManagement.ts` and `analytics.ts` query and summarize saved
transactions; `localSettings.ts` and `backup.ts` handle preferences and
user-controlled data transfer. Focused tests are under `tests/`.

The IndexedDB `bills` store contains receipt transaction fields and the image
filename, not the original receipt image bytes. Profile/preferences are kept in
a separate versioned settings record. Restores validate the backup, preview
duplicate handling, require confirmation, and write receipt/settings changes
atomically.

## Privacy and security

- OCR processing and data management happen in the browser.
- There is no login, authentication, backend, or cloud receipt storage.
- Receipt records and settings are stored in the browser's IndexedDB for the
  current browser profile and device.
- CSV and JSON files are generated locally. A JSON backup is user-controlled;
  it is not uploaded by the app.
- Browser/device storage is not synchronized. Clearing site data, losing the
  device, or browser storage eviction may permanently remove records. Export
  backups regularly and store them somewhere safe.
- Receipt images are not retained as image records by the app; the receipt
  filename is kept with the saved transaction.

## Install and run locally

Prerequisites: Node.js 22 or newer and npm.

```bash
git clone https://github.com/jagadeeshsys/bill-snap.git
cd bill-snap
npm ci
npm run dev
```

Open the local URL printed by Vite (the Pages base path is `/bill-snap/`).

Run the test suite, lint, or a production build:

```bash
npm test
npm run lint
npm run build
```

## PWA, network, and offline behavior

The production build includes a web app manifest, app icons, a service worker,
and the local Tesseract worker, core, and English language model. The service
worker precaches these files and serves the single-page app entry point for
in-scope navigation. It does not cache IndexedDB records or user receipt data.

The hosted app is served over HTTPS and can be installed from supported
browsers. After the installed app has loaded once and its service worker has
finished caching, scans can run without a network connection. Browser camera
permission and available device storage still apply.

## GitHub Pages deployment

The deployed application is available at
[https://jagadeeshsys.github.io/bill-snap/](https://jagadeeshsys.github.io/bill-snap/).

The repository's `.github/workflows/deploy.yml` builds the app and deploys
`dist/` to GitHub Pages on pushes to `main` or a manual workflow dispatch.
Configure GitHub Pages to use **GitHub Actions** as its source. Check the
workflow run and open the URL above after each release; a successful local
build alone does not confirm a deployment.

## Receipt evaluation

Evaluation records and protocols are in `ml-evaluation/results/`. The
submission cohort is fixed at the 15 tracked bill images and 5 tracked
non-bill images. `evaluation.csv` is retained historical evidence only; it is
not a measurement of this release. Complete
`evaluation_release_template.csv` from the production build before submission
and use its explicit output, ground-truth, and correction columns to calculate
the release report.

The supplemental B16–B29 images are separate from the core cohort and require
manual ground-truth verification before scoring. See the evaluation report
and failure analysis for the evidence and limitations.

## Known limitations

- OCR and extraction quality depend on image quality, layout, and language.
- Classification and extraction use rules and heuristics, not a trained
  machine-learning model.
- Confidence values are heuristic and are not calibrated probabilities.
- Currency detection is not exposed as a prediction in the receipt review UI;
  currency accuracy cannot be measured from a UI-only evaluation.
- Local-only storage has no synchronization or server-side recovery.

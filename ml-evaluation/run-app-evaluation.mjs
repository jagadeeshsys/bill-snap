import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.BILL_SNAP_BASE_URL ?? 'http://127.0.0.1:5175/bill-snap/';
const cdpUrl = process.env.BILL_SNAP_CDP_URL ?? 'http://127.0.0.1:9222';
const outputSuffix = process.env.BILL_SNAP_OUTPUT_SUFFIX
  ? `-${process.env.BILL_SNAP_OUTPUT_SUFFIX}`
  : '';
const imageRoot = path.join(root, 'ml-evaluation/test-images');
const manifest = JSON.parse(await readFile(path.join(root, 'ml-evaluation/test-manifest.json'), 'utf8'));
const outputPath = path.join(root, `ml-evaluation/results/app-run${outputSuffix}.json`);
const reportPath = path.join(root, `ml-evaluation/results/app_evaluation_report${outputSuffix}.md`);
const imagePattern = /\.(?:jpe?g|png|webp)$/i;

const imagePaths = [];
for (const entry of await readdir(imageRoot, { withFileTypes: true })) {
  const entryPath = path.join(imageRoot, entry.name);
  if (entry.isFile() && imagePattern.test(entry.name)) imagePaths.push(entryPath);
  if (!entry.isDirectory()) continue;
  for (const name of await readdir(entryPath)) {
    if (imagePattern.test(name)) imagePaths.push(path.join(entryPath, name));
  }
}
imagePaths.sort();
const selectedImages = process.env.BILL_SNAP_ONLY
  ? new Set(process.env.BILL_SNAP_ONLY.split(',').map((value) => value.trim()))
  : null;
const evaluationPaths = selectedImages
  ? imagePaths.filter((imagePath) => selectedImages.has(path.relative(imageRoot, imagePath)))
  : imagePaths;
if (selectedImages && evaluationPaths.length !== selectedImages.size) {
  throw new Error('One or more BILL_SNAP_ONLY paths do not exist in the test image set.');
}
const targets = await fetch(`${cdpUrl}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No Chrome page target found.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject, timer } = pending.get(message.id);
  clearTimeout(timer);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}, timeoutMs = 30_000) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chrome command timed out: ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await command('Page.navigate', { url: baseUrl });
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const importResult = await command('Runtime.evaluate', {
    expression: `Promise.all([
      import('/bill-snap/src/services/image.ts'),
      import('/bill-snap/src/services/billProcessor.ts')
    ]).then(([image, processor]) => {
      window.__billSnapEvaluation = { processImage: image.processImage, processBillImage: processor.processBillImage };
      return true;
    })`,
    awaitPromise: true,
    returnByValue: true,
  }, 60_000);
  if (importResult.exceptionDetails || !importResult.result?.value) {
    throw new Error(importResult.exceptionDetails?.text ?? 'Could not load app services in Chrome.');
  }

  const results = [];
  for (const imagePath of evaluationPaths) {
    const relativePath = path.relative(imageRoot, imagePath);
    const expected = manifest.images[relativePath];
    if (!expected) throw new Error(`Missing manifest entry: ${relativePath}`);
    const imageUrl = new URL(`ml-evaluation/test-images/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`, baseUrl).href;
    const expression = `async () => {
      const services = window.__billSnapEvaluation;
      const response = await fetch(${JSON.stringify(imageUrl)});
      if (!response.ok) throw new Error('Could not fetch test image: ' + response.status);
      const blob = await response.blob();
      const source = new File([blob], ${JSON.stringify(path.basename(imagePath))}, { type: blob.type || 'image/jpeg' });
      const prepared = await services.processImage(source);
      const result = await services.processBillImage(
        prepared.file,
        undefined,
        source,
        { width: prepared.originalWidth, height: prepared.originalHeight }
      );
      URL.revokeObjectURL(prepared.previewUrl);
      return {
        success: result.success,
        error: result.error,
        classification: result.classification,
        ocrConfidence: result.ocrConfidence,
        fields: result.data ? {
          merchant: result.data.merchant,
          date: result.data.date,
          total: result.data.total,
          currency: result.data.currency,
          category: result.data.category,
        } : null,
        fieldEvidence: result.data?.evidence ?? null,
        extractionIsBill: result.data?.isBill ?? false,
        primaryText: result.ocrEvidence?.primaryFullPage.text ?? '',
        passes: result.ocrEvidence?.passes.map(pass => ({ source: pass.source, text: pass.text, confidence: pass.confidence })) ?? [],
        failures: result.ocrEvidence?.failures ?? [],
      };
    }`;
    const evaluated = await command('Runtime.evaluate', {
      expression: `(${expression})()`,
      awaitPromise: true,
      returnByValue: true,
    }, 240_000);
    if (evaluated.exceptionDetails) {
      results.push({ image: relativePath, expectedClass: expected.expectedClass, error: evaluated.exceptionDetails.text });
      console.error(`${relativePath}: ERROR ${evaluated.exceptionDetails.text}`);
      continue;
    }

    const app = evaluated.result.value;
    const predictedClass = app.classification?.status ?? 'error';
    const fields = app.fields ?? {};
    const expectedFields = expected.expectedFields ?? {};
    const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const fieldEvaluation = Object.fromEntries(Object.entries(expectedFields).map(([field, expectedValue]) => {
      const actualValue = fields[field]?.value ?? null;
      const correct = Array.isArray(expectedValue)
        ? expectedValue.some((value) => normalize(value) === normalize(actualValue))
        : typeof expectedValue === 'number'
          ? typeof actualValue === 'number' && Math.abs(expectedValue - actualValue) <= 0.01
          : normalize(expectedValue) === normalize(actualValue);
      return [field, { expected: expectedValue, actual: actualValue, correct }];
    }));
    const record = {
      image: relativePath,
      expectedClass: expected.expectedClass,
      predictedClass,
      classificationCorrect: predictedClass === expected.expectedClass,
      success: app.success,
      error: app.error,
      expectedFields,
      fieldEvaluation,
      ocrConfidence: Math.round(app.ocrConfidence ?? 0),
      fields,
      fieldEvidence: app.fieldEvidence,
      extractionIsBill: app.extractionIsBill,
      passes: app.passes,
      failures: app.failures,
      primaryText: app.primaryText,
    };
    results.push(record);
    console.log(`${relativePath}: ${predictedClass}, OCR ${record.ocrConfidence}%, passes=${app.passes.map((pass) => pass.source).join(',')}, merchant=${fields.merchant?.value ?? 'blank'}, date=${fields.date?.value ?? 'blank'}, total=${fields.total?.value ?? 'blank'}, category=${fields.category?.value ?? 'blank'}`);
  }

  const classCounts = results.reduce((counts, result) => {
    const key = `${result.expectedClass}:${result.predictedClass}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const fieldCounts = {};
  for (const result of results) {
    for (const [field, evaluation] of Object.entries(result.fieldEvaluation ?? {})) {
      fieldCounts[field] ??= { correct: 0, evaluated: 0 };
      fieldCounts[field].evaluated += 1;
      if (evaluation.correct) fieldCounts[field].correct += 1;
    }
  }
  const classificationCorrect = results.filter((result) => result.classificationCorrect).length;
  const lines = [
    '# Bill Snap browser-pipeline evaluation',
    '',
    `Run: ${new Date().toISOString()}. Dataset: ${results.length} images from [test-manifest.json](../test-manifest.json).`,
    '',
    '## Method',
    '',
    'Runs the app’s actual browser services in headless Chrome with a 390×844 mobile viewport: `processImage` for MIME/size validation, orientation-aware decoding, 1600-pixel resize, and JPEG compression, followed by `processBillImage` for bundled Tesseract OCR, full-page and targeted crops, optional source-resolution/contrast OCR, classification, and field extraction. This exercises the OCR processing path but not camera hardware, gallery picker UI, manual edits, IndexedDB save, or a physical phone.',
    '',
    'Uncertain classification counts as incorrect. Expected fields were visually transcribed; B17 is a jewelry replacement valuation, not a purchase. Totals are correct within 0.01; other fields use case/punctuation-insensitive exact comparison.',
    '',
    '## Classification',
    '',
    `Correct classifications: **${classificationCorrect}/${results.length}** (${(100 * classificationCorrect / results.length).toFixed(1)}%).`,
    '',
    '| Expected | Predicted bill | Predicted uncertain | Predicted not bill |',
    '|---|---:|---:|---:|',
  ];
  for (const expectedClass of ['bill', 'not_bill']) {
    lines.push(`| ${expectedClass} | ${classCounts[`${expectedClass}:bill`] ?? 0} | ${classCounts[`${expectedClass}:uncertain`] ?? 0} | ${classCounts[`${expectedClass}:not_bill`] ?? 0} |`);
  }
  lines.push('', '## Field correctness', '', '| Field | Correct | Evaluated |', '|---|---:|---:|');
  for (const field of ['merchant', 'date', 'total', 'category']) {
    const counts = fieldCounts[field] ?? { correct: 0, evaluated: 0 };
    lines.push(`| ${field} | ${counts.correct} | ${counts.evaluated} |`);
  }
  lines.push('', '## Per-image results', '', '| Image | Expected | Predicted | Class | Merchant | Date | Total | Category |', '|---|---|---|---:|---:|---:|---:|---:|');
  for (const result of results) {
    const mark = (field) => {
      const value = result.fieldEvaluation?.[field];
      return value ? (value.correct ? '✓' : '✗') : '—';
    };
    lines.push(`| ${result.image} | ${result.expectedClass} | ${result.predictedClass ?? 'error'} | ${result.classificationCorrect ? '✓' : '✗'} | ${mark('merchant')} | ${mark('date')} | ${mark('total')} | ${mark('category')} |`);
  }
  lines.push('', `Raw primary and targeted OCR text, field evidence, confidence/review flags, and pass failures are in [app-run${outputSuffix}.json](./app-run${outputSuffix}.json).`, '', '## Reproduce', '', 'Start the dev server at `http://127.0.0.1:5175/bill-snap/`, launch Chrome with remote debugging on port 9222, then run:', '', '```bash', 'node ml-evaluation/run-app-evaluation.mjs', '```', '');
  await writeFile(outputPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    baseUrl,
    imageCount: results.length,
    classificationMetrics: { correct: classificationCorrect, total: results.length, counts: classCounts },
    fieldMetrics: fieldCounts,
    results,
  }, null, 2));
  await writeFile(reportPath, lines.join('\n'));
  console.log(`Saved browser-pipeline results to ${path.relative(root, outputPath)}`);
} finally {
  socket.close();
}

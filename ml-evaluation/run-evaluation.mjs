import { createWorker } from 'tesseract.js';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { classifyBillText } from '../src/services/billClassifier.ts';
import { extractBillData } from '../src/services/extractor.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imageRoot = path.join(root, 'ml-evaluation/test-images');
const outputPath = path.join(root, 'ml-evaluation/results/latest-run.json');
const reportPath = path.join(root, 'ml-evaluation/results/evaluation_report.md');
const manifestPath = path.join(root, 'ml-evaluation/test-manifest.json');
const imagePattern = /\.(?:jpe?g|png|webp)$/i;
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

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
const unmappedImages = imagePaths.filter((imagePath) =>
  !manifest.images[path.relative(imageRoot, imagePath)]
);
if (unmappedImages.length > 0) {
  throw new Error(`Images missing from test manifest: ${unmappedImages.map((image) => path.relative(imageRoot, image)).join(', ')}`);
}
const worker = await createWorker('eng', undefined, {
  langPath: path.join(root, 'node_modules/@tesseract.js-data/eng/4.0.0'),
  gzip: true,
  cachePath: path.join(root, '.cache/tesseract-evaluation'),
  logger: () => {},
});
const results = [];
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const workingTreeDirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;

try {
  for (const imagePath of imagePaths) {
    const relativePath = path.relative(imageRoot, imagePath);
    const expected = manifest.images[relativePath];
    const expectedClass = expected.expectedClass;
    try {
      const { data } = await worker.recognize(await readFile(imagePath));
      const classification = classifyBillText(data.text);
      const fields = extractBillData(data.text);
      const expectedFields = expected.expectedFields ?? {};
      const fieldEvaluation = Object.fromEntries(
        Object.entries(expectedFields).map(([field, expectedValue]) => {
          const actualValue = fields[field].value;
          const normalized = (value) => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          const isCorrect = Array.isArray(expectedValue)
            ? expectedValue.some((candidate) => normalized(candidate) === normalized(actualValue))
            : typeof expectedValue === 'number'
              ? typeof actualValue === 'number' && Math.abs(expectedValue - actualValue) <= 0.01
              : normalized(expectedValue) === normalized(actualValue);
          return [field, { expected: expectedValue, actual: actualValue, correct: isCorrect }];
        })
      );
      results.push({
        image: relativePath,
        expectedClass,
        predictedClass: classification.status,
        classificationCorrect: classification.status === expectedClass,
        expectedFields,
        fieldEvaluation,
        groundTruthNote: expected.note ?? null,
        classificationReasons: classification.reasons,
        ocrConfidence: Math.round(data.confidence),
        merchant: fields.merchant,
        date: fields.date,
        total: fields.total,
        currency: fields.currency,
        category: fields.category,
        rawText: data.text,
      });
      console.log(`${relativePath}: ${classification.status}, OCR ${Math.round(data.confidence)}%, merchant=${fields.merchant.value ?? 'blank'}, date=${fields.date.value ?? 'blank'}, total=${fields.total.value ?? 'blank'} ${fields.currency.code ?? ''}, category=${fields.category.value ?? 'blank'}`);
    } catch (error) {
        results.push({ image: relativePath, expectedClass, error: String(error) });
      console.error(`${relativePath}: ${String(error)}`);
    }
  }
} finally {
  await worker.terminate();
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
const reportLines = [
  '# Bill Snap full image evaluation',
  '',
  `Run: ${new Date().toISOString()}. Dataset: ${results.length} images, manually checked against the supplied images and labeled in [test-manifest.json](../test-manifest.json).`,
  '',
  '## Method and scope',
  '',
  'The runner applies Tesseract.js to each original source image, then uses the same bill classifier and extractor modules as the app. This isolates OCR and downstream rules, but does not execute the app’s browser canvas resizing, compression, header crop, optional original-image pass, or contrast pass. Treat this as a reproducible diagnostic; it is not a device/browser end-to-end test.',
  '',
  'Field correctness is exact after case/punctuation normalization for merchant, date, and category, and within 0.01 for total. Expected fields were transcribed by visual review. B17 is a jewelry replacement valuation rather than a purchase receipt. Blank expected values are omitted where the image did not provide a reliable ground truth.',
  '',
  '## Classification',
  '',
  `Correct classifications: **${classificationCorrect}/${results.length}** (${(100 * classificationCorrect / results.length).toFixed(1)}%). Uncertain predictions count as incorrect in this accuracy figure.`,
  '',
  '| Expected | Predicted bill | Predicted uncertain | Predicted not bill |',
  '|---|---:|---:|---:|',
];
for (const expectedClass of ['bill', 'not_bill']) {
  reportLines.push(`| ${expectedClass} | ${classCounts[`${expectedClass}:bill`] ?? 0} | ${classCounts[`${expectedClass}:uncertain`] ?? 0} | ${classCounts[`${expectedClass}:not_bill`] ?? 0} |`);
}
reportLines.push('', '## Field correctness', '', '| Field | Correct | Evaluated |', '|---|---:|---:|');
for (const field of ['merchant', 'date', 'total', 'category']) {
  const counts = fieldCounts[field] ?? { correct: 0, evaluated: 0 };
  reportLines.push(`| ${field} | ${counts.correct} | ${counts.evaluated} |`);
}
reportLines.push('', '## Per-image results', '', '| Image | Expected | Predicted | Class | Merchant | Date | Total | Category |', '|---|---|---|---|---:|---:|---:|---:|');
for (const result of results) {
  const mark = (field) => {
    const value = result.fieldEvaluation?.[field];
    return value ? (value.correct ? '✓' : '✗') : '—';
  };
  reportLines.push(`| ${result.image} | ${result.expectedClass} | ${result.predictedClass ?? 'error'} | ${result.classificationCorrect ? '✓' : '✗'} | ${mark('merchant')} | ${mark('date')} | ${mark('total')} | ${mark('category')} |`);
}
reportLines.push('', 'The full OCR text, extracted values, confidence/review flags, expected values, and per-field comparisons are in [latest-run.json](./latest-run.json).', '', '## Reproduce', '', '```bash', 'node --experimental-strip-types ml-evaluation/run-evaluation.mjs', 'npm test', 'npm run lint', 'npm run build', '```', '');

await writeFile(outputPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  commit,
  workingTreeDirty,
  imageCount: imagePaths.length,
  note: 'Raw source-image Tesseract diagnostic. See the generated report for methodology and field scoring.',
  classificationMetrics: { correct: classificationCorrect, total: results.length, counts: classCounts },
  fieldMetrics: fieldCounts,
  results,
}, null, 2));
await writeFile(reportPath, reportLines.join('\n'));
console.log(`Saved ${results.length} results to ${path.relative(root, outputPath)}`);

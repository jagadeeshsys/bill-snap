import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_FORMAT_VERSION,
  buildTransactionsCsv,
  createLocalBackup,
  parseLocalBackup,
  summarizeRestore,
} from "../src/services/backup.ts";
import { createDefaultLocalSettings } from "../src/services/localSettings.ts";
import type { SavedBill } from "../src/services/storage.ts";

function makeBill(overrides: Partial<SavedBill> = {}): SavedBill {
  return {
    id: "bill-1",
    merchant: 'Cafe, "North"\nBranch',
    date: "06/11/2026",
    total: 45.5,
    category: "Food",
    imageName: "receipt, one.jpg",
    savedAt: "2026-11-06T10:00:00.000Z",
    ...overrides,
  };
}

test("exports an RFC-style escaped CSV with all requested receipt columns", () => {
  const csv = buildTransactionsCsv([
    makeBill(),
    makeBill({
      id: "bill-2",
      merchant: "Legacy shop",
      currency: undefined,
      imageName: "line\nbreak.jpg",
    }),
  ]);
  const lines = csv.split("\r\n");

  assert.equal(
    lines[0],
    '"Merchant","Date","Amount","Currency","Category","Receipt image filename","Saved date"'
  );
  assert.match(lines[1], /^"Cafe, ""North""\nBranch"/);
  assert.match(lines[1], /"receipt, one\.jpg"/);
  assert.match(lines[2], /"Currency unavailable"/);
  assert.match(lines[2], /"line\nbreak\.jpg"/);
});

test("creates and validates a versioned backup with saved data and settings", () => {
  const settings = createDefaultLocalSettings();
  settings.profile.displayName = "Asha";
  const backup = createLocalBackup(
    [makeBill({ currency: "EUR" })],
    settings,
    "2026-11-06T11:00:00.000Z"
  );
  const parsed = parseLocalBackup(JSON.parse(JSON.stringify(backup)));

  assert.equal(parsed.formatVersion, BACKUP_FORMAT_VERSION);
  assert.equal(parsed.bills[0].currency, "EUR");
  assert.equal(parsed.settings.profile.displayName, "Asha");
});

test("rejects malformed, unsupported, duplicate-ID, and invalid settings backups", () => {
  const valid = createLocalBackup(
    [makeBill()],
    createDefaultLocalSettings()
  );

  assert.throws(() => parseLocalBackup("{bad json}"), /malformed/);
  assert.throws(
    () => parseLocalBackup({ ...valid, formatVersion: 999 }),
    /unsupported version/
  );
  assert.throws(
    () =>
      parseLocalBackup({
        ...valid,
        bills: [makeBill(), makeBill()],
      }),
    /duplicate receipt IDs/
  );
  assert.throws(
    () =>
      parseLocalBackup({
        ...valid,
        settings: {
          ...valid.settings,
          preferences: {
            ...valid.settings.preferences,
            appearance: "neon",
          },
        },
      }),
    /preferences are malformed/
  );
});

test("restore summary adds new receipts, skips duplicate records, and replaces settings only after confirmation", () => {
  const backup = createLocalBackup(
    [
      makeBill(),
      makeBill({
        id: "bill-2",
        merchant: "Different",
        date: "2026-11-01",
      }),
    ],
    createDefaultLocalSettings()
  );
  const summary = summarizeRestore(
    backup,
    [makeBill({ id: "existing", imageName: "existing.jpg" })]
  );

  assert.deepEqual(summary, {
    toAdd: 1,
    toSkip: 1,
    settingsWillBeReplaced: true,
  });
});

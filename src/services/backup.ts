import { findProbableDuplicate } from "./storage.ts";
import type { SavedBill } from "./storage.ts";
import type { CurrencyCode } from "./extractor";
import type {
  Appearance,
  DateFormat,
  LocalAppSettings,
} from "./localSettings.ts";

export const BACKUP_FORMAT_VERSION = 1;

export interface LocalBackup {
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  bills: SavedBill[];
  settings: LocalAppSettings;
}

export interface RestoreSummary {
  toAdd: number;
  toSkip: number;
  settingsWillBeReplaced: boolean;
}

const currencies: CurrencyCode[] = ["INR", "GBP", "USD", "EUR"];
const dateFormats: DateFormat[] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];
const appearances: Appearance[] = ["light", "dark"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCurrency(value: unknown): value is CurrencyCode {
  return currencies.includes(value as CurrencyCode);
}

function validateSettings(value: unknown): LocalAppSettings {
  if (!isRecord(value) || value.id !== "local-settings" || value.schemaVersion !== 1) {
    throw new Error("Backup settings are malformed or unsupported.");
  }

  const { profile, preferences, budget } = value;
  if (
    !isRecord(profile) ||
    typeof profile.displayName !== "string" ||
    typeof profile.email !== "string" ||
    !(
      profile.imageDataUrl === null ||
      (typeof profile.imageDataUrl === "string" &&
        profile.imageDataUrl.length <= 3 * 1024 * 1024 &&
        /^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/]+=*$/i.test(
          profile.imageDataUrl
        ))
    )
  ) {
    throw new Error("Backup profile data is malformed.");
  }

  if (
    !isRecord(preferences) ||
    !isCurrency(preferences.defaultCurrency) ||
    !dateFormats.includes(preferences.dateFormat as DateFormat) ||
    !appearances.includes(preferences.appearance as Appearance)
  ) {
    throw new Error("Backup preferences are malformed.");
  }

  if (
    !isRecord(budget) ||
    !(budget.amount === null ||
      (typeof budget.amount === "number" &&
        Number.isFinite(budget.amount) &&
        budget.amount > 0)) ||
    !isCurrency(budget.currency)
  ) {
    throw new Error("Backup budget is malformed.");
  }

  return {
    id: "local-settings",
    schemaVersion: 1,
    profile: {
      displayName: profile.displayName,
      email: profile.email,
      imageDataUrl: profile.imageDataUrl,
    },
    preferences: {
      defaultCurrency: preferences.defaultCurrency,
      dateFormat: preferences.dateFormat as DateFormat,
      appearance: preferences.appearance as Appearance,
    },
    budget: {
      amount: budget.amount as number | null,
      currency: budget.currency,
    },
  };
}

function validateBill(value: unknown): SavedBill {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.merchant !== "string" ||
    value.merchant.trim().length === 0 ||
    typeof value.date !== "string" ||
    value.date.trim().length === 0 ||
    typeof value.total !== "number" ||
    !Number.isFinite(value.total) ||
    value.total <= 0 ||
    typeof value.category !== "string" ||
    value.category.trim().length === 0 ||
    typeof value.imageName !== "string" ||
    typeof value.savedAt !== "string" ||
    Number.isNaN(Date.parse(value.savedAt)) ||
    (value.currency !== undefined && !isCurrency(value.currency))
  ) {
    throw new Error("Backup contains a malformed receipt record.");
  }

  return {
    id: value.id,
    merchant: value.merchant,
    date: value.date,
    total: value.total,
    category: value.category,
    ...(value.currency ? { currency: value.currency } : {}),
    imageName: value.imageName,
    savedAt: value.savedAt,
  };
}

export function createLocalBackup(
  bills: SavedBill[],
  settings: LocalAppSettings,
  exportedAt = new Date().toISOString()
): LocalBackup {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    bills: bills.map((bill) => ({ ...bill })),
    settings: structuredClone(settings),
  };
}

export function parseLocalBackup(value: unknown): LocalBackup {
  if (
    !isRecord(value) ||
    value.formatVersion !== BACKUP_FORMAT_VERSION ||
    typeof value.exportedAt !== "string" ||
    Number.isNaN(Date.parse(value.exportedAt)) ||
    !Array.isArray(value.bills)
  ) {
    throw new Error("This backup file is malformed or uses an unsupported version.");
  }

  const bills = value.bills.map(validateBill);
  const ids = new Set<string>();
  for (const bill of bills) {
    if (ids.has(bill.id)) {
      throw new Error("Backup contains duplicate receipt IDs.");
    }
    ids.add(bill.id);
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: value.exportedAt,
    bills,
    settings: validateSettings(value.settings),
  };
}

export function buildTransactionsCsv(bills: SavedBill[]): string {
  const rows = [
    [
      "Merchant",
      "Date",
      "Amount",
      "Currency",
      "Category",
      "Receipt image filename",
      "Saved date",
    ],
    ...bills.map((bill) => [
      bill.merchant,
      bill.date,
      String(bill.total),
      bill.currency ?? "Currency unavailable",
      bill.category,
      bill.imageName,
      bill.savedAt,
    ]),
  ];

  return rows
    .map((row) =>
      row
        .map((field) => `"${field.replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\r\n");
}

function isRestoreDuplicate(
  candidate: SavedBill,
  existing: SavedBill[]
): boolean {
  if (existing.some((bill) => bill.id === candidate.id)) return true;

  const sameCurrency = existing.filter(
    (bill) => (bill.currency ?? null) === (candidate.currency ?? null)
  );
  return findProbableDuplicate(candidate, sameCurrency) !== null;
}

export function summarizeRestore(
  backup: LocalBackup,
  currentBills: SavedBill[]
): RestoreSummary {
  const accepted: SavedBill[] = [];
  let toSkip = 0;

  for (const bill of backup.bills) {
    if (isRestoreDuplicate(bill, [...currentBills, ...accepted])) {
      toSkip += 1;
    } else {
      accepted.push(bill);
    }
  }

  return {
    toAdd: accepted.length,
    toSkip,
    settingsWillBeReplaced: true,
  };
}

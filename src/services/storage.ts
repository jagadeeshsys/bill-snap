
import type { CurrencyCode, ExtractedBill } from "./extractor";
import {
  createDefaultLocalSettings,
  type LocalAppSettings,
} from "./localSettings.ts";

export interface SavedBill {
  id: string;
  merchant: string;
  date: string;
  total: number;
  category: string;
  currency?: CurrencyCode;
  imageName: string;
  savedAt: string;
}

export interface SaveBillOptions {
  allowProbableDuplicate?: boolean;
}

export class ProbableDuplicateBillError extends Error {
  readonly existingBill: SavedBill;

  constructor(existingBill: SavedBill) {
    super("A probable duplicate bill was found.");
    this.name = "ProbableDuplicateBillError";
    this.existingBill = existingBill;
  }
}

const DB_NAME = "BillSnapDB";
const STORE_NAME = "bills";
const SETTINGS_STORE_NAME = "settings";
const SETTINGS_ID = "local-settings";
const DB_VERSION = 2;

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `bill-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
        db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeMerchant(merchant: string): string {
  return merchant
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizeBillDate(date: string): string {
  const dayFirst = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(
    date.trim()
  );

  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return date.trim();
}

function hasUsefulImageName(imageName: string): boolean {
  const normalized = imageName.trim().toLowerCase();

  return (
    normalized.length > 0 &&
    !/^(?:bill-image|image|photo|scan)(?:[-_ ]\d+)?\.(?:jpe?g|png|webp)$/i.test(
      normalized
    )
  );
}

export function findProbableDuplicate(
  candidate: Pick<SavedBill, "merchant" | "date" | "total" | "imageName">,
  existingBills: SavedBill[]
): SavedBill | null {
  const merchant = normalizeMerchant(candidate.merchant);
  const date = normalizeBillDate(candidate.date);
  const hasImageName = hasUsefulImageName(candidate.imageName);

  return (
    existingBills.find((existing) => {
      if (
        normalizeMerchant(existing.merchant) !== merchant ||
        normalizeBillDate(existing.date) !== date
      ) {
        return false;
      }

      const amountsAreClose =
        Math.abs(existing.total - candidate.total) <= 1;
      const imageNamesMatch =
        hasImageName &&
        hasUsefulImageName(existing.imageName) &&
        existing.imageName.trim().toLowerCase() ===
          candidate.imageName.trim().toLowerCase();

      return amountsAreClose || imageNamesMatch;
    }) ?? null
  );
}

export async function saveBill(
  bill: ExtractedBill,
  imageName: string,
  options: SaveBillOptions = {}
): Promise<SavedBill> {
  if (
    !bill.merchant.value ||
    !bill.date.value ||
    bill.total.value === null ||
    !bill.category.value
  ) {
    throw new Error("Please complete all bill details before saving.");
  }

  const savedBill: SavedBill = {
    id: generateId(),
    merchant: bill.merchant.value,
    date: bill.date.value,
    total: bill.total.value,
    category: bill.category.value,
    ...(bill.currency.code ? { currency: bill.currency.code } : {}),
    imageName,
    savedAt: new Date().toISOString(),
  };

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    let duplicateError: ProbableDuplicateBillError | null = null;
    const request = store.getAll();

    request.onsuccess = () => {
      const existing = findProbableDuplicate(
        savedBill,
        request.result as SavedBill[]
      );

      if (existing && !options.allowProbableDuplicate) {
        duplicateError = new ProbableDuplicateBillError(existing);
        transaction.abort();
        return;
      }

      store.add(savedBill);
    };

    request.onerror = () => transaction.abort();

    transaction.oncomplete = () => {
      db.close();
      resolve(savedBill);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(duplicateError ?? transaction.error);
    };
  });
}

export async function getAllBills(): Promise<SavedBill[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      db.close();

      const bills = request.result as SavedBill[];

      resolve(
        bills.sort(
          (a, b) =>
            new Date(b.savedAt).getTime() -
            new Date(a.savedAt).getTime()
        )
      );
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function getLocalSettings(): Promise<LocalAppSettings> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS_STORE_NAME, "readonly");
    const request = transaction.objectStore(SETTINGS_STORE_NAME).get(SETTINGS_ID);

    request.onsuccess = () => {
      db.close();
      resolve(
        (request.result as LocalAppSettings | undefined) ??
          createDefaultLocalSettings()
      );
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function saveLocalSettings(
  settings: LocalAppSettings
): Promise<void> {
  if (settings.id !== SETTINGS_ID || settings.schemaVersion !== 1) {
    throw new Error("Cannot save unsupported local settings.");
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS_STORE_NAME, "readwrite");
    transaction.objectStore(SETTINGS_STORE_NAME).put(settings);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function resetLocalSettings(): Promise<LocalAppSettings> {
  const settings = createDefaultLocalSettings();
  await saveLocalSettings(settings);
  return settings;
}

export interface RestoreWriteResult {
  added: number;
  skipped: number;
}

export async function restoreLocalData(
  importedBills: SavedBill[],
  settings: LocalAppSettings
): Promise<RestoreWriteResult> {
  if (settings.id !== SETTINGS_ID || settings.schemaVersion !== 1) {
    throw new Error("Cannot restore unsupported local settings.");
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORE_NAME, SETTINGS_STORE_NAME],
      "readwrite"
    );
    const billStore = transaction.objectStore(STORE_NAME);
    const request = billStore.getAll();
    const result: RestoreWriteResult = { added: 0, skipped: 0 };

    request.onsuccess = () => {
      const currentBills = request.result as SavedBill[];
      const accepted: SavedBill[] = [];

      for (const candidate of importedBills) {
        const sameCurrency = [...currentBills, ...accepted].filter(
          (existing) =>
            (existing.currency ?? null) === (candidate.currency ?? null)
        );
        const isDuplicate =
          currentBills.concat(accepted).some(
            (existing) => existing.id === candidate.id
          ) ||
          findProbableDuplicate(candidate, sameCurrency) !== null;

        if (isDuplicate) {
          result.skipped += 1;
          continue;
        }

        accepted.push(candidate);
      }

      try {
        for (const bill of accepted) billStore.add(bill);
        transaction.objectStore(SETTINGS_STORE_NAME).put(settings);
        result.added = accepted.length;
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };

    request.onerror = () => transaction.abort();

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error("Local restore was rolled back."));
    };
  });
}

export async function updateBill(bill: SavedBill): Promise<SavedBill> {
  if (
    !bill.id ||
    !bill.merchant.trim() ||
    !bill.date.trim() ||
    !Number.isFinite(bill.total) ||
    bill.total <= 0 ||
    !bill.category.trim()
  ) {
    throw new Error("Please complete all bill details before saving.");
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    let updateError: Error | null = null;
    const request = store.get(bill.id);

    request.onsuccess = () => {
      if (!request.result) {
        updateError = new Error("This saved receipt could not be found.");
        transaction.abort();
        return;
      }

      store.put(bill);
    };

    transaction.oncomplete = () => {
      db.close();
      resolve(bill);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(updateError ?? transaction.error);
    };
  });
}

export async function deleteBill(id: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

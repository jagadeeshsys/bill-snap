import type { CurrencyCode } from "./extractor";

export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
export type Appearance = "light" | "dark";

export interface LocalProfile {
  displayName: string;
  email: string;
  imageDataUrl: string | null;
}

export interface ApplicationPreferences {
  defaultCurrency: CurrencyCode;
  dateFormat: DateFormat;
  appearance: Appearance;
}

export interface MonthlyBudget {
  amount: number | null;
  currency: CurrencyCode;
}

export interface LocalAppSettings {
  id: "local-settings";
  schemaVersion: 1;
  profile: LocalProfile;
  preferences: ApplicationPreferences;
  budget: MonthlyBudget;
}

export const DEFAULT_LOCAL_SETTINGS: LocalAppSettings = {
  id: "local-settings",
  schemaVersion: 1,
  profile: {
    displayName: "",
    email: "",
    imageDataUrl: null,
  },
  preferences: {
    defaultCurrency: "INR",
    dateFormat: "DD/MM/YYYY",
    appearance: "light",
  },
  budget: {
    amount: null,
    currency: "INR",
  },
};

export function createDefaultLocalSettings(): LocalAppSettings {
  return structuredClone(DEFAULT_LOCAL_SETTINGS);
}

export function updateProfile(
  settings: LocalAppSettings,
  profile: Partial<LocalProfile>
): LocalAppSettings {
  return {
    ...settings,
    profile: { ...settings.profile, ...profile },
  };
}

export function updatePreferences(
  settings: LocalAppSettings,
  preferences: Partial<ApplicationPreferences>
): LocalAppSettings {
  return {
    ...settings,
    preferences: { ...settings.preferences, ...preferences },
  };
}

export function updateMonthlyBudget(
  settings: LocalAppSettings,
  budget: MonthlyBudget
): LocalAppSettings {
  if (
    budget.amount !== null &&
    (!Number.isFinite(budget.amount) || budget.amount <= 0)
  ) {
    throw new Error("Budget must be a positive amount or unset.");
  }

  return { ...settings, budget: { ...budget } };
}

import { parseBillDate } from "./dashboardMetrics.ts";
import type { CurrencyCode } from "./extractor";
import type { SavedBill } from "./storage";

export type AnalyticsPeriod =
  | "this-month"
  | "previous-month"
  | "last-3-months"
  | "this-year"
  | "all-time";

export type AnalyticsCurrency = CurrencyCode | null;

export interface AnalyticsCategory {
  name: string;
  total: number;
  count: number;
  percentage: number;
}

export interface MonthlySpending {
  key: string;
  label: string;
  total: number;
  count: number;
}

export interface CurrencyAnalytics {
  currency: AnalyticsCurrency;
  total: number;
  count: number;
  average: number;
  highest: SavedBill | null;
  categories: AnalyticsCategory[];
  monthlyTrend: MonthlySpending[];
}

export interface SpendingAnalytics {
  period: AnalyticsPeriod;
  startMonth: string | null;
  endMonth: string | null;
  transactionCount: number;
  currencies: CurrencyAnalytics[];
}

interface MonthRange {
  start: number | null;
  end: number | null;
}

const currencyOrder: AnalyticsCurrency[] = [
  "INR",
  "GBP",
  "USD",
  "EUR",
  null,
];

function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

function monthKey(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getBillMonth(bill: SavedBill): number | null {
  const date = parseBillDate(bill.date);
  return date ? monthIndex(date.getFullYear(), date.getMonth()) : null;
}

function getPeriodRange(
  period: AnalyticsPeriod,
  now: Date
): MonthRange {
  const current = monthIndex(now.getFullYear(), now.getMonth());

  switch (period) {
    case "this-month":
      return { start: current, end: current };
    case "previous-month":
      return { start: current - 1, end: current - 1 };
    case "last-3-months":
      return { start: current - 2, end: current };
    case "this-year":
      return {
        start: monthIndex(now.getFullYear(), 0),
        end: current,
      };
    case "all-time":
      return { start: null, end: null };
  }
}

function normalizeCurrency(value: unknown): AnalyticsCurrency {
  return currencyOrder.includes(value as AnalyticsCurrency)
    ? (value as AnalyticsCurrency)
    : null;
}

function getTrendRange(
  bills: SavedBill[],
  range: MonthRange,
  now: Date
): MonthRange {
  if (range.start !== null && range.end !== null) return range;

  const validMonths = bills
    .map(getBillMonth)
    .filter((value): value is number => value !== null);
  const current = monthIndex(now.getFullYear(), now.getMonth());

  if (validMonths.length === 0) return { start: current, end: current };
  return {
    start: Math.min(...validMonths),
    end: Math.max(current, ...validMonths),
  };
}

function formatMonthLabel(index: number): string {
  const year = Math.floor(index / 12);
  const month = index % 12;
  return new Date(year, month, 1).toLocaleDateString("en", {
    month: "short",
    year: "numeric",
  });
}

export function calculateSpendingAnalytics(
  bills: SavedBill[],
  period: AnalyticsPeriod,
  now = new Date()
): SpendingAnalytics {
  const range = getPeriodRange(period, now);
  const filteredBills = bills.filter((bill) => {
    if (range.start === null || range.end === null) return true;
    const billMonth = getBillMonth(bill);
    return billMonth !== null &&
      billMonth >= range.start &&
      billMonth <= range.end;
  });

  const trendRange = getTrendRange(filteredBills, range, now);
  const currencies = currencyOrder
    .map((currency) => {
      const currencyBills = filteredBills.filter(
        (bill) => normalizeCurrency(bill.currency) === currency
      );
      if (currencyBills.length === 0) return null;

      const total = currencyBills.reduce((sum, bill) => sum + bill.total, 0);
      const categoryMap = new Map<string, { total: number; count: number }>();
      const trendMap = new Map<number, { total: number; count: number }>();

      for (const bill of currencyBills) {
        const category = categoryMap.get(bill.category) ?? {
          total: 0,
          count: 0,
        };
        category.total += bill.total;
        category.count += 1;
        categoryMap.set(bill.category, category);

        const month = getBillMonth(bill);
        if (month === null) continue;
        const trend = trendMap.get(month) ?? { total: 0, count: 0 };
        trend.total += bill.total;
        trend.count += 1;
        trendMap.set(month, trend);
      }

      const monthlyTrend: MonthlySpending[] = [];
      if (trendRange.start !== null && trendRange.end !== null) {
        for (
          let month = trendRange.start;
          month <= trendRange.end;
          month += 1
        ) {
          const value = trendMap.get(month) ?? { total: 0, count: 0 };
          monthlyTrend.push({
            key: monthKey(month),
            label: formatMonthLabel(month),
            ...value,
          });
        }
      }

      return {
        currency,
        total,
        count: currencyBills.length,
        average: total / currencyBills.length,
        highest: currencyBills.reduce<SavedBill | null>(
          (highest, bill) =>
            highest === null || bill.total > highest.total ? bill : highest,
          null
        ),
        categories: [...categoryMap.entries()]
          .map(([name, value]) => ({
            name,
            ...value,
            percentage: total > 0 ? (value.total / total) * 100 : 0,
          }))
          .sort((left, right) => right.total - left.total),
        monthlyTrend,
      };
    })
    .filter((value): value is CurrencyAnalytics => value !== null);

  return {
    period,
    startMonth:
      range.start === null ? null : monthKey(range.start),
    endMonth: range.end === null ? null : monthKey(range.end),
    transactionCount: filteredBills.length,
    currencies,
  };
}

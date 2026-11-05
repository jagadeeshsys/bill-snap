import type { SavedBill } from "./storage";

export interface MonthlyBillSummary {
  bills: SavedBill[];
  count: number;
  total: number;
  categoryTotals: Record<string, number>;
}

export function parseBillDate(value: string): Date | null {
  const dayFirstMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(
    value.trim()
  );
  const isoMatch =
    /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value.trim());

  if (dayFirstMatch) {
    const [, dayText, monthText, yearText] = dayFirstMatch;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);

    return makeValidatedDate(year, month, day);
  }

  if (isoMatch) {
    const [, yearText, monthText, dayText] = isoMatch;
    return makeValidatedDate(
      Number(yearText),
      Number(monthText),
      Number(dayText)
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function makeValidatedDate(
  year: number,
  month: number,
  day: number
): Date | null {
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function summarizeMonthlyBills(
  bills: SavedBill[],
  month: number,
  year: number
): MonthlyBillSummary {
  const monthlyBills = bills.filter((bill) => {
    const date = parseBillDate(bill.date);

    return (
      date !== null &&
      date.getMonth() === month &&
      date.getFullYear() === year
    );
  });

  const categoryTotals: Record<string, number> = {};
  const total = monthlyBills.reduce((sum, bill) => {
    categoryTotals[bill.category] =
      (categoryTotals[bill.category] ?? 0) + bill.total;
    return sum + bill.total;
  }, 0);

  return {
    bills: monthlyBills,
    count: monthlyBills.length,
    total,
    categoryTotals,
  };
}

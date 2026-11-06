import { parseBillDate } from "./dashboardMetrics.ts";
import type { SavedBill } from "./storage";

export type ExpenseSortOrder =
  | "newest"
  | "oldest"
  | "highest"
  | "lowest"
  | "merchant";

export interface ExpenseQuery {
  search?: string;
  category?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  sortBy?: ExpenseSortOrder;
}

function toLocalDateKey(value: string): string | null {
  const date = parseBillDate(value);
  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOrderValue(bill: SavedBill): number {
  const transactionDate = parseBillDate(bill.date);
  if (transactionDate) return transactionDate.getTime();

  const savedDate = Date.parse(bill.savedAt);
  return Number.isNaN(savedDate) ? 0 : savedDate;
}

function newestFirst(left: SavedBill, right: SavedBill): number {
  return dateOrderValue(right) - dateOrderValue(left);
}

export function queryBills(
  bills: SavedBill[],
  query: ExpenseQuery = {}
): SavedBill[] {
  const search = query.search?.trim().toLocaleLowerCase() ?? "";

  const filtered = bills.filter((bill) => {
    if (
      search &&
      !bill.merchant.toLocaleLowerCase().includes(search)
    ) {
      return false;
    }

    if (query.category && bill.category !== query.category) return false;

    if (query.fromDate || query.toDate) {
      const billDate = toLocalDateKey(bill.date);
      if (!billDate) return false;
      if (query.fromDate && billDate < query.fromDate) return false;
      if (query.toDate && billDate > query.toDate) return false;
    }

    if (query.minAmount != null && bill.total < query.minAmount) return false;
    if (query.maxAmount != null && bill.total > query.maxAmount) return false;
    return true;
  });

  const sortBy = query.sortBy ?? "newest";
  return filtered.sort((left, right) => {
    switch (sortBy) {
      case "oldest":
        return dateOrderValue(left) - dateOrderValue(right);
      case "highest":
        return right.total - left.total || newestFirst(left, right);
      case "lowest":
        return left.total - right.total || newestFirst(left, right);
      case "merchant":
        return (
          left.merchant.localeCompare(right.merchant, undefined, {
            sensitivity: "base",
          }) || newestFirst(left, right)
        );
      case "newest":
      default:
        return newestFirst(left, right);
    }
  });
}

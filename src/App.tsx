
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Camera,
  Upload,
  ReceiptText,
  TrendingUp,
  Utensils,
  ShoppingBasket,
  Zap,
  Car,
  LayoutDashboard,
  ScanLine,
  ListFilter,
  WalletCards,
  CalendarDays,
  ChevronRight,
  ChartNoAxesCombined,
  Settings,
  ArrowUpRight,
  X,
  CheckCircle,
  LoaderCircle,
  AlertCircle,
  Trash2,
  Plus,
  Search,
  Pencil,
  RotateCcw,
  Download,
  FileUp,
  UserRound,
} from "lucide-react";

import {
  processImage,
  type ProcessedImage,
} from "./services/image";

import { processBillImage } from "./services/billProcessor";
import {
  markFieldUserCorrected,
  type ExtractedBill,
  type ExpenseCategory,
  type CurrencyCode,
} from "./services/extractor";
import {
  deleteBill,
  getAllBills,
  ProbableDuplicateBillError,
  saveBill,
  updateBill,
  getLocalSettings,
  saveLocalSettings,
  resetLocalSettings,
  restoreLocalData,
  normalizeSavedBillDate,
} from "./services/storage";
import type { SavedBill } from "./services/storage";
import {
  parseBillDate,
  summarizeMonthlyBills,
} from "./services/dashboardMetrics";
import {
  queryBills,
  type ExpenseSortOrder,
} from "./services/expenseManagement";
import {
  calculateSpendingAnalytics,
  type AnalyticsPeriod,
} from "./services/analytics";
import {
  createDefaultLocalSettings,
  updatePreferences,
  updateProfile,
  type Appearance,
  type DateFormat,
  type LocalAppSettings,
} from "./services/localSettings";
import {
  buildTransactionsCsv,
  createLocalBackup,
  parseLocalBackup,
  summarizeRestore,
  type LocalBackup,
  type RestoreSummary,
} from "./services/backup";
import type { OCRResult } from "./services/ocrEvidence";

import "./App.css";

const categoryOptions: ExpenseCategory[] = [
  "Food",
  "Groceries",
  "Utilities",
  "Transport",
  "Shopping",
  "Healthcare",
  "Entertainment",
  "Other",
];

const categoryColors: Record<string, string> = {
  Food: "#F59E0B",
  Groceries: "#10B981",
  Utilities: "#6366F1",
  Transport: "#0EA5E9",
  Shopping: "#EC4899",
  Healthcare: "#14B8A6",
  Entertainment: "#8B5CF6",
  Other: "#94A3B8",
};

const categoryIcons: Record<string, typeof Utensils> = {
  Food: Utensils,
  Groceries: ShoppingBasket,
  Utilities: Zap,
  Transport: Car,
};

interface BillEditDraft {
  merchant: string;
  date: string;
  total: string;
  category: string;
}

function toDateInputValue(value: string): string {
  const date = parseBillDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSavedBillAmount(bill: SavedBill): string {
  if (!bill.currency) {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(bill.total);
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: bill.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bill.total);
}

function formatAnalyticsAmount(
  amount: number,
  currency: string | null
): string {
  if (!currency) {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getAnalyticsPeriodLabel(period: AnalyticsPeriod): string {
  switch (period) {
    case "this-month":
      return "This month";
    case "previous-month":
      return "Previous month";
    case "last-3-months":
      return "Last 3 months";
    case "this-year":
      return "This year";
    case "all-time":
      return "All time";
  }
}

function formatBillDate(value: string, format: DateFormat): string {
  const date = parseBillDate(value);
  if (!date) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  switch (format) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "DD/MM/YYYY":
    default:
      return `${day}/${month}/${year}`;
  }
}

function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getFieldStatus(field: {
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  reviewed?: boolean;
  userCorrected?: boolean;
}): string {
  if (field.userCorrected) {
    return `User-corrected · original extraction confidence: ${field.confidence}`;
  }

  if (field.reviewed) {
    return `Reviewed · extraction confidence: ${field.confidence}`;
  }

  return field.needsReview
    ? `Needs attention · extraction confidence: ${field.confidence}`
    : `Extraction confidence: ${field.confidence}`;
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const profileImageInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] =
    useState<ProcessedImage | null>(null);

  const [imageError, setImageError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("Dashboard");

  const [billData, setBillData] = useState<ExtractedBill | null>(null);
  const [totalInput, setTotalInput] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrEvidence, setOcrEvidence] = useState<OCRResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [duplicateWarning, setDuplicateWarning] =
    useState<SavedBill | null>(null);

  const [bills, setBills] = useState<SavedBill[]>([]);
  const [isLoadingBills, setIsLoadingBills] = useState(true);
  const [merchantSearch, setMerchantSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [minimumAmountFilter, setMinimumAmountFilter] = useState("");
  const [maximumAmountFilter, setMaximumAmountFilter] = useState("");
  const [sortOrder, setSortOrder] =
    useState<ExpenseSortOrder>("newest");
  const [analyticsPeriod, setAnalyticsPeriod] =
    useState<AnalyticsPeriod>("this-month");
  const [editingBill, setEditingBill] = useState<SavedBill | null>(null);
  const [editDraft, setEditDraft] = useState<BillEditDraft | null>(null);
  const [isUpdatingBill, setIsUpdatingBill] = useState(false);
  const [settings, setSettings] = useState<LocalAppSettings>(
    () => createDefaultLocalSettings()
  );
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<LocalBackup | null>(null);
  const [restoreSummary, setRestoreSummary] =
    useState<RestoreSummary | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  useEffect(() => {
    loadBills();
    loadSettings();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.preferences.appearance;
  }, [settings.preferences.appearance]);

  async function loadBills() {
    try {
      const savedBills = await getAllBills();
      setBills(savedBills);
    } catch {
      setImageError("Unable to load saved bills from this browser.");
    } finally {
      setIsLoadingBills(false);
    }
  }

  async function loadSettings() {
    try {
      setSettings(await getLocalSettings());
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to load local profile and preferences."
      );
    } finally {
      setIsLoadingSettings(false);
    }
  }

  const openCamera = () => {
    if (!fileInput.current) return;
    fileInput.current.setAttribute("capture", "environment");
    fileInput.current.click();
  };

  const openGallery = () => {
    if (!fileInput.current) return;
    fileInput.current.removeAttribute("capture");
    fileInput.current.click();
  };

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setImageError("");
    setSaveMessage("");
    setDuplicateWarning(null);
    setBillData(null);
    setOcrConfidence(null);
    setOcrEvidence(null);
    setProgress(0);
    setIsProcessing(true);

    try {
      const result = await processImage(file);

      setSelectedImage((previous) => {
        if (previous) URL.revokeObjectURL(previous.previewUrl);
        return result;
      });

      const processed = await processBillImage(
        result.file,
        setProgress,
        file,
        {
          width: result.originalWidth,
          height: result.originalHeight,
        }
      );

      setOcrEvidence(processed.ocrEvidence);

      if (processed.classification?.status === "uncertain") {
        setImageError(
          "We couldn't confidently recognize a receipt in this image. Try a clearer, full-frame photo of the bill."
        );
        setOcrConfidence(processed.ocrConfidence);
        return;
      }

      if (!processed.success || !processed.data) {
        throw new Error(processed.error || "Bill processing failed.");
      }

      setOcrConfidence(processed.ocrConfidence);

      setBillData(processed.data);
      setTotalInput(processed.data.total.value?.toFixed(2) ?? "");
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to process the selected image."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const removeImage = () => {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
    }

    setSelectedImage(null);
    setBillData(null);
    setTotalInput("");
    setImageError("");
    setSaveMessage("");
    setDuplicateWarning(null);
    setProgress(0);
    setOcrConfidence(null);
    setOcrEvidence(null);
  };

  const updateField = (
    field: "merchant" | "date" | "total" | "category",
    value: string | number | ExpenseCategory | null
  ) => {
    setBillData((previous) => {
      if (!previous) return previous;

      switch (field) {
        case "merchant":
          return {
            ...previous,
            merchant: markFieldUserCorrected(
              previous.merchant,
              value as string | null
            ),
          };

        case "date":
          return {
            ...previous,
            date: markFieldUserCorrected(
              previous.date,
              value as string | null
            ),
          };

        case "total":
          return {
            ...previous,
            total: markFieldUserCorrected(
              previous.total,
              value as number | null
            ),
          };

        case "category":
          return {
            ...previous,
            category: markFieldUserCorrected(
              previous.category,
              value as ExpenseCategory
            ),
          };
      }
    });
  };

  const updateCurrency = (code: CurrencyCode | null) => {
    setBillData((previous) =>
      previous
        ? {
            ...previous,
            currency: {
              ...previous.currency,
              code,
              confidence: code ? "high" : "low",
              reason: code
                ? "Currency selected during receipt review."
                : "Currency is unavailable; no currency was selected.",
            },
          }
        : previous
    );
  };


  const saveCurrentBill = async (allowProbableDuplicate = false) => {
    if (!billData || !selectedImage) return;

    setImageError("");
    setSaveMessage("");
    setIsSaving(true);

    try {
      await saveBill(billData, selectedImage.originalName, {
        allowProbableDuplicate,
      });
      await loadBills();

      setDuplicateWarning(null);
      setSaveMessage("Bill saved successfully.");
      removeImage();
    } catch (error) {
      if (error instanceof ProbableDuplicateBillError) {
        setDuplicateWarning(error.existingBill);
        return;
      }

      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to save this bill."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSavedBill = async (bill: SavedBill) => {
    const confirmed = window.confirm(
      `Delete the saved bill from ${bill.merchant} dated ${bill.date}?`
    );

    if (!confirmed) return;

    setImageError("");
    setSaveMessage("");

    try {
      await deleteBill(bill.id);
      await loadBills();
      setSaveMessage("Bill deleted.");
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to delete this bill."
      );
    }
  };

  const beginEditingBill = (bill: SavedBill) => {
    setImageError("");
    setSaveMessage("");
    setEditingBill(bill);
    setEditDraft({
      merchant: bill.merchant,
      date: toDateInputValue(bill.date),
      total: String(bill.total),
      category: bill.category,
    });
  };

  const saveBillEdits = async () => {
    if (!editingBill || !editDraft) return;

    const total = Number(editDraft.total);
    if (
      !editDraft.merchant.trim() ||
      !editDraft.date ||
      !normalizeSavedBillDate(editDraft.date) ||
      !Number.isFinite(total) ||
      total <= 0
    ) {
      setImageError("Enter a merchant, valid date, and amount greater than zero.");
      return;
    }

    setImageError("");
    setSaveMessage("");
    setIsUpdatingBill(true);

    try {
      await updateBill({
        ...editingBill,
        merchant: editDraft.merchant.trim(),
        date: normalizeSavedBillDate(editDraft.date)!,
        total,
        category: editDraft.category,
      });
      await loadBills();
      setEditingBill(null);
      setEditDraft(null);
      setSaveMessage("Transaction updated.");
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to update this saved receipt."
      );
    } finally {
      setIsUpdatingBill(false);
    }
  };

  const clearTransactionFilters = () => {
    setMerchantSearch("");
    setCategoryFilter("");
    setDateFromFilter("");
    setDateToFilter("");
    setMinimumAmountFilter("");
    setMaximumAmountFilter("");
    setSortOrder("newest");
  };

  const saveSettings = async () => {
    if (
      settings.budget.amount !== null &&
      (!Number.isFinite(settings.budget.amount) || settings.budget.amount <= 0)
    ) {
      setImageError("Monthly budget must be greater than zero or left unset.");
      return;
    }

    setImageError("");
    setSaveMessage("");
    setIsSavingSettings(true);
    try {
      await saveLocalSettings(settings);
      setSaveMessage("Profile and settings saved on this device.");
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to save profile and settings."
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const resetSettings = async () => {
    const confirmed = window.confirm(
      "Reset profile, preferences, and monthly budget to defaults? Saved receipts will not be deleted."
    );
    if (!confirmed) return;

    setImageError("");
    try {
      setSettings(await resetLocalSettings());
      setSaveMessage("Profile and settings reset. Saved receipts were kept.");
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "Unable to reset settings."
      );
    }
  };

  const chooseProfileImage = () => profileImageInput.current?.click();

  const handleProfileImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setImageError("Choose an image smaller than 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setImageError("Unable to read the selected profile image.");
        return;
      }
      setSettings((previous) =>
        updateProfile(previous, { imageDataUrl: reader.result as string })
      );
      setImageError("");
    };
    reader.onerror = () => {
      setImageError("Unable to read the selected profile image.");
    };
    reader.readAsDataURL(file);
  };

  const exportTransactionsCsv = () => {
    const today = new Date();
    const dateStamp = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    downloadTextFile(
      buildTransactionsCsv(bills),
      `bill-snap-transactions-${dateStamp}.csv`,
      "text/csv;charset=utf-8"
    );
    setSaveMessage("Transactions exported as CSV.");
  };

  const exportLocalBackup = () => {
    const backup = createLocalBackup(bills, settings);
    downloadTextFile(
      JSON.stringify(backup, null, 2),
      `bill-snap-backup-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json"
    );
    setSaveMessage("Local backup exported.");
  };

  const handleBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImageError("");
    setSaveMessage("");
    try {
      const parsed = parseLocalBackup(JSON.parse(await file.text()));
      setPendingBackup(parsed);
      setRestoreSummary(summarizeRestore(parsed, bills));
    } catch (error) {
      setPendingBackup(null);
      setRestoreSummary(null);
      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to read this backup file."
      );
    }
  };

  const confirmBackupRestore = async () => {
    if (!pendingBackup || !restoreSummary) return;
    setIsRestoringBackup(true);
    setImageError("");
    try {
      const result = await restoreLocalData(
        pendingBackup.bills,
        pendingBackup.settings
      );
      setSettings(pendingBackup.settings);
      await loadBills();
      setSaveMessage(
        `Backup restored: ${result.added} receipt(s) added, ${result.skipped} skipped. Settings replaced.`
      );
      setPendingBackup(null);
      setRestoreSummary(null);
    } catch (error) {
      setImageError(
        error instanceof Error
          ? `Restore failed. ${error.message}`
          : "Restore failed."
      );
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlySummary = summarizeMonthlyBills(
    bills,
    currentMonth,
    currentYear
  );
  const monthlyAnalytics = calculateSpendingAnalytics(
    bills,
    "this-month"
  );
  const budgetCurrencyAnalytics = monthlyAnalytics.currencies.find(
    (currency) => currency.currency === settings.budget.currency
  );
  const budgetSpent = budgetCurrencyAnalytics?.total ?? 0;
  const hasBudget =
    settings.budget.amount !== null &&
    Number.isFinite(settings.budget.amount) &&
    settings.budget.amount > 0;
  const budgetRemaining =
    !hasBudget
      ? null
      : (settings.budget.amount ?? 0) - budgetSpent;

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const today = new Date();
  const fullDateLabel = formatBillDate(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    settings.preferences.dateFormat
  );
  const spendingAnalytics = calculateSpendingAnalytics(
    bills,
    analyticsPeriod
  );
  const visibleBills = queryBills(bills, {
    search: merchantSearch,
    category: categoryFilter,
    fromDate: dateFromFilter,
    toDate: dateToFilter,
    minAmount: minimumAmountFilter.trim()
      ? Number(minimumAmountFilter)
      : null,
    maxAmount: maximumAmountFilter.trim()
      ? Number(maximumAmountFilter)
      : null,
    sortBy: sortOrder,
  });
  const hasTransactionFilters = Boolean(
    merchantSearch.trim() ||
      categoryFilter ||
      dateFromFilter ||
      dateToFilter ||
      minimumAmountFilter ||
      maximumAmountFilter
  );

  const navigationItems = [
    { label: "Dashboard", icon: LayoutDashboard, target: "dashboard-home" },
    { label: "Scan Receipt", icon: ScanLine, target: "scan-receipt" },
    { label: "Transactions", icon: ListFilter, target: "transactions" },
    { label: "Analytics", icon: ChartNoAxesCombined, target: "analytics" },
    { label: "Settings", icon: Settings, target: "settings" },
  ];

  const navigateTo = (label: string, target: string) => {
    setActiveTab(label);
    document.getElementById(target)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a
          className="brand"
          href="#dashboard-home"
          onClick={() => setActiveTab("Dashboard")}
          aria-label="Bill Snap dashboard"
        >
          <div className="brand-icon">
            <ReceiptText size={21} />
          </div>
          <span className="brand-wordmark">bill<span>snap</span></span>
        </a>

        <p className="sidebar-label">Workspace</p>
        <nav className="sidebar-nav">
          {navigationItems.map(({ label, icon: Icon, target }) => (
            <button
              key={label}
              className={`sidebar-link${activeTab === label ? " active" : ""}`}
              onClick={() => navigateTo(label, target)}
              aria-current={activeTab === label ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Transactions" && bills.length > 0 && (
                <span className="nav-count">{bills.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-indicator" />
            <span>Private on this device</span>
          </div>
          <button
            className="profile-card"
            onClick={() => navigateTo("Settings", "settings")}
            aria-label="Open local profile settings"
          >
            <span className="avatar">
              {settings.profile.imageDataUrl ? (
                <img src={settings.profile.imageDataUrl} alt="" />
              ) : (
                (settings.profile.displayName.trim()[0] ?? "B").toUpperCase()
              )}
            </span>
            <div className="profile-copy">
              <strong>{settings.profile.displayName.trim() || "Local profile"}</strong>
              <span>{settings.profile.email || "Personal workspace"}</span>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-icon">
              <ReceiptText size={19} />
            </div>
            <span className="brand-wordmark">bill<span>snap</span></span>
          </div>
          <div className="topbar-date">
            <CalendarDays size={16} />
            <span>{fullDateLabel}</span>
          </div>
          <button
            className="topbar-scan-button"
            onClick={() => navigateTo("Scan Receipt", "scan-receipt")}
          >
            <Plus size={17} />
            <span>New receipt</span>
          </button>
        </header>

        <main className="dashboard">
          <section className="welcome" id="dashboard-home">
            <div>
              <p className="eyebrow">PERSONAL FINANCE</p>
              <h1>
                {settings.profile.displayName.trim()
                  ? `Welcome back, ${settings.profile.displayName.trim()}`
                  : "Welcome back"}
              </h1>
              <p className="muted">
                Here’s your spending overview for {dateLabel}.
              </p>
            </div>
            <button
              className="primary-action"
              onClick={() => navigateTo("Scan Receipt", "scan-receipt")}
            >
              <ScanLine size={18} />
              <span>Scan a receipt</span>
            </button>
          </section>

          <section className="metric-grid" aria-label="Monthly summary">
            <article className="metric-card spending-metric">
              <div className="metric-topline">
                <span className="metric-icon"><WalletCards size={19} /></span>
                <span className="metric-period">{dateLabel}</span>
              </div>
              <p className="metric-label">Total expenses</p>
              <strong className="metric-value">
                {monthlyAnalytics.currencies.length === 0
                  ? "No spending yet"
                  : monthlyAnalytics.currencies.length === 1
                    ? formatAnalyticsAmount(
                        monthlyAnalytics.currencies[0].total,
                        monthlyAnalytics.currencies[0].currency
                      )
                    : "Separate totals"}
              </strong>
              {monthlyAnalytics.currencies.length > 1 ? (
                <div className="metric-currency-list">
                  {monthlyAnalytics.currencies.map((currency) => (
                    <span key={currency.currency ?? "unavailable"}>
                      {currency.currency ?? "Currency unavailable"}{" "}
                      <strong>
                        {formatAnalyticsAmount(currency.total, currency.currency)}
                      </strong>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="metric-footnote">
                  <TrendingUp size={14} /> Based on saved receipts
                </span>
              )}
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-icon soft-green"><ReceiptText size={19} /></span>
                <span className="metric-context">This month</span>
              </div>
              <p className="metric-label">Receipts saved</p>
              <strong className="metric-value">{monthlySummary.count}</strong>
              <span className="metric-footnote">In your local workspace</span>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-icon soft-blue"><ChartNoAxesCombined size={19} /></span>
                <span className="metric-context">This month</span>
              </div>
              <p className="metric-label">Average transaction</p>
              <strong className="metric-value">
                {monthlyAnalytics.currencies.length === 0
                  ? "—"
                  : monthlyAnalytics.currencies.length === 1
                    ? formatAnalyticsAmount(
                        monthlyAnalytics.currencies[0].average,
                        monthlyAnalytics.currencies[0].currency
                      )
                    : "By currency"}
              </strong>
              {monthlyAnalytics.currencies.length > 1 ? (
                <div className="metric-currency-list">
                  {monthlyAnalytics.currencies.map((currency) => (
                    <span key={currency.currency ?? "unavailable"}>
                      {currency.currency ?? "Currency unavailable"}{" "}
                      <strong>
                        {formatAnalyticsAmount(currency.average, currency.currency)}
                      </strong>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="metric-footnote">
                  {monthlySummary.count > 0
                    ? "Across saved receipts"
                    : "Available after your first receipt"}
                </span>
              )}
            </article>
            <article className="metric-card budget-metric">
              <div className="metric-topline">
                <span className="metric-icon soft-amber"><TrendingUp size={19} /></span>
                <span className="metric-context">
                  {!hasBudget ? "Monthly plan" : settings.budget.currency}
                </span>
              </div>
              <p className="metric-label">Budget overview</p>
              {!hasBudget ? (
                <>
                  <strong className="metric-value budget-empty">No budget set</strong>
                  <button
                    className="budget-edit-link"
                    onClick={() => navigateTo("Settings", "settings")}
                  >
                    Set a monthly budget
                  </button>
                </>
              ) : (
                <>
                  <strong className="metric-value">
                    {formatAnalyticsAmount(settings.budget.amount ?? 0, settings.budget.currency)}
                  </strong>
                  <span className="metric-footnote budget-progress-caption">
                    {formatAnalyticsAmount(budgetSpent, settings.budget.currency)} spent
                    {" · "}
                    {budgetRemaining !== null && budgetRemaining >= 0
                      ? `${formatAnalyticsAmount(budgetRemaining, settings.budget.currency)} remaining`
                      : `${formatAnalyticsAmount(Math.abs(budgetRemaining ?? 0), settings.budget.currency)} over budget`}
                  </span>
                  <div
                    className={`progress-track budget-progress${budgetRemaining !== null && budgetRemaining < 0 ? " exceeded" : ""}`}
                    role="progressbar"
                    aria-label={`${settings.budget.currency} monthly budget used`}
                    aria-valuenow={Math.min(
                      100,
                      (budgetSpent / (settings.budget.amount ?? 1)) * 100
                    )}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(100, (budgetSpent / (settings.budget.amount ?? 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  {budgetRemaining !== null && budgetRemaining < 0 && (
                    <span className="budget-warning" role="status">
                      Monthly budget exceeded
                    </span>
                  )}
                  <button
                    className="budget-edit-link"
                    onClick={() => navigateTo("Settings", "settings")}
                  >
                    Edit budget
                  </button>
                </>
              )}
            </article>
          </section>

          <section className="overview-grid">
            <section className="content-card category-section">
              <div className="section-heading">
                <div>
                  <p className="card-kicker">MONTHLY BREAKDOWN</p>
                  <h2>Spending by category</h2>
                </div>
                <span className="card-period">{dateLabel}</span>
              </div>
              {monthlyAnalytics.currencies.length === 0 ? (
                <div className="empty-state compact-empty">
                  <div className="empty-icon"><ChartNoAxesCombined size={20} /></div>
                  <strong>No spending to show yet</strong>
                  <p>Saved receipts will appear in this breakdown.</p>
                </div>
              ) : (
                <div className="category-list">
                  {monthlyAnalytics.currencies.map((currency) => (
                    <div className="category-currency-group" key={currency.currency ?? "unavailable"}>
                      <p className="category-currency-heading">
                        {currency.currency ?? "Currency unavailable"}
                      </p>
                      {currency.categories.map((category) => {
                    const Icon = categoryIcons[category.name] ?? ReceiptText;
                    const color = categoryColors[category.name] ?? "#94A3B8";
                    return (
                      <div className="category-row" key={category.name}>
                        <span
                          className="category-icon"
                          style={{ color, backgroundColor: `${color}14` }}
                        >
                          <Icon size={17} />
                        </span>
                        <div className="category-main">
                          <div className="category-info">
                            <span>{category.name}</span>
                            <strong>
                              {formatAnalyticsAmount(category.total, currency.currency)}
                            </strong>
                          </div>
                          <div
                            className="progress-track"
                            role="progressbar"
                            aria-label={`${category.name} share of monthly spending`}
                            aria-valuenow={category.percentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className="progress-fill"
                              style={{
                                width: `${category.percentage}%`,
                                background: color,
                              }}
                            />
                          </div>
                        </div>
                        <span className="category-percent">
                          {Math.round(category.percentage)}%
                        </span>
                      </div>
                    );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="content-card scan-section" id="scan-receipt">
              <div className="section-heading">
                <div>
                  <p className="card-kicker">QUICK ACTION</p>
                  <h2>Scan a receipt</h2>
                  <p className="muted">Capture or upload to add a new expense.</p>
                </div>
              </div>
              <div className="upload-dropzone">
                <span className="upload-illustration"><ReceiptText size={24} /></span>
                <strong>Bring your receipt into focus</strong>
                <span>JPG, PNG or WebP image</span>
                <button
                  className="upload-button"
                  onClick={openGallery}
                  disabled={isProcessing || isSaving}
                >
                  <Upload size={17} />
                  <span>Choose an image</span>
                </button>
              </div>

              <div className="scan-actions">
                <button
                  className="scan-button"
                  onClick={openCamera}
                  disabled={isProcessing || isSaving}
                >
                  <Camera size={18} />
                  <span>Use camera</span>
                </button>
                <button
                  className="upload-button secondary-upload"
                  onClick={openGallery}
                  disabled={isProcessing || isSaving}
                >
                  <Upload size={18} />
                  <span>Browse files</span>
                </button>
              </div>

              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                hidden
                onChange={handleImage}
              />
            </section>
          </section>

          <section className="analytics-section" id="analytics">
            <div className="analytics-heading">
              <div>
                <p className="eyebrow">SPENDING INSIGHTS</p>
                <h2>Analytics</h2>
                <p className="muted">
                  Explore saved receipt activity without mixing currencies.
                </p>
              </div>
              <label className="analytics-period">
                <span>Date range</span>
                <select
                  value={analyticsPeriod}
                  onChange={(event) =>
                    setAnalyticsPeriod(event.target.value as AnalyticsPeriod)
                  }
                >
                  <option value="this-month">This month</option>
                  <option value="previous-month">Previous month</option>
                  <option value="last-3-months">Last 3 months</option>
                  <option value="this-year">This year</option>
                  <option value="all-time">All time</option>
                </select>
              </label>
            </div>

            <p className="analytics-period-note">
              {getAnalyticsPeriodLabel(analyticsPeriod)} ·{" "}
              {spendingAnalytics.transactionCount}{" "}
              {spendingAnalytics.transactionCount === 1
                ? "transaction"
                : "transactions"}
            </p>

            {spendingAnalytics.currencies.length === 0 ? (
              <div className="content-card analytics-empty">
                <div className="empty-icon">
                  <ChartNoAxesCombined size={21} />
                </div>
                <strong>No spending data in this period</strong>
                <p>Saved receipts will appear here when available.</p>
              </div>
            ) : (
              <div className="analytics-currency-list">
                {spendingAnalytics.currencies.map((currencyAnalytics) => {
                  const currencyLabel =
                    currencyAnalytics.currency ?? "Currency unavailable";
                  const maxMonthlyTotal = Math.max(
                    0,
                    ...currencyAnalytics.monthlyTrend.map((month) => month.total)
                  );
                  const highestAmount = currencyAnalytics.highest
                    ? formatAnalyticsAmount(
                        currencyAnalytics.highest.total,
                        currencyAnalytics.currency
                      )
                    : "—";

                  return (
                    <section
                      className="analytics-currency-panel"
                      key={currencyLabel}
                      aria-label={`${currencyLabel} analytics`}
                    >
                      <div className="currency-panel-heading">
                        <div>
                          <p className="card-kicker">CURRENCY</p>
                          <h3>{currencyLabel}</h3>
                        </div>
                        {currencyAnalytics.currency && (
                          <span className="currency-code-badge">
                            {currencyAnalytics.currency}
                          </span>
                        )}
                      </div>

                      <div className="analytics-summary-grid">
                        <article className="analytics-metric-card">
                          <span>Total spending</span>
                          <strong>
                            {formatAnalyticsAmount(
                              currencyAnalytics.total,
                              currencyAnalytics.currency
                            )}
                          </strong>
                        </article>
                        <article className="analytics-metric-card">
                          <span>Transactions</span>
                          <strong>{currencyAnalytics.count}</strong>
                        </article>
                        <article className="analytics-metric-card">
                          <span>Average transaction</span>
                          <strong>
                            {formatAnalyticsAmount(
                              currencyAnalytics.average,
                              currencyAnalytics.currency
                            )}
                          </strong>
                        </article>
                        <article className="analytics-metric-card">
                          <span>Highest transaction</span>
                          <strong>{highestAmount}</strong>
                          {currencyAnalytics.highest && (
                            <small>{currencyAnalytics.highest.merchant}</small>
                          )}
                        </article>
                      </div>

                      <div className="analytics-detail-grid">
                        <section className="analytics-detail-card">
                          <div className="analytics-card-heading">
                            <div>
                              <p className="card-kicker">CATEGORY BREAKDOWN</p>
                              <h4>Where it went</h4>
                            </div>
                          </div>
                          {currencyAnalytics.categories.length === 0 ? (
                            <p className="analytics-no-data">
                              No category activity in this period.
                            </p>
                          ) : (
                            <div className="analytics-category-list">
                              {currencyAnalytics.categories.map((category) => {
                                const color =
                                  categoryColors[category.name] ?? "#94A3B8";
                                return (
                                  <div
                                    className="analytics-category-row"
                                    key={category.name}
                                  >
                                    <div className="analytics-category-title">
                                      <strong>{category.name}</strong>
                                      <span>
                                        {category.count}{" "}
                                        {category.count === 1
                                          ? "transaction"
                                          : "transactions"}
                                      </span>
                                    </div>
                                    <div className="analytics-category-total">
                                      <strong>
                                        {formatAnalyticsAmount(
                                          category.total,
                                          currencyAnalytics.currency
                                        )}
                                      </strong>
                                      <span>
                                        {category.percentage.toFixed(1)}%
                                      </span>
                                    </div>
                                    <div
                                      className="progress-track"
                                      role="progressbar"
                                      aria-label={`${category.name}: ${category.percentage.toFixed(1)}% of ${currencyLabel} spending`}
                                      aria-valuenow={category.percentage}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                    >
                                      <div
                                        className="progress-fill"
                                        style={{
                                          width: `${category.percentage}%`,
                                          background: color,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>

                        <section className="analytics-detail-card">
                          <div className="analytics-card-heading">
                            <div>
                              <p className="card-kicker">MONTHLY TREND</p>
                              <h4>Spending over time</h4>
                            </div>
                          </div>
                          {currencyAnalytics.monthlyTrend.length === 0 ? (
                            <p className="analytics-no-data">
                              No dated receipts to chart.
                            </p>
                          ) : (
                            <div
                              className="monthly-trend-chart"
                              role="group"
                              aria-label={`${currencyLabel} monthly spending trend`}
                            >
                              {currencyAnalytics.monthlyTrend.map((month) => {
                                const barHeight =
                                  maxMonthlyTotal > 0
                                    ? (month.total / maxMonthlyTotal) * 100
                                    : 0;
                                return (
                                  <div
                                    className="trend-month"
                                    key={month.key}
                                    aria-label={`${month.label}: ${formatAnalyticsAmount(month.total, currencyAnalytics.currency)}, ${month.count} transactions`}
                                  >
                                    <span className="trend-month-total">
                                      {month.total > 0
                                        ? formatAnalyticsAmount(
                                            month.total,
                                            currencyAnalytics.currency
                                          )
                                        : "—"}
                                    </span>
                                    <div className="trend-bar-area">
                                      <div
                                        className="trend-bar"
                                        style={{ height: `${barHeight}%` }}
                                      />
                                    </div>
                                    <span className="trend-month-label">
                                      {month.label}
                                    </span>
                                    <span className="trend-month-count">
                                      {month.count}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </section>

          <section className="settings-section" id="settings">
            <div className="analytics-heading settings-page-heading">
              <div>
                <p className="eyebrow">ON-DEVICE CONTROLS</p>
                <h2>Profile & settings</h2>
                <p className="muted">
                  Your information and preferences stay on this device.
                </p>
              </div>
            </div>

            {isLoadingSettings ? (
              <div className="content-card list-state" role="status">
                <LoaderCircle className="spin" size={18} />
                <span>Loading local settings…</span>
              </div>
            ) : (
              <div className="settings-grid">
                <section className="content-card settings-card">
                  <div className="section-heading settings-card-heading">
                    <div>
                      <p className="card-kicker">LOCAL PROFILE</p>
                      <h2>Your profile</h2>
                    </div>
                  </div>

                  <div className="profile-editor">
                    <div className="profile-image-preview">
                      {settings.profile.imageDataUrl ? (
                        <img src={settings.profile.imageDataUrl} alt="Profile preview" />
                      ) : (
                        <UserRound size={28} />
                      )}
                    </div>
                    <div className="profile-image-actions">
                      <strong>Profile image</strong>
                      <span>Optional · maximum 2 MB</span>
                      <div className="profile-image-buttons">
                        <button className="upload-button" onClick={chooseProfileImage}>
                          <Upload size={15} /> Choose image
                        </button>
                        {settings.profile.imageDataUrl && (
                          <button
                            className="clear-filters-button"
                            onClick={() =>
                              setSettings((previous) =>
                                updateProfile(previous, { imageDataUrl: null })
                              )
                            }
                          >
                            Remove image
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <input
                    ref={profileImageInput}
                    className="visually-hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleProfileImage}
                    tabIndex={-1}
                    aria-label="Choose a profile image"
                  />

                  <label className="settings-field">
                    <span>Display name <small>Optional</small></span>
                    <input
                      type="text"
                      autoComplete="name"
                      value={settings.profile.displayName}
                      placeholder="Enter a display name"
                      onChange={(event) =>
                        setSettings((previous) =>
                          updateProfile(previous, {
                            displayName: event.target.value,
                          })
                        )
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Email address <small>Optional</small></span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={settings.profile.email}
                      placeholder="name@example.com"
                      onChange={(event) =>
                        setSettings((previous) =>
                          updateProfile(previous, { email: event.target.value })
                        )
                      }
                    />
                  </label>
                </section>

                <section className="content-card settings-card">
                  <div className="section-heading settings-card-heading">
                    <div>
                      <p className="card-kicker">APP PREFERENCES</p>
                      <h2>Preferences</h2>
                    </div>
                  </div>
                  <label className="settings-field">
                    <span>Default currency</span>
                    <select
                      value={settings.preferences.defaultCurrency}
                      onChange={(event) =>
                        setSettings((previous) =>
                          updatePreferences(previous, {
                            defaultCurrency: event.target.value as LocalAppSettings["preferences"]["defaultCurrency"],
                          })
                        )
                      }
                    >
                      <option value="INR">INR · Indian Rupee</option>
                      <option value="GBP">GBP · Pound Sterling</option>
                      <option value="USD">USD · US Dollar</option>
                      <option value="EUR">EUR · Euro</option>
                    </select>
                    <small>For future manual entries only. Existing receipts are unchanged.</small>
                  </label>
                  <label className="settings-field">
                    <span>Date format</span>
                    <select
                      value={settings.preferences.dateFormat}
                      onChange={(event) =>
                        setSettings((previous) =>
                          updatePreferences(previous, {
                            dateFormat: event.target.value as DateFormat,
                          })
                        )
                      }
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Appearance</span>
                    <select
                      value={settings.preferences.appearance}
                      onChange={(event) =>
                        setSettings((previous) =>
                          updatePreferences(previous, {
                            appearance: event.target.value as Appearance,
                          })
                        )
                      }
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                    <small>Theme changes preview immediately and persist when saved.</small>
                  </label>
                </section>

                <section className="content-card settings-card budget-settings-card">
                  <div className="section-heading settings-card-heading">
                    <div>
                      <p className="card-kicker">SPENDING PLAN</p>
                      <h2>Monthly budget</h2>
                    </div>
                  </div>
                  <div className="budget-settings-fields">
                    <label className="settings-field">
                      <span>Budget amount <small>Optional</small></span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={settings.budget.amount ?? ""}
                        placeholder="No budget set"
                        onChange={(event) =>
                          setSettings((previous) => ({
                            ...previous,
                            budget: {
                              ...previous.budget,
                              amount: event.target.value === ""
                                ? null
                                : Number(event.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="settings-field">
                      <span>Budget currency</span>
                      <select
                        value={settings.budget.currency}
                        onChange={(event) =>
                          setSettings((previous) => ({
                            ...previous,
                            budget: {
                              ...previous.budget,
                              currency: event.target.value as LocalAppSettings["budget"]["currency"],
                            },
                          }))
                        }
                      >
                        <option value="INR">INR</option>
                        <option value="GBP">GBP</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </label>
                  </div>
                  <p className="settings-explanation">
                    The budget compares only receipts with this exact currency. Changing it does not convert existing receipts.
                  </p>
                  {hasBudget && budgetRemaining !== null && (
                    <div className="budget-settings-preview">
                      <span>
                        This month in {settings.budget.currency}:{" "}
                        {formatAnalyticsAmount(budgetSpent, settings.budget.currency)} spent
                      </span>
                      <strong className={budgetRemaining < 0 ? "over-budget-text" : ""}>
                        {budgetRemaining < 0
                          ? `${formatAnalyticsAmount(Math.abs(budgetRemaining), settings.budget.currency)} over budget`
                          : `${formatAnalyticsAmount(budgetRemaining, settings.budget.currency)} remaining`}
                      </strong>
                    </div>
                  )}
                </section>

                <section className="content-card settings-card data-tools-card">
                  <div className="section-heading settings-card-heading">
                    <div>
                      <p className="card-kicker">LOCAL DATA</p>
                      <h2>Export & backup</h2>
                    </div>
                  </div>
                  <p className="settings-explanation">
                    Export files are generated in your browser and are not uploaded.
                  </p>
                  <div className="data-tool-actions">
                    <button className="upload-button" onClick={exportTransactionsCsv}>
                      <Download size={16} /> Export transactions CSV
                    </button>
                    <button className="upload-button" onClick={exportLocalBackup}>
                      <Download size={16} /> Export full JSON backup
                    </button>
                    <button
                      className="upload-button"
                      onClick={() => backupInput.current?.click()}
                    >
                      <FileUp size={16} /> Select backup to restore
                    </button>
                    <input
                      ref={backupInput}
                      className="visually-hidden"
                      type="file"
                      accept="application/json,.json"
                      onChange={handleBackupFile}
                      tabIndex={-1}
                      aria-label="Select a JSON backup"
                    />
                  </div>
                  <p className="settings-explanation restore-policy">
                    Restore adds non-duplicate receipts and skips matching records. It replaces profile, preferences, and budget only after confirmation; it never silently overwrites receipt records.
                  </p>
                </section>
              </div>
            )}

            <div className="settings-page-actions">
              <button
                className="scan-button"
                onClick={saveSettings}
                disabled={isLoadingSettings || isSavingSettings || isRestoringBackup}
              >
                {isSavingSettings
                  ? <LoaderCircle className="spin" size={17} />
                  : <CheckCircle size={17} />}
                {isSavingSettings ? "Saving…" : "Save profile & settings"}
              </button>
              <button
                className="upload-button reset-settings-button"
                onClick={resetSettings}
                disabled={isSavingSettings || isRestoringBackup}
              >
                Reset to defaults
              </button>
            </div>
          </section>

          {pendingBackup && restoreSummary && (
            <div className="edit-dialog-backdrop">
              <section
                className="edit-dialog restore-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="restore-backup-title"
              >
                <div className="edit-dialog-heading">
                  <div>
                    <p className="card-kicker">BACKUP REVIEW</p>
                    <h2 id="restore-backup-title">Confirm local restore</h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Cancel restore"
                    disabled={isRestoringBackup}
                    onClick={() => {
                      setPendingBackup(null);
                      setRestoreSummary(null);
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="settings-explanation">
                  Backup exported {new Date(pendingBackup.exportedAt).toLocaleString()}.
                  Review what will change before confirming.
                </p>
                <div className="restore-summary">
                  <span><strong>{restoreSummary.toAdd}</strong> receipt(s) will be added</span>
                  <span><strong>{restoreSummary.toSkip}</strong> duplicate receipt(s) will be skipped</span>
                  <span>Current profile, preferences, and budget will be replaced</span>
                  <span>Existing receipts will not be overwritten or deleted</span>
                </div>
                <div className="edit-dialog-actions">
                  <button
                    className="upload-button"
                    disabled={isRestoringBackup}
                    onClick={() => {
                      setPendingBackup(null);
                      setRestoreSummary(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="scan-button"
                    disabled={isRestoringBackup}
                    onClick={confirmBackupRestore}
                  >
                    {isRestoringBackup
                      ? <LoaderCircle className="spin" size={17} />
                      : <FileUp size={17} />}
                    {isRestoringBackup ? "Restoring…" : "Confirm restore"}
                  </button>
                </div>
              </section>
            </div>
          )}

        {isProcessing && (
          <div className="preview-panel processing-panel" role="status" aria-live="polite">
            <div className="preview-heading">
              <span className="processing-icon"><LoaderCircle className="spin" size={21} /></span>
              <div>
                <strong>Reading your receipt</strong>
                <p className="muted">Extracting text and identifying your expense.</p>
              </div>
              <span className="processing-percent">{Math.round(progress)}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {imageError && (
          <div className="error-message" role="alert">
            <AlertCircle size={18} />
            {imageError}
          </div>
        )}

        {saveMessage && (
          <div className="success-message" role="status">
            <CheckCircle size={18} />
            {saveMessage}
          </div>
        )}

        {selectedImage && (
          <div className="preview-panel image-preview-panel">
            <div className="preview-heading">
              <div>
                <p className="card-kicker">SELECTED IMAGE</p>
                <strong>Receipt preview</strong>
              </div>
              <button
                onClick={removeImage}
                aria-label="Remove image"
                disabled={isSaving}
                className="icon-button"
              >
                <X size={18} />
              </button>
            </div>

            <img
              src={selectedImage.previewUrl}
              alt="Selected bill preview"
            />

            <p className="muted">
              Resolution: {selectedImage.width} × {selectedImage.height} pixels
            </p>
            <p className="muted">
              Original: {(selectedImage.originalSize / 1024).toFixed(1)} KB
              {" · "}
              Compressed: {(selectedImage.compressedSize / 1024).toFixed(1)} KB
            </p>
          </div>
        )}

        {billData && (
          <section className="preview-panel review-panel">
            <div className="preview-heading">
              <strong>Review extracted details</strong>
              <span className="review-badge">Manual review</span>
            </div>

            <p className="muted">
              Check the extracted values and correct them before saving.
            </p>

            {ocrConfidence !== null && (
              <p className="muted">
                OCR recognition score: {Math.round(ocrConfidence)}%
                {" · "}This is an OCR score, not field accuracy.
              </p>
            )}
            {ocrEvidence && (
              <details className="ocr-diagnostics">
                <summary>OCR diagnostics (advanced)</summary>
                <section className="ocr-diagnostic-section">
                  <h3>Primary OCR text (used for extraction)</h3>
                  <dl className="ocr-pass-metadata">
                    <div>
                      <dt>Source</dt>
                      <dd>{ocrEvidence.primaryFullPage.source}</dd>
                    </div>
                    <div>
                      <dt>Page segmentation mode</dt>
                      <dd>{ocrEvidence.primaryFullPage.pageSegmentationMode}</dd>
                    </div>
                    <div>
                      <dt>Image dimensions</dt>
                      <dd>
                        {ocrEvidence.primaryFullPage.width} ×{" "}
                        {ocrEvidence.primaryFullPage.height}px
                      </dd>
                    </div>
                    <div>
                      <dt>OCR confidence</dt>
                      <dd>{Math.round(ocrEvidence.primaryFullPage.confidence)}%</dd>
                    </div>
                  </dl>
                  <pre className="ocr-diagnostic-text">
                    {ocrEvidence.primaryFullPage.text || "(No text recognized)"}
                  </pre>
                </section>

                {ocrEvidence.passes.some(
                  (pass) => pass !== ocrEvidence.primaryFullPage
                ) && (
                  <section className="ocr-diagnostic-section">
                    <h3>Alternate OCR results (not used for extraction)</h3>
                    <div className="ocr-pass-list">
                      {ocrEvidence.passes
                        .filter(
                          (pass) => pass !== ocrEvidence.primaryFullPage
                        )
                        .map((pass, index) => (
                          <details key={`${pass.source}-${index}`}>
                            <summary>{pass.source}</summary>
                            <dl className="ocr-pass-metadata">
                              <div>
                                <dt>Page segmentation mode</dt>
                                <dd>{pass.pageSegmentationMode}</dd>
                              </div>
                              <div>
                                <dt>Image dimensions</dt>
                                <dd>
                                  {pass.width} × {pass.height}px
                                </dd>
                              </div>
                              <div>
                                <dt>OCR confidence</dt>
                                <dd>{Math.round(pass.confidence)}%</dd>
                              </div>
                              <div>
                                <dt>Source region</dt>
                                <dd>
                                  {pass.region
                                    ? `${Math.round(pass.region.left * 100)}%, ${Math.round(pass.region.top * 100)}%, ${Math.round(pass.region.width * 100)}% × ${Math.round(pass.region.height * 100)}%`
                                    : "Full image"}
                                </dd>
                              </div>
                            </dl>
                            <pre className="ocr-diagnostic-text">
                              {pass.text || "(No text recognized)"}
                            </pre>
                          </details>
                        ))}
                    </div>
                  </section>
                )}

                {ocrEvidence.failures.length > 0 && (
                  <section className="ocr-diagnostic-section">
                    <h3>OCR passes that did not complete</h3>
                    <ul className="ocr-pass-failures">
                      {ocrEvidence.failures.map((failure, index) => (
                        <li key={`${failure.source}-${index}`}>
                          <strong>{failure.source}</strong>: {failure.message}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </details>
            )}

            <div className="review-field">
              <label className="field-label" htmlFor="merchant">
                Merchant
              </label>
              <span className={`field-confidence confidence-${billData.merchant.confidence}${billData.merchant.needsReview ? " needs-attention" : ""}${billData.merchant.userCorrected ? " user-corrected" : ""}`}>
                {getFieldStatus(billData.merchant)}
              </span>
              <input
                id="merchant"
                className={`review-input${billData.merchant.needsReview ? " needs-attention" : ""}`}
                value={billData.merchant.value ?? ""}
                placeholder="Enter merchant name"
                onChange={(event) =>
                  updateField("merchant", event.target.value)
                }
              />
            </div>

            <div className="review-field">
              <label className="field-label" htmlFor="bill-date">
                Bill date
              </label>
              <span className={`field-confidence confidence-${billData.date.confidence}${billData.date.needsReview ? " needs-attention" : ""}${billData.date.userCorrected ? " user-corrected" : ""}`}>
                {getFieldStatus(billData.date)}
              </span>
              <input
                id="bill-date"
                className={`review-input${billData.date.needsReview ? " needs-attention" : ""}`}
                value={billData.date.value ?? ""}
                placeholder="DD-MM-YYYY"
                inputMode="numeric"
                aria-describedby="bill-date-help"
                onChange={(event) =>
                  updateField("date", event.target.value)
                }
              />
              <span id="bill-date-help" className="field-confidence">
                Use DD-MM-YYYY or YYYY-MM-DD.
              </span>
            </div>

            <div className="review-field">
              <label className="field-label" htmlFor="bill-total">
                Total amount
              </label>
              <span className={`field-confidence confidence-${billData.total.confidence}${billData.total.needsReview ? " needs-attention" : ""}${billData.total.userCorrected ? " user-corrected" : ""}`}>
                {getFieldStatus(billData.total)}
              </span>
              <input
                id="bill-total"
                className={`review-input${billData.total.needsReview ? " needs-attention" : ""}`}
                type="text"
                inputMode="decimal"
                value={totalInput}
                placeholder="Enter total amount"
                onFocus={() =>
                  setTotalInput(
                    billData.total.value === null
                      ? ""
                      : String(billData.total.value)
                  )
                }
                onChange={(event) => {
                  const input = event.target.value;
                  setTotalInput(input);
                  updateField(
                    "total",
                    input.trim() === ""
                      ? null
                      : Number(input.replace(/,/g, ""))
                  );
                }}
                onBlur={() => {
                  if (billData.total.value !== null) {
                    setTotalInput(
                      billData.total.value.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    );
                  }
                }}
              />
            </div>

            <div className="review-field">
              <label className="field-label" htmlFor="bill-currency">
                Currency
              </label>
              <span className={`field-confidence confidence-${billData.currency.confidence}`}>
                {billData.currency.code
                  ? `Detected ${billData.currency.code}. Change it if this is wrong.`
                  : "Could not detect a currency. Choose one if it is shown on the receipt."}
              </span>
              <select
                id="bill-currency"
                className="review-input"
                value={billData.currency.code ?? ""}
                onChange={(event) =>
                  updateCurrency(
                    (event.target.value || null) as CurrencyCode | null
                  )
                }
              >
                <option value="">Currency unknown</option>
                <option value="INR">INR — Indian rupee</option>
                <option value="GBP">GBP — Pound sterling</option>
                <option value="USD">USD — US dollar</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>

            <div className="review-field">
              <label className="field-label" htmlFor="bill-category">
                Category
              </label>
              <span className={`field-confidence confidence-${billData.category.confidence}${billData.category.needsReview ? " needs-attention" : ""}${billData.category.userCorrected ? " user-corrected" : ""}`}>
                {getFieldStatus(billData.category)}
              </span>
              <select
                id="bill-category"
                className={`review-input${billData.category.needsReview ? " needs-attention" : ""}`}
                value={billData.category.value ?? "Other"}
                onChange={(event) =>
                  updateField(
                    "category",
                    event.target.value as ExpenseCategory
                  )
                }
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="scan-button save-button"
              onClick={() => saveCurrentBill()}
              disabled={
                isSaving ||
                !billData.merchant.value?.trim() ||
                !normalizeSavedBillDate(billData.date.value ?? "") ||
                billData.total.value === null ||
                !Number.isFinite(billData.total.value) ||
                billData.total.value <= 0
              }
            >
              {isSaving ? (
                <LoaderCircle className="spin" size={20} />
              ) : (
                <CheckCircle size={20} />
              )}
              <span>{isSaving ? "Saving..." : "Confirm & Save Bill"}</span>
            </button>
            {duplicateWarning && (
              <div className="duplicate-warning" role="alert">
                <p>
                  A probable duplicate already exists:{" "}
                  {duplicateWarning.merchant} · {duplicateWarning.date} ·{" "}
                  {formatSavedBillAmount(duplicateWarning)}. Save this bill
                  anyway if it is a separate purchase.
                </p>
                <button
                  className="upload-button"
                  onClick={() => saveCurrentBill(true)}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save anyway"}
                </button>
              </div>
            )}
          </section>
        )}

        <section className="content-card transactions-section" id="transactions">
          <div className="section-heading">
            <div>
              <p className="card-kicker">YOUR ACTIVITY</p>
              <h2>Transaction history</h2>
            </div>
            <span className="transaction-count">
              {visibleBills.length} of {bills.length}
            </span>
          </div>

          <div className="transaction-filters" aria-label="Transaction search and filters">
            <label className="transaction-search">
              <span className="visually-hidden">Search merchant</span>
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={merchantSearch}
                placeholder="Search merchant"
                onChange={(event) => setMerchantSearch(event.target.value)}
              />
            </label>

            <label className="filter-control">
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>

            <label className="filter-control">
              <span>From date</span>
              <input
                type="date"
                value={dateFromFilter}
                max={dateToFilter || undefined}
                onChange={(event) => setDateFromFilter(event.target.value)}
              />
            </label>

            <label className="filter-control">
              <span>To date</span>
              <input
                type="date"
                value={dateToFilter}
                min={dateFromFilter || undefined}
                onChange={(event) => setDateToFilter(event.target.value)}
              />
            </label>

            <label className="filter-control">
              <span>Min amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={minimumAmountFilter}
                placeholder="Any"
                onChange={(event) => setMinimumAmountFilter(event.target.value)}
              />
            </label>

            <label className="filter-control">
              <span>Max amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={maximumAmountFilter}
                placeholder="Any"
                onChange={(event) => setMaximumAmountFilter(event.target.value)}
              />
            </label>

            <label className="filter-control sort-control">
              <span>Sort by</span>
              <select
                value={sortOrder}
                onChange={(event) =>
                  setSortOrder(event.target.value as ExpenseSortOrder)
                }
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest amount</option>
                <option value="lowest">Lowest amount</option>
                <option value="merchant">Merchant name</option>
              </select>
            </label>

            {(hasTransactionFilters || sortOrder !== "newest") && (
              <button
                className="clear-filters-button"
                onClick={clearTransactionFilters}
              >
                <RotateCcw size={14} />
                Clear filters
              </button>
            )}
          </div>

          <div className="transaction-list">
            {isLoadingBills ? (
              <div className="list-state" role="status">
                <LoaderCircle className="spin" size={18} />
                <span>Loading your saved receipts…</span>
              </div>
            ) : bills.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><ReceiptText size={21} /></div>
                <strong>No saved receipts yet</strong>
                <p>Your saved receipts will appear here.</p>
                <button
                  className="text-button"
                  onClick={() => navigateTo("Scan Receipt", "scan-receipt")}
                >
                  Scan your first receipt <ArrowUpRight size={15} />
                </button>
              </div>
            ) : visibleBills.length === 0 ? (
              <div className="empty-state filter-empty">
                <div className="empty-icon"><Search size={20} /></div>
                <strong>No transactions match your search</strong>
                <p>Try changing or clearing the search and filters.</p>
                <button className="text-button" onClick={clearTransactionFilters}>
                  Clear search and filters <RotateCcw size={14} />
                </button>
              </div>
            ) : (
              visibleBills.map((item) => {
                const Icon = categoryIcons[item.category] ?? ReceiptText;
                const colorClass =
                  item.category === "Food" || item.category === "Groceries"
                    ? "green"
                    : item.category === "Transport"
                      ? "blue"
                      : item.category === "Healthcare"
                        ? "teal"
                        : item.category === "Shopping"
                          ? "purple"
                          : "amber";

                return (
                  <div className="transaction-row" key={item.id}>
                    <div className={`transaction-icon ${colorClass}`}>
                      <Icon size={20} />
                    </div>
                    <div className="transaction-details">
                      <strong>{item.merchant}</strong>
                      <span>
                        {formatBillDate(item.date, settings.preferences.dateFormat)}
                        <span className="transaction-dot">·</span>
                        {item.category}
                        <span className="transaction-dot">·</span>
                        {item.currency ?? "Currency unavailable"}
                      </span>
                    </div>
                    <div className="transaction-actions">
                      <strong
                        className="transaction-amount"
                        aria-label={`Amount ${formatSavedBillAmount(item)}${item.currency ? ` ${item.currency}` : ", currency unavailable"}`}
                      >
                        {formatSavedBillAmount(item)}
                      </strong>
                      <button
                        className="edit-bill-button"
                        aria-label={`Edit ${item.merchant} bill dated ${item.date}`}
                        title="Edit transaction"
                        onClick={() => beginEditingBill(item)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="delete-bill-button"
                        aria-label={`Delete ${item.merchant} bill dated ${item.date}`}
                        title="Delete bill"
                        onClick={() => deleteSavedBill(item)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {editingBill && editDraft && (
          <div className="edit-dialog-backdrop">
            <section
              className="edit-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-transaction-title"
            >
              <div className="edit-dialog-heading">
                <div>
                  <p className="card-kicker">TRANSACTION DETAILS</p>
                  <h2 id="edit-transaction-title">Edit transaction</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close edit transaction"
                  disabled={isUpdatingBill}
                  onClick={() => {
                    setEditingBill(null);
                    setEditDraft(null);
                    setImageError("");
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {imageError && (
                <div className="error-message" role="alert">
                  <AlertCircle size={17} />
                  <span>{imageError}</span>
                </div>
              )}

              <label className="edit-field">
                <span>Merchant</span>
                <input
                  autoFocus
                  value={editDraft.merchant}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, merchant: event.target.value })
                  }
                />
              </label>
              <label className="edit-field">
                <span>Date</span>
                <input
                  type="date"
                  value={editDraft.date}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, date: event.target.value })
                  }
                />
              </label>
              <label className="edit-field">
                <span>Amount {editingBill.currency ? `(${editingBill.currency})` : "(currency unavailable)"}</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={editDraft.total}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, total: event.target.value })
                  }
                />
              </label>
              <label className="edit-field">
                <span>Category</span>
                <select
                  value={editDraft.category}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      category: event.target.value,
                    })
                  }
                >
                  {!categoryOptions.includes(editDraft.category as ExpenseCategory) && (
                    <option value={editDraft.category}>{editDraft.category}</option>
                  )}
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <div className="edit-dialog-actions">
                <button
                  className="upload-button"
                  disabled={isUpdatingBill}
                  onClick={() => {
                    setEditingBill(null);
                    setEditDraft(null);
                    setImageError("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="scan-button"
                  disabled={
                    isUpdatingBill ||
                    !editDraft.merchant.trim() ||
                    !parseBillDate(editDraft.date) ||
                    !Number.isFinite(Number(editDraft.total)) ||
                    Number(editDraft.total) <= 0
                  }
                  onClick={saveBillEdits}
                >
                  {isUpdatingBill ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <CheckCircle size={17} />
                  )}
                  {isUpdatingBill ? "Saving…" : "Save changes"}
                </button>
              </div>
            </section>
          </div>
        )}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigationItems.map(({ label, icon: Icon, target }) => (
          <button
            key={label}
            className={`nav-item ${activeTab === label ? "active" : ""}`}
            onClick={() => navigateTo(label, target)}
            aria-current={activeTab === label ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>
              {label === "Scan Receipt"
                ? "Scan"
                : label === "Transactions"
                  ? "Activity"
                  : label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;

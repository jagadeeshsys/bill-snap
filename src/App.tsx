
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
  Home,
  ChartNoAxesCombined,
  Settings,
  ArrowUpRight,
  Sparkles,
  X,
  CheckCircle,
  LoaderCircle,
  AlertCircle,
  Trash2,
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
} from "./services/extractor";
import {
  deleteBill,
  getAllBills,
  ProbableDuplicateBillError,
  saveBill,
} from "./services/storage";
import type { SavedBill } from "./services/storage";
import { summarizeMonthlyBills } from "./services/dashboardMetrics";
import { formatCurrency } from "./services/currency";
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

  const [selectedImage, setSelectedImage] =
    useState<ProcessedImage | null>(null);

  const [imageError, setImageError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("Home");

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

  useEffect(() => {
    loadBills();
  }, []);

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
        result.wasDownscaled ? file : undefined,
        result.wasDownscaled
          ? {
              width: result.originalWidth,
              height: result.originalHeight,
            }
          : undefined
      );

      setOcrEvidence(processed.ocrEvidence);

      if (processed.classification?.status === "uncertain") {
        setImageError(
          "We couldn't confidently identify this document as a bill. Try a clearer image, or review and correct the extracted details before saving."
        );
        setOcrConfidence(processed.ocrConfidence);
        setBillData(processed.data);
        setTotalInput(
          processed.data?.total.value?.toFixed(2) ?? ""
        );
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

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlySummary = summarizeMonthlyBills(
    bills,
    currentMonth,
    currentYear
  );
  const monthlyBills = monthlySummary.bills;
  const monthlySpending = monthlySummary.total;

  const categories = categoryOptions
    .map((name) => {
      const amount = monthlySummary.categoryTotals[name] ?? 0;

      return {
        name,
        amount,
        percentage:
          monthlySpending > 0
            ? Math.round((amount / monthlySpending) * 100)
            : 0,
        color: categoryColors[name],
      };
    })
    .filter((category) => category.amount > 0);

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <ReceiptText size={22} />
          </div>
          <span>
            bill<span className="brand-accent">snap</span>
          </span>
        </div>
        <button className="avatar" aria-label="Profile">J</button>
      </header>

      <main className="dashboard">
        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR FINANCES, SIMPLIFIED</p>
            <h1>Good morning, Jagadeesh</h1>
            <p className="muted">
              Keep track of every rupee you spend.
            </p>
          </div>
          <div className="sparkle">
            <Sparkles size={21} />
          </div>
        </section>

        <section className="summary-card">
          <div className="summary-top">
            <span>This month's spending</span>
            <span className="month-label">{dateLabel}</span>
          </div>

          <h2>
            {formatCurrency(monthlySpending)}
          </h2>

          <div className="summary-footer">
            <div className="trend">
              <TrendingUp size={15} />
              <span>Based on saved bills</span>
            </div>
            <div className="receipt-count">
              {monthlyBills.length} bills saved
            </div>
          </div>

          <div className="summary-decoration" />
        </section>

        <section className="scan-section">
          <div className="section-heading">
            <div>
              <h2>Capture a bill</h2>
              <p className="muted">
                Turn your receipts into smart records.
              </p>
            </div>
            <Sparkles size={19} className="ai-icon" />
          </div>

          <div className="scan-actions">
            <button
              className="scan-button"
              onClick={openCamera}
              disabled={isProcessing || isSaving}
            >
              <Camera size={22} />
              <span>Scan a bill</span>
            </button>

            <button
              className="upload-button"
              onClick={openGallery}
              disabled={isProcessing || isSaving}
            >
              <Upload size={21} />
              <span>Upload from gallery</span>
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

        {isProcessing && (
          <div className="preview-panel">
            <div className="preview-heading">
              <strong>Reading your bill...</strong>
              <LoaderCircle className="spin" size={20} />
            </div>
            <p className="muted">
              Extracting text and identifying bill details.
            </p>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="muted">{Math.round(progress)}% completed</p>
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
          <div className="preview-panel">
            <div className="preview-heading">
              <strong>Bill image</strong>
              <button
                onClick={removeImage}
                aria-label="Remove image"
                disabled={isSaving}
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
                placeholder="Enter bill date"
                onChange={(event) =>
                  updateField("date", event.target.value)
                }
              />
            </div>

            <div className="review-field">
              <label className="field-label" htmlFor="bill-total">
                Total amount (₹)
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
                !billData.date.value?.trim() ||
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
                  {formatCurrency(duplicateWarning.total)}. Save this bill
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

        <section className="category-section">
          <div className="section-heading">
            <div>
              <h2>Spending by category</h2>
              <p className="muted">Your expense breakdown</p>
            </div>
            <button className="text-button">
              View all <ArrowUpRight size={15} />
            </button>
          </div>

          <div className="category-card">
            {categories.length === 0 ? (
              <p className="muted">No expenses saved this month yet.</p>
            ) : (
              categories.map((category) => (
                <div className="category-row" key={category.name}>
                  <div className="category-info">
                    <span>{category.name}</span>
                    <strong>
                      {formatCurrency(category.amount)}
                    </strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${category.percentage}%`,
                        background: category.color,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="transactions-section">
          <div className="section-heading">
            <div>
              <h2>Recent bills</h2>
              <p className="muted">Your latest saved expenses</p>
            </div>
            <button className="text-button">
              See all <ArrowUpRight size={15} />
            </button>
          </div>

          <div className="transaction-card">
            {isLoadingBills ? (
              <p className="muted">Loading saved bills...</p>
            ) : bills.length === 0 ? (
              <p className="muted">No bills saved yet. Scan your first bill.</p>
            ) : (
              bills.slice(0, 5).map((item) => {
                const Icon = categoryIcons[item.category] ?? ReceiptText;

                return (
                  <div className="transaction-row" key={item.id}>
                    <div className="transaction-icon blue">
                      <Icon size={20} />
                    </div>
                    <div className="transaction-details">
                      <strong>{item.merchant}</strong>
                      <span>
                        {item.category} · {item.date}
                      </span>
                    </div>
                    <div className="transaction-actions">
                      <strong className="transaction-amount">
                        {formatCurrency(item.total)}
                      </strong>
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
      </main>

      <nav className="bottom-nav">
        {[
          { label: "Home", icon: Home },
          { label: "Insights", icon: ChartNoAxesCombined },
          { label: "Bills", icon: ReceiptText },
          { label: "Settings", icon: Settings },
        ].map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`nav-item ${activeTab === label ? "active" : ""}`}
            onClick={() => setActiveTab(label)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;

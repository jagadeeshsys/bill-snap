
import { useRef, useState } from "react";
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
} from "lucide-react";

import {
  processImage,
  type ProcessedImage,
} from "./services/image";

import "./App.css";

const transactions = [
  {
    id: 1,
    merchant: "Starbucks",
    category: "Food & Drinks",
    date: "Today, 10:30 AM",
    amount: 450,
    icon: Utensils,
    color: "orange",
  },
  {
    id: 2,
    merchant: "Reliance Fresh",
    category: "Groceries",
    date: "Yesterday",
    amount: 1250,
    icon: ShoppingBasket,
    color: "green",
  },
  {
    id: 3,
    merchant: "BESCOM",
    category: "Utilities",
    date: "Nov 2, 2026",
    amount: 890,
    icon: Zap,
    color: "yellow",
  },
  {
    id: 4,
    merchant: "Uber",
    category: "Transport",
    date: "Nov 1, 2026",
    amount: 320,
    icon: Car,
    color: "blue",
  },
];

const categories = [
  {
    name: "Food",
    amount: 4250,
    percentage: 65,
    color: "#F59E0B",
  },
  {
    name: "Groceries",
    amount: 3200,
    percentage: 49,
    color: "#10B981",
  },
  {
    name: "Utilities",
    amount: 2100,
    percentage: 32,
    color: "#6366F1",
  },
  {
    name: "Transport",
    amount: 1450,
    percentage: 22,
    color: "#0EA5E9",
  },
];

function App() {
  const fileInput = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] =
    useState<ProcessedImage | null>(null);

  const [imageError, setImageError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("Home");

  // Open rear camera on supported mobile devices
  const openCamera = () => {
    if (!fileInput.current) return;

    fileInput.current.setAttribute("capture", "environment");
    fileInput.current.click();
  };

  // Open gallery
  const openGallery = () => {
    if (!fileInput.current) return;

    fileInput.current.removeAttribute("capture");
    fileInput.current.click();
  };

  // Validate and compress selected image
  const handleImage = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    // Allow selecting the same image again
    event.target.value = "";

    if (!file) return;

    setImageError("");
    setIsProcessing(true);

    try {
      const result = await processImage(file);

      setSelectedImage((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous.previewUrl);
        }

        return result;
      });
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

  // Remove selected image and release memory
  const removeImage = () => {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
    }

    setSelectedImage(null);
    setImageError("");
  };

  return (
    <div className="app-shell">

      {/* HEADER */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <ReceiptText size={22} />
          </div>

          <span>
            bill<span className="brand-accent">snap</span>
          </span>
        </div>

        <button className="avatar" aria-label="Profile">
          J
        </button>
      </header>

      <main className="dashboard">

        {/* WELCOME SECTION */}
        <section className="welcome">
          <div>
            <p className="eyebrow">
              YOUR FINANCES, SIMPLIFIED
            </p>

            <h1>Good morning, Jagadeesh</h1>

            <p className="muted">
              Keep track of every rupee you spend.
            </p>
          </div>

          <div className="sparkle">
            <Sparkles size={21} />
          </div>
        </section>

        {/* MONTHLY SPENDING */}
        <section className="summary-card">
          <div className="summary-top">
            <span>This month's spending</span>

            <span className="month-label">
              November 2026
            </span>
          </div>

          <h2>
            ₹11,000<span className="decimal">.00</span>
          </h2>

          <div className="summary-footer">
            <div className="trend">
              <TrendingUp size={15} />
              <span>12% less than last month</span>
            </div>

            <div className="receipt-count">
              4 bills saved
            </div>
          </div>

          <div className="summary-decoration" />
        </section>

        {/* SCAN AND UPLOAD */}
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
              disabled={isProcessing}
            >
              <Camera size={22} />
              <span>Scan a bill</span>
            </button>

            <button
              className="upload-button"
              onClick={openGallery}
              disabled={isProcessing}
            >
              <Upload size={21} />
              <span>Upload from gallery</span>
            </button>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            hidden
            onChange={handleImage}
          />
        </section>

        {/* IMAGE PROCESSING STATUS */}
        {isProcessing && (
          <div className="preview-panel">
            <p>Processing and compressing image...</p>
          </div>
        )}

        {/* IMAGE ERROR */}
        {imageError && (
          <div className="error-message" role="alert">
            {imageError}
          </div>
        )}

        {/* IMAGE PREVIEW */}
        {selectedImage && (
          <div className="preview-panel">

            <div className="preview-heading">
              <strong>Image ready for scanning</strong>

              <button
                onClick={removeImage}
                aria-label="Remove image"
              >
                <X size={18} />
              </button>
            </div>

            <img
              src={selectedImage.previewUrl}
              alt="Selected bill preview"
            />

            <p className="muted">
              Resolution: {selectedImage.width} ×{" "}
              {selectedImage.height} pixels
            </p>

            <p className="muted">
              Original:{" "}
              {(selectedImage.originalSize / 1024).toFixed(1)} KB
              {" · "}
              Compressed:{" "}
              {(selectedImage.compressedSize / 1024).toFixed(1)} KB
            </p>
          </div>
        )}

        {/* CATEGORY BREAKDOWN */}
        <section className="category-section">
          <div className="section-heading">
            <div>
              <h2>Spending by category</h2>

              <p className="muted">
                Your expense breakdown
              </p>
            </div>

            <button className="text-button">
              View all <ArrowUpRight size={15} />
            </button>
          </div>

          <div className="category-card">
            {categories.map((category) => (
              <div
                className="category-row"
                key={category.name}
              >
                <div className="category-info">
                  <span>{category.name}</span>

                  <strong>
                    ₹{category.amount.toLocaleString("en-IN")}
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
            ))}
          </div>
        </section>

        {/* RECENT TRANSACTIONS */}
        <section className="transactions-section">
          <div className="section-heading">
            <div>
              <h2>Recent bills</h2>

              <p className="muted">
                Your latest saved expenses
              </p>
            </div>

            <button className="text-button">
              See all <ArrowUpRight size={15} />
            </button>
          </div>

          <div className="transaction-card">
            {transactions.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  className="transaction-row"
                  key={item.id}
                >
                  <div
                    className={`transaction-icon ${item.color}`}
                  >
                    <Icon size={20} />
                  </div>

                  <div className="transaction-details">
                    <strong>{item.merchant}</strong>

                    <span>
                      {item.category} · {item.date}
                    </span>
                  </div>

                  <strong className="transaction-amount">
                    ₹{item.amount.toLocaleString("en-IN")}
                  </strong>
                </div>
              );
            })}
          </div>
        </section>

      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="bottom-nav">
        {[
          { label: "Home", icon: Home },
          { label: "Insights", icon: ChartNoAxesCombined },
          { label: "Bills", icon: ReceiptText },
          { label: "Settings", icon: Settings },
        ].map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`nav-item ${
              activeTab === label ? "active" : ""
            }`}
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

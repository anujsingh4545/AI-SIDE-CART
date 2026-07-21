import { useState, useEffect } from "react";

// ── Icons ──────────────────────────────────────────────────────
const icons = {
  catalog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  aov: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  ),
  abandonment: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  ),
  discounts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  ),
  slowMoving: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
};

// ── Build items from real scan data ────────────────────────────
function fmt(n) {
  return n != null ? n.toLocaleString() : "—";
}

function buildItems(d) {
  const sym = d?.currencySymbol ?? "₹";

  return [
    {
      id: "catalog",
      label: "Reading your catalog",
      result: d ? `${fmt(d.productCount)} products` : "—",
      iconBg: "#dcfce7",
      iconColor: "#16a34a",
      icon: icons.catalog,
    },
    {
      id: "orders",
      label: "Analyzing 30 days of orders",
      result: d ? `${fmt(d.orderCount)} orders` : "—",
      iconBg: "#1a1a1a",
      iconColor: "#fff",
      icon: icons.orders,
    },
    {
      id: "aov",
      label: "Calculating average order value",
      result: d?.aov != null ? `${sym}${fmt(d.aov)}` : "—",
      iconBg: "#dbeafe",
      iconColor: "#2563eb",
      icon: icons.aov,
    },
    {
      id: "abandonment",
      label: "Measuring cart abandonment",
      result: d?.abandonmentRate != null ? `${d.abandonmentRate}%` : "—",
      iconBg: "#ffedd5",
      iconColor: "#ea580c",
      icon: icons.abandonment,
    },
    {
      id: "discounts",
      label: "Checking live discounts",
      result: d ? `${fmt(d.discountCount)} active` : "—",
      iconBg: "#fce7f3",
      iconColor: "#db2777",
      icon: icons.discounts,
    },
    {
      id: "slowMoving",
      label: "Spotting slow-moving stock",
      result: d ? `${fmt(d.slowMovingCount)} products` : "—",
      iconBg: "#fef9c3",
      iconColor: "#ca8a04",
      icon: icons.slowMoving,
    },
  ];
}

const SparkleIcon = ({ size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2l1.8 7.2L21 12l-7.2 1.8L12 22l-1.8-7.2L3 12l7.2-1.8L12 2z" />
  </svg>
);

export default function ScanStep({ onComplete, scanData }) {
  const [scanning, setScanning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const SCAN_ITEMS = buildItems(scanData);

  useEffect(() => {
    if (!scanning) return;
    if (doneCount >= SCAN_ITEMS.length) {
      setTimeout(() => onComplete?.(), 800);
      return;
    }
    const t = setTimeout(() => setDoneCount((c) => c + 1), 700);
    return () => clearTimeout(t);
  }, [scanning, doneCount, onComplete, SCAN_ITEMS.length]);

  const allDone = doneCount >= SCAN_ITEMS.length;

  return (
    <div className="ob-content">
      <div className="ob-icon">
        <SparkleIcon size={26} color="#fff" />
      </div>

      <h1 className="ob-heading">
        Describe it. <em>We'll build it.</em>
      </h1>

      <p className="ob-sub">
        Before we ask you anything, we read your store. Every recommendation
        you'll see is based on what's actually happening in your shop.
      </p>

      <div className="ob-card">
        {SCAN_ITEMS.map((item, i) => {
          const isDone = i < doneCount;
          const isActive = i === doneCount && scanning && !allDone;
          const state = isDone ? "done" : isActive ? "active" : "";

          return (
            <div key={item.id} className={`ob-item${state ? ` ob-item--${state}` : ""}`}>
              <div
                className="ob-item__icon-wrap"
                style={
                  isDone || isActive
                    ? { background: item.iconBg, color: item.iconColor }
                    : {}
                }
              >
                {item.icon}
              </div>

              <span className="ob-item__label">{item.label}</span>

              {isDone && (
                <span className="ob-item__result">{item.result}</span>
              )}
              {isActive && (
                <span className="ob-item__result ob-item__result--loading">
                  {item.result}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="ob-btn"
        onClick={() => !scanning && setScanning(true)}
        disabled={scanning && !allDone}
      >
        {scanning && !allDone ? (
          <>
            <span className="ob-spinner" />
            Reading your store…
          </>
        ) : allDone ? (
          <>Continue →</>
        ) : (
          <>
            <SparkleIcon size={14} color="#fff" />
            Scan my store
          </>
        )}
      </button>
    </div>
  );
}

import { useFetcher } from "react-router";
import { useEffect } from "react";

const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
    <path d="M12 2l1.8 7.2L21 12l-7.2 1.8L12 22l-1.8-7.2L3 12l7.2-1.8L12 2z" />
  </svg>
);

function fmt(n) {
  return n != null ? n.toLocaleString() : "—";
}

function buildStats(d) {
  const sym = d?.currencySymbol ?? "₹";
  const rate = d?.abandonmentRate ?? null;

  return [
    {
      label: "Average order value",
      value: d?.aov != null ? `${sym}${fmt(d.aov)}` : "—",
      sub: "Across your last 90 days of orders",
    },
    {
      label: "Cart abandonment",
      value: rate != null ? `${rate}%` : "—",
      sub:
        rate != null ? (
          rate > 55 ? (
            <><span className="ob-hl-orange">Above</span> the 55% category norm</>
          ) : (
            <><span className="ob-hl-teal">Below</span> the 55% category norm</>
          )
        ) : (
          "Industry norm is ~55%"
        ),
    },
    {
      label: "Live discounts",
      value: d ? `${fmt(d.discountCount)} active` : "—",
      sub: "Ready to surface in-cart",
    },
    {
      label: "Slow-moving stock",
      value: d ? `${fmt(d.slowMovingCount)} products` : "—",
      sub:
        d == null
          ? "Products with stock but no recent sales"
          : d.slowMovingCount === 0
          ? <><span className="ob-hl-teal">All stocked products</span> sold in 90 days</>
          : <><span className="ob-hl-orange">Stocked, not selling</span> — good upsell fuel</>,
    },
  ];
}

function buildSummary(d) {
  const sym = d?.currencySymbol ?? "₹";
  const rate = d?.abandonmentRate;
  const aov = d?.aov;
  const discounts = d?.discountCount;

  const sentences = [];
  if (rate != null) {
    sentences.push(
      rate > 55
        ? `${rate}% cart abandonment — above average.`
        : `${rate}% abandonment — better than most.`
    );
  }
  if (aov != null) sentences.push(`AOV at ${sym}${aov.toLocaleString()}.`);
  if (discounts > 0) sentences.push(`${discounts} live discount${discounts > 1 ? "s" : ""} ready to surface.`);
  return sentences.join(" ");
}

export default function ReviewStep({ onComplete, scanData, themeData, aiSummary }) {
  const fetcher = useFetcher();
  const isGenerating = fetcher.state !== "idle";

  const STATS = buildStats(scanData);
  const summary = aiSummary ?? buildSummary(scanData);

  // When the action returns the generated spec, advance to next step
  useEffect(() => {
    if (fetcher.data?.cartSpec) {
      onComplete(fetcher.data.cartSpec);
    }
  }, [fetcher.data, onComplete]);

  const handleBuild = () => {
    fetcher.submit(
      { scanData, themeData, aiSummary },
      { method: "POST", action: "/app/generate-spec", encType: "application/json" },
    );
  };

  return (
    <div className="ob-review">
      <h1 className="ob-heading">Here's what we found.</h1>
      <p className="ob-sub">
        Your store, in four numbers. This is what your cart will be built around.
      </p>

      <div className="ob-stats-grid">
        {STATS.map((s) => (
          <div key={s.label} className="ob-stat-card">
            <div className="ob-stat-card__label">{s.label}</div>
            <div className="ob-stat-card__value">{s.value}</div>
            <div className="ob-stat-card__sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="ob-ai-summary">
        <div className="ob-ai-summary__icon">
          <SparkleIcon />
        </div>
        <p className="ob-ai-summary__text">
          {summary}
        </p>
      </div>

      <button className="ob-btn" onClick={handleBuild} disabled={isGenerating}>
        {isGenerating ? (
          <>
            <span className="ob-spinner" />
            Building your cart…
          </>
        ) : (
          <>Build my cart →</>
        )}
      </button>
    </div>
  );
}

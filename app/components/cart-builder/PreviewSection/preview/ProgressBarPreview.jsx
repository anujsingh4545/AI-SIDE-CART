import styles from "./ProgressBarPreview.module.css";

function fmt(dollars) { return `$${dollars.toFixed(2)}`; }

export default function ProgressBarPreview({ data, general, cartTotal = 0, cartQty = 0 }) {
  if (!data?.enabled) return null;
  const rules = [...(data.props?.rules ?? [])].sort((a, b) => a.unlockAt - b.unlockAt);
  if (!rules.length) return null;

  const unlockedBy = data.props?.unlockedBy ?? "CART_TOTAL";
  const isCartTotal = unlockedBy === "CART_TOTAL";

  // unlockAt is in cents for CART_TOTAL, raw count for QUANTITY
  const normalizedRules = rules.map(r => ({
    ...r,
    threshold: isCartTotal ? r.unlockAt / 100 : r.unlockAt,
  }));

  const progress = isCartTotal ? cartTotal : cartQty;
  const maxAt = normalizedRules[normalizedRules.length - 1].threshold;

  const lastUnlocked = [...normalizedRules].reverse().find(r => progress >= r.threshold);
  const nextLocked = normalizedRules.find(r => progress < r.threshold);

  const pct = lastUnlocked && maxAt > 0 ? Math.min(progress / maxAt, 1) * 100 : 0;

  let statusText;
  if (!nextLocked) {
    statusText = data.props?.unlockedText ?? "🎉 All unlocked!";
  } else {
    const needed = isCartTotal
      ? fmt(nextLocked.threshold - progress)
      : `${nextLocked.threshold - progress} items`;
    const lastUnlockedStr = lastUnlocked ? `${lastUnlocked.label} unlocked! ` : "";
    statusText = (data.props?.defaultText ?? "Add {{needed}} more!")
      .replace("{{last_unlocked}}", lastUnlockedStr)
      .replace("{{needed}}", needed)
      .replace("{{next_unlocked}}", nextLocked.label);
  }

  const barColor = data.style?.barColor ?? "#6D28D9";
  const bgColor = data.style?.bgColor ?? "#EDE4FA";
  const textColor = general?.textColor ?? "#111111";

  return (
    <div className={styles.wrap} style={{ background: bgColor }}>
      <p className={styles.status} style={{ color: textColor }}>{statusText}</p>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className={styles.milestones}>
        {normalizedRules.map(r => (
          <span
            key={r.label}
            className={styles.milestone}
            style={{ color: progress >= r.threshold ? barColor : "#9ca3af" }}
          >
            {r.label.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

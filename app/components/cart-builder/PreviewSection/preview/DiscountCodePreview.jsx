import { useState } from "react";
import { TextField, Icon } from "@shopify/polaris";
import { XSmallIcon } from "@shopify/polaris-icons";
import styles from "./DiscountCodePreview.module.css";

export default function DiscountCodePreview({ data }) {
  if (!data?.enabled) return null;
  const { placeholderTitle, buttonText } = data.props ?? {};
  const btnBg = data.style?.buttonBgColor ?? "#6D28D9";
  const btnColor = data.style?.buttonColor ?? "#FFFFFF";
  const pillTextColor = data.style?.discountLabelColor ?? "#2E7D32";
  const pillBgColor = data.style?.discountBgColor ?? "#DFF3E4";
  const crossColor = data.style?.crossIconColor ?? "#2E7D32";

  const [code, setCode] = useState("");
  const [applied, setApplied] = useState([]);

  function handleApply() {
    const trimmed = code.trim();
    if (!trimmed || applied.includes(trimmed)) return;
    setApplied((prev) => [...prev, trimmed]);
    setCode("");
  }

  function handleRemove(label) {
    setApplied((prev) => prev.filter((c) => c !== label));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <div className={styles.fieldWrap}>
          <TextField
            value={code}
            onChange={setCode}
            placeholder={placeholderTitle ?? "Discount code"}
            autoComplete="off"
          />
        </div>
        <button
          className={styles.btn}
          style={{ background: btnBg, color: btnColor }}
          onClick={handleApply}
        >
          {buttonText ?? "Apply"}
        </button>
      </div>

      {applied.length > 0 && (
        <div className={styles.pills}>
          {applied.map((label) => (
            <span
              key={label}
              className={styles.pill}
              style={{ background: pillBgColor, color: pillTextColor }}
            >
              {label}
              <button
                className={styles.pillRemove}
                style={{ color: crossColor }}
                onClick={() => handleRemove(label)}
                aria-label={`Remove ${label}`}
              >
                <Icon source={XSmallIcon} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

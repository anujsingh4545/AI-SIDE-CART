import { useState } from "react";
import styles from "./OrderNotesPreview.module.css";

export default function OrderNotesPreview({ data }) {
  if (!data?.enabled) return null;
  const [open, setOpen] = useState(false);
  const { title, textAreaPlaceholder } = data.props ?? {};
  const titleColor = data.style?.titleColor ?? "#111111";
  const titleSize = data.style?.titleSize ?? 12;
  return (
    <div className={styles.wrap}>
      <button className={styles.header} onClick={() => setOpen(o => !o)}>
        <span style={{ color: titleColor, fontSize: titleSize }}>{title}</span>
        <span className={styles.chevron}>{open ? "∧" : "∨"}</span>
      </button>
      {open && (
        <div className={styles.textarea}>{textAreaPlaceholder}</div>
      )}
    </div>
  );
}

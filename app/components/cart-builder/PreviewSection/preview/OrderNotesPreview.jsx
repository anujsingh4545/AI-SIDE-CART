import { useState } from "react";
import { Icon, TextField } from "@shopify/polaris";
import { ChevronUpIcon, ChevronDownIcon } from "@shopify/polaris-icons";
import styles from "./OrderNotesPreview.module.css";

export default function OrderNotesPreview({ data }) {
  if (!data?.enabled) return null;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { title, textAreaPlaceholder } = data.props ?? {};
  const titleColor = data.style?.titleColor ?? "#111111";
  const titleSize = data.style?.titleSize ?? 12;
  return (
    <div className={styles.wrap}>
      <button className={styles.header} onClick={() => setOpen(o => !o)}>
        <span style={{ color: titleColor, fontSize: `${titleSize}px` }}>{title}</span>
        <span className={styles.chevron}>
          <Icon source={open ? ChevronUpIcon : ChevronDownIcon} />
        </span>
      </button>
      {open && (
        <div className={styles.textareaWrap}>
          <TextField
            value={note}
            onChange={setNote}
            placeholder={textAreaPlaceholder}
            multiline={2}
            autoComplete="off"
          />
        </div>
      )}
    </div>
  );
}

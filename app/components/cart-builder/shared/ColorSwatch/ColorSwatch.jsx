import { useRef } from "react";
import { BlockStack, Text } from "@shopify/polaris";
import styles from "./ColorSwatch.module.css";

export default function ColorSwatch({ label, value, onChange }) {
  const inputRef = useRef(null);

  return (
    <BlockStack gap="100">
      {label && <Text as="span" variant="bodySm" tone="subdued">{label}</Text>}
      <div className={styles.row} onClick={() => inputRef.current?.click()}>
        <span className={styles.swatch} style={{ background: value }} />
        <Text as="span" variant="bodySm" fontWeight="medium">{value}</Text>
        <input
          ref={inputRef}
          type="color"
          value={value}
          className={styles.hiddenInput}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </BlockStack>
  );
}

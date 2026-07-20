import { useState } from "react";
import { BlockStack, InlineGrid, Text, RangeSlider, Icon } from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import ColorSwatch from "../../shared/ColorSwatch/ColorSwatch.jsx";
import styles from "./GeneralSection.module.css";

const COLOR_FIELDS = [
  { key: "bgColor",         label: "Background" },
  { key: "textColor",       label: "Text" },
  { key: "accentColor",     label: "Accent" },
  { key: "accentTextColor", label: "Accent text" },
];

export default function GeneralSection({ general, onChange }) {
  const [open, setOpen] = useState(true);

  return (
    <div className={styles.section}>
      <button className={styles.summary} onClick={() => setOpen((o) => !o)}>
        <Text as="span" variant="headingSm">General</Text>
        <span className={styles.icon}>
          <Icon source={open ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
        </span>
      </button>

      {open && (
        <div className={styles.body}>
          <BlockStack gap="400">
            <InlineGrid columns={2} gap="300">
              {COLOR_FIELDS.map(({ key, label }) => (
                <ColorSwatch
                  key={key}
                  label={label}
                  value={general[key]}
                  onChange={(val) => onChange({ ...general, [key]: val })}
                />
              ))}
            </InlineGrid>

            <RangeSlider
              label="Border radius"
              min={0}
              max={24}
              value={general.radius}
              output
              suffix={<Text variant="bodySm">{general.radius}px</Text>}
              onChange={(val) => onChange({ ...general, radius: val })}
            />
          </BlockStack>
        </div>
      )}
    </div>
  );
}

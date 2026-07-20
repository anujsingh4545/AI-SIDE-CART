import { BlockStack, TextField, RangeSlider, Text, Divider, Icon } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";
import styles from "./OrderNotesBlock.module.css";

export default function OrderNotesBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
  function setProp(key, val) {
    onChange({ ...data, props: { ...data.props, [key]: val } });
  }
  function setStyle(key, val) {
    onChange({ ...data, style: { ...data.style, [key]: val } });
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <span ref={dragHandleRef} className={styles.dragHandle} {...(dragHandleProps ?? {})}>
          <Icon source={DragHandleIcon} tone="subdued" />
        </span>
        <Text as="span" variant="bodySm" fontWeight="semibold">Order notes</Text>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={data.enabled}
            onChange={(e) => onChange({ ...data, enabled: e.target.checked })}
          />
          <span className={styles.toggleTrack} />
        </label>
      </div>

      {data.enabled && (
        <div className={styles.body}>
          <BlockStack gap="300">
            <TextField
              label="Title"
              value={data.props.title}
              onChange={(val) => setProp("title", val)}
              autoComplete="off"
            />
            <TextField
              label="Placeholder text"
              value={data.props.textAreaPlaceholder}
              onChange={(val) => setProp("textAreaPlaceholder", val)}
              autoComplete="off"
            />

            <Divider />
            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <ColorSwatch
              label="Title color"
              value={data.style.titleColor}
              onChange={(val) => setStyle("titleColor", val)}
            />
            <RangeSlider
              label="Title size"
              min={10}
              max={20}
              value={data.style.titleSize}
              output
              suffix={<Text variant="bodySm">{data.style.titleSize}px</Text>}
              onChange={(val) => setStyle("titleSize", val)}
            />
          </BlockStack>
        </div>
      )}
    </div>
  );
}

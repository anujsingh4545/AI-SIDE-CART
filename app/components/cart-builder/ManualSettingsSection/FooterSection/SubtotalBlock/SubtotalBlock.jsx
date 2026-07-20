import { BlockStack, InlineGrid, TextField, Checkbox, Text, Divider, Icon } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";
import styles from "./SubtotalBlock.module.css";

export default function SubtotalBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
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
        <Text as="span" variant="bodySm" fontWeight="semibold">Subtotal</Text>
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
              label="Label"
              value={data.props.title}
              onChange={(val) => setProp("title", val)}
              autoComplete="off"
            />
            <Checkbox
              label="Show original price"
              checked={data.props.showOriginalPrice}
              onChange={(val) => setProp("showOriginalPrice", val)}
            />

            <Divider />
            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <InlineGrid columns={2} gap="300">
              <ColorSwatch label="Label color" value={data.style.titleColor} onChange={(val) => setStyle("titleColor", val)} />
              <ColorSwatch label="Original price" value={data.style.originalColor} onChange={(val) => setStyle("originalColor", val)} />
              <ColorSwatch label="Discounted price" value={data.style.discountedColor} onChange={(val) => setStyle("discountedColor", val)} />
            </InlineGrid>
          </BlockStack>
        </div>
      )}
    </div>
  );
}

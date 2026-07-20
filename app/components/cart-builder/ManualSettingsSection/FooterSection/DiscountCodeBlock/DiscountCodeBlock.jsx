import { BlockStack, InlineGrid, TextField, Text, Divider, Icon } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";
import styles from "./DiscountCodeBlock.module.css";

export default function DiscountCodeBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
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
        <Text as="span" variant="bodySm" fontWeight="semibold">Discount code</Text>
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
              label="Placeholder text"
              value={data.props.placeholderTitle}
              onChange={(val) => setProp("placeholderTitle", val)}
              autoComplete="off"
            />
            <TextField
              label="Button text"
              value={data.props.buttonText}
              onChange={(val) => setProp("buttonText", val)}
              autoComplete="off"
            />

            <Divider />
            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <InlineGrid columns={2} gap="300">
              <ColorSwatch label="Button text" value={data.style.buttonColor} onChange={(val) => setStyle("buttonColor", val)} />
              <ColorSwatch label="Button bg" value={data.style.buttonBgColor} onChange={(val) => setStyle("buttonBgColor", val)} />
              <ColorSwatch label="Discount label" value={data.style.discountLabelColor} onChange={(val) => setStyle("discountLabelColor", val)} />
              <ColorSwatch label="Discount bg" value={data.style.discountBgColor} onChange={(val) => setStyle("discountBgColor", val)} />
              <ColorSwatch label="Cross icon" value={data.style.crossIconColor} onChange={(val) => setStyle("crossIconColor", val)} />
            </InlineGrid>
          </BlockStack>
        </div>
      )}
    </div>
  );
}

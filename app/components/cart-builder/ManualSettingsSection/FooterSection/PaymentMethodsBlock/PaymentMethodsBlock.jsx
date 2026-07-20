import { BlockStack, InlineGrid, Checkbox, RangeSlider, Text, Divider, Icon } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import styles from "./PaymentMethodsBlock.module.css";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";

const ICON_OPTIONS = ["VISA", "MC", "AMEX", "PAYPAL", "GPAY", "APPLEPAY", "SHOP", "KLARNA", "UPI", "STRIPE", "SKRILL", "JCB"];

export default function PaymentMethodsBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
  function setStyle(key, val) {
    onChange({ ...data, style: { ...data.style, [key]: val } });
  }

  function toggleIcon(icon) {
    const icons = data.props.icons.includes(icon)
      ? data.props.icons.filter((i) => i !== icon)
      : [...data.props.icons, icon];
    onChange({ ...data, props: { ...data.props, icons } });
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <span ref={dragHandleRef} className={styles.dragHandle} {...(dragHandleProps ?? {})}>
          <Icon source={DragHandleIcon} tone="subdued" />
        </span>
        <Text as="span" variant="bodySm" fontWeight="semibold">Payment methods</Text>
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
            <Text as="span" variant="bodySm" fontWeight="medium">Icons</Text>
            <InlineGrid columns={2} gap="200">
              {ICON_OPTIONS.map((icon) => (
                <Checkbox
                  key={icon}
                  label={icon}
                  checked={data.props.icons.includes(icon)}
                  onChange={() => toggleIcon(icon)}
                />
              ))}
            </InlineGrid>

            <Divider />
            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <RangeSlider
              label="Font size"
              min={6}
              max={14}
              value={data.style.fontSize}
              output
              suffix={<Text variant="bodySm">{data.style.fontSize}px</Text>}
              onChange={(val) => setStyle("fontSize", val)}
            />
            <RangeSlider
              label="Border radius"
              min={0}
              max={12}
              value={data.style.borderRadius}
              output
              suffix={<Text variant="bodySm">{data.style.borderRadius}px</Text>}
              onChange={(val) => setStyle("borderRadius", val)}
            />
            <InlineGrid columns={2} gap="300">
              <ColorSwatch label="Text color" value={data.style.textColor} onChange={(val) => setStyle("textColor", val)} />
              <ColorSwatch label="Background" value={data.style.bgColor} onChange={(val) => setStyle("bgColor", val)} />
              <ColorSwatch label="Border color" value={data.style.borderColor} onChange={(val) => setStyle("borderColor", val)} />
            </InlineGrid>
          </BlockStack>
        </div>
      )}
    </div>
  );
}

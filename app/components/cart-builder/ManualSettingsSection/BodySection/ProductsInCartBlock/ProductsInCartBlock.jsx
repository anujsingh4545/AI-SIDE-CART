import { BlockStack, InlineGrid, TextField, Checkbox, RangeSlider, Text, Divider, Icon } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import styles from "./ProductsInCartBlock.module.css";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";

export default function ProductsInCartBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
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
        <Text as="span" variant="bodySm" fontWeight="semibold">Products in cart</Text>
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
            <Checkbox
              label="Show variant selector"
              checked={data.props.showVariantSelector}
              onChange={(val) => setProp("showVariantSelector", val)}
            />
            <Checkbox
              label="Show quantity selector"
              checked={data.props.showQuantitySelector}
              onChange={(val) => setProp("showQuantitySelector", val)}
            />
            <Checkbox
              label="Show single item price"
              checked={data.props.showSingleItemPrice}
              onChange={(val) => setProp("showSingleItemPrice", val)}
            />
            <TextField
              label="Empty cart text"
              value={data.props.emptyText}
              onChange={(val) => setProp("emptyText", val)}
              autoComplete="off"
            />

            <Divider />
            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <RangeSlider
              label="Image size"
              min={32}
              max={128}
              value={data.style.imageSize}
              output
              suffix={<Text variant="bodySm">{data.style.imageSize}px</Text>}
              onChange={(val) => setStyle("imageSize", val)}
            />
            <RangeSlider
              label="Vertical spacing"
              min={4}
              max={24}
              value={data.style.verticalSpacing}
              output
              suffix={<Text variant="bodySm">{data.style.verticalSpacing}px</Text>}
              onChange={(val) => setStyle("verticalSpacing", val)}
            />

            <InlineGrid columns={2} gap="300">
              <ColorSwatch
                label="Title color"
                value={data.style.titleColor}
                onChange={(val) => setStyle("titleColor", val)}
              />
              <ColorSwatch
                label="Badge text"
                value={data.style.discountBadgeTextColor}
                onChange={(val) => setStyle("discountBadgeTextColor", val)}
              />
              <ColorSwatch
                label="Badge background"
                value={data.style.discountBadgeBgColor}
                onChange={(val) => setStyle("discountBadgeBgColor", val)}
              />
            </InlineGrid>
          </BlockStack>
        </div>
      )}
    </div>
  );
}

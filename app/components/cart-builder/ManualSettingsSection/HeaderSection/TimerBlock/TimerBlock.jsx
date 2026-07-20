import { BlockStack, InlineGrid, TextField, Checkbox, RangeSlider, Text, Divider, Icon } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";
import styles from "./TimerBlock.module.css";

export default function TimerBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
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
        <Text as="span" variant="bodySm" fontWeight="semibold">Timer</Text>
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
              label="Message"
              value={data.props.title}
              onChange={(val) => setProp("title", val)}
              autoComplete="off"
            />

            <RangeSlider
              label="Time limit"
              min={5}
              max={90}
              value={data.props.timeLimit}
              output
              suffix={<Text variant="bodySm">{data.props.timeLimit}m</Text>}
              onChange={(val) => setProp("timeLimit", val)}
            />

            <Checkbox
              label="Reset timer when item added"
              checked={data.props.resetTimerProductAddedToCart}
              onChange={(val) => setProp("resetTimerProductAddedToCart", val)}
            />
            <Checkbox
              label="Remove cart items when timer ends"
              checked={data.props.removeCartItemsTimerEnds}
              onChange={(val) => setProp("removeCartItemsTimerEnds", val)}
            />

            <Divider />

            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <InlineGrid columns={2} gap="300">
              <ColorSwatch
                label="Text color"
                value={data.style.text}
                onChange={(val) => setStyle("text", val)}
              />
              <ColorSwatch
                label="Background"
                value={data.style.bgColor}
                onChange={(val) => setStyle("bgColor", val)}
              />
            </InlineGrid>
          </BlockStack>
        </div>
      )}
    </div>
  );
}

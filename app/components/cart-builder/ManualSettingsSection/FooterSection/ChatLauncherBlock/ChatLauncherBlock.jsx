import { BlockStack, InlineGrid, TextField, Text, Divider, Icon, RangeSlider } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";
import styles from "./ChatLauncherBlock.module.css";

export default function ChatLauncherBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
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
        <Text as="span" variant="bodySm" fontWeight="semibold">Chat launcher</Text>
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
              label="Subtitle"
              value={data.props.subtitle}
              onChange={(val) => setProp("subtitle", val)}
              autoComplete="off"
            />
            <TextField
              label="Avatar emoji"
              value={data.props.avatarEmoji}
              onChange={(val) => setProp("avatarEmoji", val)}
              autoComplete="off"
              maxLength={2}
            />

            <Divider />
            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <InlineGrid columns={2} gap="300">
              <ColorSwatch label="Background" value={data.style.bgColor} onChange={(val) => setStyle("bgColor", val)} />
              <ColorSwatch label="Text color" value={data.style.textColor} onChange={(val) => setStyle("textColor", val)} />
            </InlineGrid>
            <RangeSlider
              label="Border radius"
              min={0}
              max={24}
              value={data.style.borderRadius}
              output
              suffix={<Text variant="bodySm">{data.style.borderRadius}px</Text>}
              onChange={(val) => setStyle("borderRadius", val)}
            />
          </BlockStack>
        </div>
      )}
    </div>
  );
}

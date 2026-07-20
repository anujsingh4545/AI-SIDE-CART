import { BlockStack, RangeSlider, Text, Divider, Icon } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";
import styles from "./TrustBadgesBlock.module.css";

export default function TrustBadgesBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
  function setStyle(key, val) {
    onChange({ ...data, style: { ...data.style, [key]: val } });
  }

  function setBadge(index, val) {
    const updated = data.props.badges.map((b, i) => (i === index ? { title: val } : b));
    onChange({ ...data, props: { ...data.props, badges: updated } });
  }

  function removeBadge(index) {
    const updated = data.props.badges.filter((_, i) => i !== index);
    onChange({ ...data, props: { ...data.props, badges: updated } });
  }

  function addBadge() {
    onChange({ ...data, props: { ...data.props, badges: [...data.props.badges, { title: "" }] } });
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <span ref={dragHandleRef} className={styles.dragHandle} {...(dragHandleProps ?? {})}>
          <Icon source={DragHandleIcon} tone="subdued" />
        </span>
        <Text as="span" variant="bodySm" fontWeight="semibold">Trust badges</Text>
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
          <BlockStack gap="200">
            <Text as="span" variant="bodySm" fontWeight="medium">Badges</Text>

            {data.props.badges.map((badge, i) => (
              <div key={i} className={styles.badgeRow}>
                <div className={styles.badgeField}>
                  <input
                    type="text"
                    className={styles.badgeInput}
                    value={badge.title}
                    onChange={(e) => setBadge(i, e.target.value)}
                    placeholder="Badge text"
                  />
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeBadge(i)}
                  aria-label="Remove badge"
                >
                  ×
                </button>
              </div>
            ))}

            <button type="button" className={styles.addBtn} onClick={addBadge}>
              + Add badge
            </button>

            <Divider />
            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <RangeSlider
              label="Text size"
              min={8}
              max={16}
              value={data.style.textSize}
              output
              suffix={<Text variant="bodySm">{data.style.textSize}px</Text>}
              onChange={(val) => setStyle("textSize", val)}
            />
            <ColorSwatch
              label="Text color"
              value={data.style.textColor}
              onChange={(val) => setStyle("textColor", val)}
            />
          </BlockStack>
        </div>
      )}
    </div>
  );
}

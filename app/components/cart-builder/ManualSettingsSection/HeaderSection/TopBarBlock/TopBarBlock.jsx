import { BlockStack, TextField, Checkbox, Icon, Text } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import styles from "./TopBarBlock.module.css";

export default function TopBarBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
  function setProp(key, val) {
    onChange({ ...data, props: { ...data.props, [key]: val } });
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <span ref={dragHandleRef} className={styles.dragHandle} {...(dragHandleProps ?? {})}>
          <Icon source={DragHandleIcon} tone="subdued" />
        </span>
        <Text as="span" variant="bodySm" fontWeight="semibold">Top bar</Text>
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
            <Checkbox
              label="Show item count"
              checked={data.props.showItemCount}
              onChange={(val) => setProp("showItemCount", val)}
            />
          </BlockStack>
        </div>
      )}
    </div>
  );
}

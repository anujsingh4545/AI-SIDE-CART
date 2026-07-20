import { BlockStack, TextField, Text, Divider, Icon, InlineGrid, Select } from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ColorSwatch from "../../../shared/ColorSwatch/ColorSwatch.jsx";
import styles from "./ProgressBarBlock.module.css";

const TYPE_LABELS = {
  DISCOUNT: "Discount",
  FREE_GIFT: "Free gift",
  FREE_SHIPPING: "Free shipping",
};

function SortableRule({ rule, index, unlockedBy, onRuleChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rule._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={styles.ruleCard}>
      <div className={styles.ruleHeader}>
        <span className={styles.ruleDragHandle} {...attributes} {...listeners}>
          <Icon source={DragHandleIcon} tone="subdued" />
        </span>
        <span className={styles.typeBadge}>{TYPE_LABELS[rule.type] ?? rule.type}</span>
      </div>
      <div className={styles.ruleBody}>
        <BlockStack gap="200">
          <TextField
            label="Label"
            value={rule.label}
            onChange={(val) => onRuleChange(index, { ...rule, label: val })}
            autoComplete="off"
          />
          <TextField
            label={unlockedBy === "QUANTITY" ? "Unlock at (quantity)" : "Unlock at (cents)"}
            type="number"
            value={String(rule.unlockAt)}
            onChange={(val) => onRuleChange(index, { ...rule, unlockAt: Number(val) })}
            autoComplete="off"
          />
          {rule.type === "FREE_GIFT" && (
            <ProductPicker
              product={rule.product}
              onPick={(p) => onRuleChange(index, { ...rule, product: p })}
            />
          )}
        </BlockStack>
      </div>
    </div>
  );
}

function ProductPicker({ product, onPick }) {
  const hasProduct = product?.productId;

  async function handlePick() {
    try {
      // eslint-disable-next-line no-undef
      const selected = await shopify.resourcePicker({ type: "product", multiple: false });
      if (!selected?.length) return;
      const p = selected[0];
      const v = p.variants?.[0];
      onPick({
        productId: p.id,
        variantId: v?.id ?? "",
      });
    } catch {
      // dismissed
    }
  }

  if (!hasProduct) {
    return (
      <div className={styles.productPicker}>
        <Text as="span" variant="bodySm" tone="subdued">Product</Text>
        <button type="button" className={styles.productBtn} onClick={handlePick}>
          + Select product
        </button>
      </div>
    );
  }

  return (
    <div className={styles.productPicker}>
      <Text as="span" variant="bodySm" tone="subdued">Product</Text>
      <div className={styles.productSelected}>
        <span className={styles.productId}>{product.productId}</span>
        <button type="button" className={styles.productChangeBtn} onClick={handlePick}>
          Change
        </button>
      </div>
    </div>
  );
}

export default function ProgressBarBlock({ data, onChange, dragHandleRef, dragHandleProps }) {
  const sensors = useSensors(useSensor(PointerSensor));

  function setProp(key, val) {
    onChange({ ...data, props: { ...data.props, [key]: val } });
  }
  function setStyle(key, val) {
    onChange({ ...data, style: { ...data.style, [key]: val } });
  }
  function setRule(index, updated) {
    const rules = (data.props.rules ?? []).map((r, i) => (i === index ? updated : r));
    setProp("rules", rules);
  }
  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const rules = data.props.rules ?? [];
    const oldIndex = rules.findIndex((r) => r.type === active.id);
    const newIndex = rules.findIndex((r) => r.type === over.id);
    setProp("rules", arrayMove(rules, oldIndex, newIndex));
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <span ref={dragHandleRef} className={styles.dragHandle} {...(dragHandleProps ?? {})}>
          <Icon source={DragHandleIcon} tone="subdued" />
        </span>
        <Text as="span" variant="bodySm" fontWeight="semibold">Progress bar</Text>
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
            <Select
              label="Unlock by"
              options={[
                { label: "Cart total", value: "CART_TOTAL" },
                { label: "Quantity", value: "QUANTITY" },
              ]}
              value={data.props.unlockedBy}
              onChange={(val) => {
                const cartTotalDefaults = [10000, 20000, 30000];
                const cartQuantityDefaults = [2, 4, 6];
                const resetRules = (data.props.rules ?? []).map((rule, i) => ({
                  ...rule,
                  unlockAt: val === "QUANTITY" ? cartQuantityDefaults[i] ?? 1 : (cartTotalDefaults[i] ?? 1000),
                }));
                onChange({
                  ...data,
                  props: { ...data.props, unlockedBy: val, rules: resetRules },
                });
              }}
            />

            <TextField
              label="Default text"
              value={data.props.defaultText}
              onChange={(val) => setProp("defaultText", val)}
              autoComplete="off"
              helpText="Use {{needed}} for remaining amount"
            />
            <TextField
              label="Unlocked text"
              value={data.props.unlockedText}
              onChange={(val) => setProp("unlockedText", val)}
              autoComplete="off"
            />

            <Divider />
            <Text as="span" variant="bodySm" fontWeight="medium">Rules</Text>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={(data.props.rules ?? []).map((r) => r.type)}
                strategy={verticalListSortingStrategy}
              >
                <BlockStack gap="200">
                  {(data.props.rules ?? []).map((rule, i) => (
                    <SortableRule
                      key={rule.type}
                      rule={{ ...rule, _id: rule.type }}
                      index={i}
                      unlockedBy={data.props.unlockedBy}
                      onRuleChange={setRule}
                    />
                  ))}
                </BlockStack>
              </SortableContext>
            </DndContext>

            <Divider />
            <Text as="span" variant="bodySm" tone="subdued">Style</Text>

            <InlineGrid columns={2} gap="300">
              <ColorSwatch
                label="Bar color"
                value={data.style.barColor}
                onChange={(val) => setStyle("barColor", val)}
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

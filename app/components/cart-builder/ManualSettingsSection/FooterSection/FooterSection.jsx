import { useState } from "react";
import { Text, Icon, BlockStack, InlineGrid, RangeSlider, Divider } from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
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
import ColorSwatch from "../../shared/ColorSwatch/ColorSwatch.jsx";
import DiscountCodeBlock from "./DiscountCodeBlock/DiscountCodeBlock.jsx";
import OrderNotesBlock from "./OrderNotesBlock/OrderNotesBlock.jsx";
import SubtotalBlock from "./SubtotalBlock/SubtotalBlock.jsx";
import CheckoutButtonBlock from "./CheckoutButtonBlock/CheckoutButtonBlock.jsx";
import TrustBadgesBlock from "./TrustBadgesBlock/TrustBadgesBlock.jsx";
import PaymentMethodsBlock from "./PaymentMethodsBlock/PaymentMethodsBlock.jsx";
import styles from "./FooterSection.module.css";

const BLOCK_MAP = {
  DISCOUNT_CODE: DiscountCodeBlock,
  ORDER_NOTES: OrderNotesBlock,
  SUBTOTAL: SubtotalBlock,
  CHECKOUT_BUTTON: CheckoutButtonBlock,
  TRUST_BADGES: TrustBadgesBlock,
  PAYMENT_METHODS: PaymentMethodsBlock,
};

const DEFAULT_ORDER = ["DISCOUNT_CODE", "ORDER_NOTES", "SUBTOTAL", "CHECKOUT_BUTTON", "TRUST_BADGES", "PAYMENT_METHODS"];

function SortableBlockWrapper({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {children({
        dragHandleRef: setActivatorNodeRef,
        dragHandleProps: { ...attributes, ...listeners },
      })}
    </div>
  );
}

export default function FooterSection({ footer, onChange }) {
  const [open, setOpen] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor));
  const order = footer.order ?? DEFAULT_ORDER;

  function setStyle(key, val) {
    onChange({ ...footer, style: { ...footer.style, [key]: val } });
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    onChange({ ...footer, order: arrayMove(order, oldIndex, newIndex) });
  }

  return (
    <div className={styles.section}>
      <button className={styles.summary} onClick={() => setOpen((o) => !o)}>
        <Text as="span" variant="headingSm">Footer</Text>
        <span className={styles.icon}>
          <Icon source={open ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
        </span>
      </button>

      {open && (
        <div className={styles.body}>
          <BlockStack gap="200">
            <InlineGrid columns={2} gap="300">
              <ColorSwatch
                label="Background"
                value={footer.style.bgColor}
                onChange={(val) => setStyle("bgColor", val)}
              />
            </InlineGrid>
            <RangeSlider
              label="Vertical spacing"
              min={4}
              max={24}
              value={footer.style.verticalSpacing}
              output
              suffix={<Text variant="bodySm">{footer.style.verticalSpacing}px</Text>}
              onChange={(val) => setStyle("verticalSpacing", val)}
            />

            <Divider />

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <BlockStack gap="200">
                  {order.map((key) => {
                    const Block = BLOCK_MAP[key];
                    if (!Block) return null;
                    return (
                      <SortableBlockWrapper key={key} id={key}>
                        {({ dragHandleRef, dragHandleProps }) => (
                          <Block
                            data={footer[key]}
                            onChange={(val) => onChange({ ...footer, [key]: val })}
                            dragHandleRef={dragHandleRef}
                            dragHandleProps={dragHandleProps}
                          />
                        )}
                      </SortableBlockWrapper>
                    );
                  })}
                </BlockStack>
              </SortableContext>
            </DndContext>
          </BlockStack>
        </div>
      )}
    </div>
  );
}

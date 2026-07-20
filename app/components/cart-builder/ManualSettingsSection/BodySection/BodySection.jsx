import { useState } from "react";
import { Text, Icon, BlockStack } from "@shopify/polaris";
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
import ProductsInCartBlock from "./ProductsInCartBlock/ProductsInCartBlock.jsx";
import styles from "./BodySection.module.css";

const BLOCK_MAP = {
  PRODUCTS_IN_CART: ProductsInCartBlock,
};

const DEFAULT_ORDER = ["PRODUCTS_IN_CART"];

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

export default function BodySection({ body, onChange }) {
  const [open, setOpen] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor));
  const order = body.order ?? DEFAULT_ORDER;

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    onChange({ ...body, order: arrayMove(order, oldIndex, newIndex) });
  }

  return (
    <div className={styles.section}>
      <button className={styles.summary} onClick={() => setOpen((o) => !o)}>
        <Text as="span" variant="headingSm">Body</Text>
        <span className={styles.icon}>
          <Icon source={open ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
        </span>
      </button>

      {open && (
        <div className={styles.body}>
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
                          data={body[key]}
                          onChange={(val) => onChange({ ...body, [key]: val })}
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
        </div>
      )}
    </div>
  );
}

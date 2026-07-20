import { useState } from "react";
import { BlockStack, Text, Icon } from "@shopify/polaris";
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
import TopBarBlock from "./TopBarBlock/TopBarBlock.jsx";
import TimerBlock from "./TimerBlock/TimerBlock.jsx";
import ProgressBarBlock from "./ProgressBarBlock/ProgressBarBlock.jsx";
import styles from "./HeaderSection.module.css";

const BLOCK_MAP = {
  TOP_BAR: TopBarBlock,
  TIMER: TimerBlock,
  PROGRESS_BAR: ProgressBarBlock,
};

const DEFAULT_ORDER = ["TOP_BAR", "TIMER", "PROGRESS_BAR"];

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

export default function HeaderSection({ header, onChange }) {
  const [open, setOpen] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor));
  const order = header.order ?? DEFAULT_ORDER;

  function setBlock(key, val) {
    onChange({ ...header, [key]: val });
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    onChange({ ...header, order: arrayMove(order, oldIndex, newIndex) });
  }

  return (
    <div className={styles.section}>
      <button className={styles.summary} onClick={() => setOpen((o) => !o)}>
        <Text as="span" variant="headingSm">Header</Text>
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
                          data={header[key]}
                          onChange={(val) => setBlock(key, val)}
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

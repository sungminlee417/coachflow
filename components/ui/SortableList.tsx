'use client'

import { ReactNode } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

interface SortableListProps<T extends { id: string }> {
  items: T[]
  onReorder: (next: T[]) => void
  renderItem: (item: T, index: number, dragHandleProps: DragHandleProps) => ReactNode
  className?: string
}

export interface DragHandleProps {
  /** Spread onto the element that should initiate a drag (typically a small
   *  GripVertical button at the start of the row). */
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  /** True while this row is being dragged — useful for opacity/shadow tweaks. */
  isDragging: boolean
}

/**
 * Vertical-axis sortable list with mouse/touch/keyboard support.
 *
 * `renderItem` receives drag-handle props that the consumer attaches to its
 * own grip element — that way the rest of the row stays interactive (inputs,
 * buttons, etc.). Item ids must be stable across renders.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  className,
}: SortableListProps<T>) {
  // Distance activator on PointerSensor lets accidental clicks pass through
  // (so editing inputs and tapping buttons still works on rows that happen to
  // be sortable). 5px is enough to disambiguate a tap from a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(i => i.id === active.id)
    const newIndex = items.findIndex(i => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, i) => (
            <SortableRow key={item.id} id={item.id}>
              {dragProps => renderItem(item, i, dragProps)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

interface SortableRowProps {
  id: string
  children: (dragProps: DragHandleProps) => ReactNode
}

function SortableRow({ id, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Ensure the row floats above siblings while dragging so its shadow
        // isn't clipped by the next item.
        zIndex: isDragging ? 30 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {children({ attributes, listeners, isDragging })}
    </div>
  )
}

/**
 * A small grip-icon button you can drop wherever the drag handle should live.
 * Spread the drag-handle props from the SortableList renderItem callback.
 */
export function DragHandle({ attributes, listeners }: DragHandleProps) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className="h-8 w-8 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-grab active:cursor-grabbing touch-none shrink-0"
    >
      <GripVertical size={16} />
    </button>
  )
}

/*
 * Drag and drop, the only module that uses @dnd-kit. Sources are fields of the field list, chips in
 * the zones and header cells of the table; targets are the four zones (and the chips in them, for the
 * position) and the field list (drop there to remove).
 *
 * - Mouse, touch and keyboard sensors. A mouse drag starts after 5 px, so a click stays a click; a
 *   touch drag after a short press, so the list still scrolls with a swipe.
 * - The dragged item is drawn in an overlay above everything, so it is never cut off by a scrolling
 *   list, and the lists and the page scroll automatically near their edges while dragging.
 * - Screen reader instructions and announcements come from the labels.
 */

import React, { createContext, useContext, useMemo, useState } from "react";
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    pointerWithin,
    rectIntersection,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { fill } from "./labels.js";

/**
 * @typedef {{ kind: "field" | "chip" | "table", field: string, zone?: string, index?: number, type?: string, label?: string }} DragSource
 * @typedef {{ zone: string, index?: number }} DropTarget  zone "panel" removes
 */

const DragContext = createContext({ active: /** @type {DragSource | null} */ (null) });

/** The source being dragged, or null. */
export function useActiveDrag() {
    return useContext(DragContext).active;
}

/** Chips first: the pointer is inside a chip and its zone at once, the chip gives the position. */
function collision(args) {
    if (!args.pointerCoordinates) {
        // keyboard
        return closestCenter(args);
    }
    const hits = pointerWithin(args);
    const list = hits.length ? hits : rectIntersection(args);
    return [...list].sort((a, b) => Number(String(b.id).startsWith("chip:")) - Number(String(a.id).startsWith("chip:")));
}

/**
 * Keyboard moves: left and right step between the chips of the zone the item is over, up and down
 * also reach the other zones. The field list is never a keyboard target (removing is the x button).
 */
function keyboardCoordinates(event, args) {
    const { context } = args;
    const horizontal = event.code === "ArrowLeft" || event.code === "ArrowRight";
    const zone = context.over?.data?.current?.zone ?? context.active?.data?.current?.zone;
    const keep = context.droppableContainers.getEnabled().filter((entry) => {
        const d = entry?.data?.current;
        if (!d || d.kind === "panel") {
            return false;
        }
        return horizontal && zone ? d.kind === "chip" && d.zone === zone : true;
    });
    return sortableKeyboardCoordinates(event, { ...args, context: { ...context, droppableContainers: { getEnabled: () => keep, get: (id) => context.droppableContainers.get(id) } } });
}

/** Where a drop over `over` goes. */
export function targetOf(source, over) {
    const data = over?.data?.current;
    if (!data) {
        return null;
    }
    if (data.kind === "panel") {
        return { zone: "panel" };
    }
    if (data.kind === "zone") {
        return { zone: data.zone };
    }
    if (data.kind === "chip") {
        return { zone: data.zone, index: data.index };
    }
    return null;
}

/**
 * @param {{ labels: import("./labels.js").UiLabels, onDrop: (source: DragSource, target: DropTarget) => void,
 *   onDragStart?: (source: DragSource) => void, renderOverlay: (source: DragSource) => React.ReactNode, children: React.ReactNode }} props
 */
export function PivotDnd({ labels, onDrop, onDragStart, renderOverlay, children }) {
    const [active, setActive] = useState(/** @type {DragSource | null} */ (null));
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates })
    );
    const zoneName = (over) => {
        const t = targetOf(null, over);
        if (!t) {
            return null;
        }
        return t.zone === "panel" ? labels.fields : labels.zones[t.zone];
    };
    const nameOf = (a) => a?.data?.current?.label ?? a?.data?.current?.field ?? "";
    const accessibility = useMemo(
        () => ({
            screenReaderInstructions: { draggable: labels.dragInstructions },
            announcements: {
                onDragStart: ({ active: a }) => fill(labels.dragStart, { field: nameOf(a) }),
                onDragOver: ({ active: a, over }) => (zoneName(over) ? fill(labels.dragOver, { field: nameOf(a), zone: zoneName(over) }) : fill(labels.dragOverNone, { field: nameOf(a) })),
                onDragEnd: ({ active: a, over }) => (zoneName(over) ? fill(labels.dragEnd, { field: nameOf(a), zone: zoneName(over) }) : fill(labels.dragCancel, { field: nameOf(a) })),
                onDragCancel: ({ active: a }) => fill(labels.dragCancel, { field: nameOf(a) })
            }
        }),
        [labels]
    );
    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collision}
            accessibility={accessibility}
            autoScroll={{ threshold: { x: 0.15, y: 0.15 }, acceleration: 14 }}
            onDragStart={(e) => {
                const source = /** @type {DragSource} */ (e.active.data.current);
                setActive(source);
                onDragStart?.(source);
            }}
            onDragCancel={() => setActive(null)}
            onDragEnd={(e) => {
                const source = /** @type {DragSource} */ (e.active.data.current);
                setActive(null);
                const target = targetOf(source, e.over);
                if (source && target) {
                    onDrop(source, target);
                }
            }}
        >
            <DragContext.Provider value={{ active }}>{children}</DragContext.Provider>
            <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" }} zIndex={1000}>
                {active ? renderOverlay(active) : null}
            </DragOverlay>
        </DndContext>
    );
}

/** Splits dnd-kit's listeners: pointer and touch on the whole item, the keyboard on its handle only,
 *  so Enter on a button inside the item does not start a drag. */
function split(listeners) {
    const { onKeyDown, ...pointer } = listeners ?? {};
    return { pointer, keyboard: onKeyDown ? { onKeyDown } : {} };
}

/** A field of the field list or a table header cell. */
export function useDragSource(id, source, disabled = false) {
    const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({ id, data: source, disabled });
    const { pointer, keyboard } = split(listeners);
    return { setNodeRef, isDragging, itemProps: pointer, handleProps: { ref: setActivatorNodeRef, ...attributes, ...keyboard } };
}

/** A chip in a zone: draggable and sortable within its zone. */
export function useChip(id, source) {
    const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging, transform, transition } = useSortable({ id, data: source });
    const { pointer, keyboard } = split(listeners);
    const style = transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`, transition } : { transition };
    return { setNodeRef, isDragging, style, itemProps: pointer, handleProps: { ref: setActivatorNodeRef, ...attributes, ...keyboard } };
}

/** A drop zone: `kind` "zone" with its zone name, or "panel". */
export function useDropTarget(id, data) {
    const { setNodeRef, isOver } = useDroppable({ id, data });
    return { setNodeRef, isOver };
}

/** The sortable list of chips of one zone. */
export function ChipList({ ids, children }) {
    return (
        <SortableContext items={ids} strategy={rectSortingStrategy}>
            {children}
        </SortableContext>
    );
}

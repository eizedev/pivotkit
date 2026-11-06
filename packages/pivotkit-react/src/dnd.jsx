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
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { announcementsOf, nextTarget } from "./dnd-moves.js";

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

/** The coordinate getter of the keyboard sensor: the centre of the next target (nextTarget). */
function keyboardCoordinates(event, { context }) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
        return undefined;
    }
    event.preventDefault();
    const activeId = context.active?.id;
    const targets = context.droppableContainers
        .getEnabled()
        .filter((entry) => entry && entry.id !== activeId && (entry.data?.current?.kind === "zone" || entry.data?.current?.kind === "chip"))
        .map((entry) => ({ id: entry.id, zone: entry.data.current.zone, kind: entry.data.current.kind, index: entry.data.current.index }));
    const over = context.over?.data?.current ?? null;
    const id = nextTarget(event.code, targets, over, context.active?.data?.current ?? { kind: "field" });
    const rect = id === null ? null : context.droppableRects.get(id);
    const own = context.collisionRect;
    if (!rect || !own) {
        return undefined;
    }
    return { x: rect.left + rect.width / 2 - own.width / 2, y: rect.top + rect.height / 2 - own.height / 2 };
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
    const accessibility = useMemo(() => ({ screenReaderInstructions: { draggable: labels.dragInstructions }, announcements: announcementsOf(labels) }), [labels]);
    // the dragged item lands without an animation when the system asks for reduced motion
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
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
            <DragOverlay dropAnimation={reduced ? null : { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" }} zIndex={1000}>
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

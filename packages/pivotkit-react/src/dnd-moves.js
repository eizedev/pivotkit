/*
 * The pure parts of drag and drop, tested without a DOM: where a keyboard move goes, and what a
 * screen reader hears ("Region is over Rows, position 2 of 3"). dnd.jsx wires them to @dnd-kit.
 */

import { fill } from "./labels.js";

/** The zones in the order Up and Down step through them (the order they are shown in). */
const ZONE_ORDER = ["filters", "cols", "rows", "values"];

/**
 * Where a keyboard move goes, from the drop targets (zones and the chips in them) and the target the
 * item is over: Left and Right step through the positions of a zone (before each chip, then the end),
 * Up and Down go to the zone above or below. A field from the field list starts in Rows. The field
 * list is never a keyboard target (removing is the x button or the menu).
 * @param {string} key  "ArrowLeft", "ArrowRight", "ArrowUp" or "ArrowDown"
 * @param {Array<{ id: any, zone: string, kind: "zone" | "chip", index?: number }>} targets  without the item itself
 * @param {{ zone?: string, kind?: string, index?: number } | null} over  the target the item is over
 * @param {{ kind: string, zone?: string, index?: number }} active  the item
 * @returns {any} the id of the next target, or null to stay
 */
export function nextTarget(key, targets, over, active) {
    const inZone = (zone) =>
        targets.filter((t) => t.zone === zone).sort((a, b) => (a.kind === "zone" ? Infinity : (a.index ?? 0)) - (b.kind === "zone" ? Infinity : (b.index ?? 0)));
    const endOf = (zone) => inZone(zone).find((t) => t.kind === "zone")?.id ?? null;
    const zone = over?.zone ?? (active.kind === "chip" ? active.zone : null);
    if (!zone) {
        return endOf("rows");
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
        const at = ZONE_ORDER.indexOf(zone) + (key === "ArrowUp" ? -1 : 1);
        return at >= 0 && at < ZONE_ORDER.length ? endOf(ZONE_ORDER[at]) : null;
    }
    const list = inZone(zone);
    let pos = list.findIndex((t) => over && t.zone === over.zone && t.kind === over.kind && t.index === over.index);
    if (pos === -1) {
        // not over anything of this zone yet (the chip at its own place): the position it holds
        const after = list.findIndex((t) => t.kind === "zone" || (t.index ?? 0) > (active.index ?? -1));
        pos = key === "ArrowLeft" ? after : after - 1;
    }
    const next = list[pos + (key === "ArrowLeft" ? -1 : 1)];
    return next ? next.id : null;
}

/**
 * What a screen reader hears while dragging: the zone and the position ("Rows, position 2 of 3").
 * @param {import("./labels.js").UiLabels} labels
 */
export function announcementsOf(labels) {
    const nameOf = (a) => a?.data?.current?.label ?? a?.data?.current?.field ?? "";
    const where = (a, over, at, end, panel) => {
        const d = over?.data?.current;
        const field = nameOf(a);
        if (!d) {
            return null;
        }
        if (d.kind === "panel") {
            // a field of the list is not over a zone yet; a chip over the list is about to leave
            return a?.data?.current?.kind === "field" ? null : fill(panel, { field });
        }
        const zone = labels.zones[d.zone] ?? d.zone;
        if (d.kind === "chip") {
            const same = a?.data?.current?.kind === "chip" && a.data.current.zone === d.zone;
            const count = (d.count ?? d.index + 1) + (same ? 0 : 1);
            return fill(at, { field, zone, position: d.index + 1, count });
        }
        return fill(end, { field, zone });
    };
    return {
        onDragStart: ({ active: a }) => fill(labels.dragStart, { field: nameOf(a) }),
        onDragOver: ({ active: a, over }) => where(a, over, labels.dragOverAt, labels.dragOverEnd, labels.dragRemove) ?? fill(labels.dragOverNone, { field: nameOf(a) }),
        onDragEnd: ({ active: a, over }) => where(a, over, labels.dragEndAt, labels.dragEndEnd, labels.toastRemoved) ?? fill(labels.dragCancel, { field: nameOf(a) }),
        onDragCancel: ({ active: a }) => fill(labels.dragCancel, { field: nameOf(a) })
    };
}


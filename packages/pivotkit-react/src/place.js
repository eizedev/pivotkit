/*
 * Where a popover goes: below its anchor, above it when there is not enough room below, and always
 * inside the viewport with a margin; it stays next to its anchor, as tall as the room on that side,
 * and scrolls. A popover with a scrolling middle and a foot that must stay in view (the filter with
 * Apply, a chip menu with Remove) may `fill` instead: when it fits on neither side it is placed against
 * the window's edge, as tall as the window allows, over its anchor if need be. A popover is position: fixed; an ancestor with a transform, a
 * filter or `contain` (a router animation, a dialog, a carousel) makes itself the containing block of
 * fixed elements, so the place in viewport coordinates is moved by that block's origin (fromOrigin).
 * While it is open it keeps its side when its content changes (keepPlace).
 */

const MARGIN = 8;
const GAP = 6;

/**
 * The room a fixed popover has: the window without its scroll bars (the root's client box). A classic
 * scroll bar (Windows, 17 px) is part of innerWidth but not of the area fixed elements are laid out
 * in; placed against innerWidth, a popover at the right edge would reach under the scroll bar.
 * @param {Document} doc
 * @returns {{ width: number, height: number }}
 */
export function viewportOf(doc) {
    const root = doc.documentElement;
    const win = doc.defaultView;
    return { width: root?.clientWidth || win?.innerWidth || 0, height: root?.clientHeight || win?.innerHeight || 0 };
}

/**
 * @param {{ top: number, bottom: number, left: number, right: number }} anchor  getBoundingClientRect()
 * @param {{ width: number, height: number }} size  the popover's size
 * @param {{ width: number, height: number }} viewport
 * @param {"start" | "end"} [align]  which edge of the anchor the popover lines up with
 * @param {{ fill?: boolean }} [options]
 * @returns {{ top: number, left: number, maxHeight: number, side: "below" | "above" }}
 */
export function placePopover(anchor, size, viewport, align = "start", { fill = false } = {}) {
    const below = viewport.height - anchor.bottom - GAP - MARGIN;
    const above = anchor.top - GAP - MARGIN;
    const wanted = align === "end" ? anchor.right - size.width : anchor.left;
    const left = Math.max(MARGIN, Math.min(wanted, viewport.width - size.width - MARGIN));
    const most = Math.max(0, viewport.height - 2 * MARGIN);
    if (fill && size.height > below && size.height > above) {
        // fits on neither side: next to the anchor as far as the window lets it, over it if need be
        const height = Math.min(size.height, most);
        const side = below >= above ? "below" : "above";
        const near = side === "below" ? anchor.bottom + GAP : anchor.top - GAP - height;
        return { top: Math.max(MARGIN, Math.min(near, viewport.height - MARGIN - height)), left, maxHeight: most, side };
    }
    // next to the anchor, on the side where it fits, else the roomier one, scrolling inside
    const side = size.height <= below || below >= above ? "below" : "above";
    const room = side === "below" ? below : above;
    const height = Math.min(size.height, room);
    const top = side === "below" ? anchor.bottom + GAP : anchor.top - GAP - height;
    return { top: Math.max(MARGIN, top), left, maxHeight: Math.max(120, room), side };
}

/** Below this much room a popover kept on its side is placed anew (its panel was still loading). */
const KEEP_ROOM = 240;

/**
 * A popover whose content changes while it is open (a menu's level in place of its first level) stays
 * where it was: on its side, with its top below the anchor, its new content scrolling inside, instead
 * of jumping above the anchor or over it. Only while the anchor has not moved, and only when that side
 * has room enough (KEEP_ROOM, or the content's height); else `next`, placed anew.
 * @param {{ top: number, side: "below" | "above", anchorTop: number } | null} last  the last place, with the anchor's top then
 * @param {{ top: number, left: number, maxHeight: number, side: "below" | "above" }} next  placePopover's
 * @param {{ top: number, bottom: number }} anchor
 * @param {{ height: number }} size
 * @param {{ height: number }} viewport
 */
export function keepPlace(last, next, anchor, size, viewport) {
    if (!last || last.anchorTop !== anchor.top || last.side === next.side) {
        return next;
    }
    const room = last.side === "below" ? viewport.height - anchor.bottom - GAP - MARGIN : anchor.top - GAP - MARGIN;
    if (room < Math.min(size.height, KEEP_ROOM)) {
        return next;
    }
    const height = Math.min(size.height, room);
    const top = last.side === "below" ? anchor.bottom + GAP : anchor.top - GAP - height;
    return { ...next, top: Math.max(MARGIN, top), maxHeight: room, side: last.side };
}

/**
 * A place in viewport coordinates as the top and left of a fixed element whose containing block
 * starts at `origin` (the viewport rect of a fixed probe at 0, 0: { top: 0, left: 0 } without a
 * transformed ancestor).
 * @template {{ top: number, left: number }} T
 * @param {T} place
 * @param {{ top: number, left: number }} origin
 * @returns {T}
 */
export function fromOrigin(place, origin) {
    return { ...place, top: place.top - origin.top, left: place.left - origin.left };
}

/**
 * Whether a point is in the gap between an anchor and its popover placed below or above it (GAP
 * pixels), across both their widths: the way of a pointer moving from the one to the other. A hover
 * tip stays while the pointer is there (info.jsx), whatever time the move takes.
 * @param {{ top: number, bottom: number, left: number, right: number }} anchor  getBoundingClientRect()
 * @param {{ top: number, bottom: number, left: number, right: number }} popover  getBoundingClientRect()
 * @param {{ x: number, y: number } | null} point  client coordinates
 */
export function inGap(anchor, popover, point) {
    if (!point) {
        return false;
    }
    const [top, bottom] = popover.top >= anchor.bottom ? [anchor.bottom, popover.top] : [popover.bottom, anchor.top];
    return top <= bottom && point.y >= top && point.y <= bottom && point.x >= Math.min(anchor.left, popover.left) && point.x <= Math.max(anchor.right, popover.right);
}

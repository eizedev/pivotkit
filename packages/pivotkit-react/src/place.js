/*
 * Where a popover goes: below its anchor, above it when there is not enough room below, and always
 * inside the viewport with a margin. A popover is position: fixed; an ancestor with a transform, a
 * filter or `contain` (a router animation, a dialog, a carousel) makes itself the containing block of
 * fixed elements, so the place in viewport coordinates is moved by that block's origin (fromOrigin).
 */

const MARGIN = 8;
const GAP = 6;

/**
 * @param {{ top: number, bottom: number, left: number, right: number }} anchor  getBoundingClientRect()
 * @param {{ width: number, height: number }} size  the popover's size
 * @param {{ width: number, height: number }} viewport
 * @param {"start" | "end"} [align]  which edge of the anchor the popover lines up with
 * @returns {{ top: number, left: number, maxHeight: number, side: "below" | "above" }}
 */
export function placePopover(anchor, size, viewport, align = "start") {
    const below = viewport.height - anchor.bottom - GAP - MARGIN;
    const above = anchor.top - GAP - MARGIN;
    const side = size.height <= below || below >= above ? "below" : "above";
    const room = side === "below" ? below : above;
    const height = Math.min(size.height, room);
    const top = side === "below" ? anchor.bottom + GAP : anchor.top - GAP - height;
    const wanted = align === "end" ? anchor.right - size.width : anchor.left;
    const left = Math.max(MARGIN, Math.min(wanted, viewport.width - size.width - MARGIN));
    return { top: Math.max(MARGIN, top), left, maxHeight: Math.max(120, room), side };
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

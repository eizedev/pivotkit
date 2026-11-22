// Where a popover goes (place.js): next to its anchor and inside the window, its side kept while its
// content changes, the way from an i to its tip, and a transformed ancestor's origin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromOrigin, keepPlace, onTheWay, placePopover, viewportOf } from "../src/place.js";

test("popover placement: below, above when there is no room, inside the viewport", () => {
    const vp = { width: 800, height: 600 };
    assert.deepEqual(placePopover({ top: 100, bottom: 130, left: 50, right: 150 }, { width: 200, height: 200 }, vp).side, "below");
    const up = placePopover({ top: 500, bottom: 530, left: 50, right: 150 }, { width: 200, height: 300 }, vp);
    assert.equal(up.side, "above");
    assert.equal(up.top, 500 - 6 - 300);
    assert.equal(placePopover({ top: 10, bottom: 40, left: 750, right: 790 }, { width: 200, height: 100 }, vp).left, 800 - 200 - 8);
    assert.equal(placePopover({ top: 10, bottom: 40, left: 600, right: 790 }, { width: 200, height: 100 }, vp, "end").left, 590);
    // a popover that fits on neither side stays next to its anchor and scrolls: it never covers it
    const near = placePopover({ top: 240, bottom: 270, left: 50, right: 150 }, { width: 200, height: 400 }, { width: 800, height: 500 });
    assert.equal(near.side, "above");
    assert.ok(near.top + Math.min(400, near.maxHeight) <= 240 - 6, "above the anchor");
    // one that may fill (a scrolling middle, its foot in view: the filter) is placed against the
    // window's edge, as tall as the window allows, so its foot stays inside
    const low = placePopover({ top: 389, bottom: 419, left: 241, right: 271 }, { width: 340, height: 500 }, { width: 2000, height: 850 }, "start", { fill: true });
    assert.ok(low.top >= 8 && low.top + Math.min(500, low.maxHeight) <= 850 - 8);
    const tall = placePopover({ top: 300, bottom: 330, left: 0, right: 30 }, { width: 340, height: 900 }, vp, "start", { fill: true });
    assert.deepEqual([tall.top, tall.maxHeight], [8, 600 - 16]);
    // room enough below: next to the anchor either way
    assert.equal(placePopover({ top: 389, bottom: 419, left: 241, right: 271 }, { width: 340, height: 400 }, { width: 2000, height: 850 }, "start", { fill: true }).top, 425);
});

test("popover placement: the window's room without its scroll bars", () => {
    // a classic scroll bar of 17 px: innerWidth counts it, the area of fixed elements does not
    const doc = { documentElement: { clientWidth: 1263, clientHeight: 900 }, defaultView: { innerWidth: 1280, innerHeight: 900 } };
    assert.deepEqual(viewportOf(/** @type {any} */ (doc)), { width: 1263, height: 900 });
    const at = placePopover({ top: 10, bottom: 40, left: 1240, right: 1260 }, { width: 320, height: 100 }, viewportOf(/** @type {any} */ (doc)));
    assert.equal(at.left + 320, 1263 - 8, "its right edge a margin before the scroll bar");
    // no root box (a document being torn down): the window
    assert.deepEqual(viewportOf(/** @type {any} */ ({ documentElement: null, defaultView: { innerWidth: 800, innerHeight: 600 } })), { width: 800, height: 600 });
});

test("popover placement: the way from an i to its tip, moved aside to stay in the window", () => {
    // the i at the window's right, its tip below and further left (#213)
    const i = { top: 315, bottom: 339, left: 1214, right: 1238 };
    const below = { top: 345, bottom: 424, left: 952, right: 1272 };
    const centre = { x: (952 + 1272) / 2, y: (345 + 424) / 2 };
    // every point of the straight line from the i's centre to the tip's centre
    for (let k = 0; k <= 20; k++) {
        const x = 1226 + ((centre.x - 1226) * k) / 20;
        const y = 327 + ((centre.y - 327) * k) / 20;
        assert.equal(onTheWay(i, below, { x, y }), true, `${k} of 20`);
    }
    assert.equal(onTheWay(i, below, { x: 1174, y: 338.7 }), true, "the first of five steps: beside the i in its row");
    assert.equal(onTheWay(i, below, { x: 1226, y: 342 }), true, "in the gap under the i");
    assert.equal(onTheWay(i, below, { x: 1226, y: 327 }), true, "on the i");
    assert.equal(onTheWay(i, below, { x: 1000, y: 320 }), false, "far left in the i's row: not on the way");
    assert.equal(onTheWay(i, below, { x: 960, y: 342 }), false, "the gap's far left end, above the tip's corner");
    assert.equal(onTheWay(i, below, { x: 900, y: 380 }), false, "left of both");
    assert.equal(onTheWay(i, below, { x: 1226, y: 310 }), false, "above the i");
    assert.equal(onTheWay(i, below, { x: 1250, y: 330 }), true, "right of the i, above the tip's right part");
    assert.equal(onTheWay(i, below, { x: 1275, y: 330 }), false, "right of both");
    assert.equal(onTheWay(i, below, null), false, "no pointer seen");
    // a tip above its i, and one over it (a bottom sheet): the same rule
    const above = { top: 230, bottom: 309, left: 952, right: 1272 };
    assert.equal(onTheWay(i, above, { x: 1100, y: 312 }), true);
    assert.equal(onTheWay(i, above, { x: 1100, y: 335 }), false);
    // over its i: the hull of both, true where the page's :hover would say so anyway
    assert.equal(onTheWay(i, { top: 300, bottom: 400, left: 952, right: 1272 }, { x: 1226, y: 327 }), true);
    // boxes not laid out (0 × 0 at the origin): nowhere
    const none = { top: 0, bottom: 0, left: 0, right: 0 };
    assert.equal(onTheWay(none, none, { x: 0, y: 0 }), false);
    assert.equal(onTheWay(none, none, { x: 500, y: 300 }), false);
});

test("a popover inside a transformed ancestor is placed from that ancestor's origin", () => {
    const place = { top: 300, left: 120, maxHeight: 400, side: "below" };
    assert.deepEqual(fromOrigin(place, { top: 0, left: 0 }), place);
    assert.deepEqual(fromOrigin(place, { top: 200, left: 40 }), { top: 100, left: 80, maxHeight: 400, side: "below" });
});

test("a popover keeps its side while its content changes, as long as the anchor stays and the side has room", () => {
    const vp = { width: 1280, height: 800 };
    const anchor = { top: 450, bottom: 480, left: 50, right: 150 };
    // placed below with a short first level; a taller level would go above: it stays below and scrolls
    const first = placePopover(anchor, { width: 400, height: 300 }, vp);
    assert.equal(first.side, "below");
    const last = { top: first.top, side: first.side, anchorTop: anchor.top };
    const tall = placePopover(anchor, { width: 400, height: 600 }, vp);
    assert.equal(tall.side, "above");
    const kept = keepPlace(last, tall, anchor, { height: 600 }, vp);
    assert.deepEqual([kept.side, kept.top, kept.maxHeight], ["below", 486, 800 - 480 - 6 - 8]);
    // the anchor moved (a scroll): placed anew
    assert.equal(keepPlace({ ...last, anchorTop: 200 }, tall, anchor, { height: 600 }, vp), tall);
    // too little room on its side (the panel was still loading when it was placed): placed anew
    const low = { top: 700, bottom: 730, left: 50, right: 150 };
    const lowNext = placePopover(low, { width: 400, height: 500 }, vp);
    assert.equal(keepPlace({ top: 736, side: "below", anchorTop: 700 }, lowNext, low, { height: 500 }, vp), lowNext);
    assert.equal(keepPlace(null, tall, anchor, { height: 600 }, vp), tall);
});

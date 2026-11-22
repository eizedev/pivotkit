// The toolbar's buttons that go into "More" (overflow.js): a fixed priority, the room each button
// takes in the report's language, and never more than needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MORE_GROUPS, OVERFLOW_ORDER, TOOLBAR_ROOM, overflowHidden, toolbarRoom, toolbarTexts } from "../src/overflow.js";
import { LABELS } from "../src/labels.js";
// the German first-load texts: pivotkit-react adds them as it loads (deferred.js)
import "../src/deferred.js";

test("toolbar: which buttons go into More follows a fixed priority and the room left, never more than needed; More is always there (#580)", () => {
    // Redo stays with Undo: it never moves; a Data button goes first; Start over (where New is) and
    // Views, where the report is saved, go last. Table | Chart, the chart type, Layout and Options are
    // no toolbar buttons any more
    assert.deepEqual(OVERFLOW_ORDER, ["data", "startOver", "views"]);
    // More's groups hold every entry of the order once
    assert.deepEqual(MORE_GROUPS.flat().sort(), [...OVERFLOW_ORDER].sort());
    for (const gone of ["display", "chartType", "layout", "options"]) {
        assert.equal(Object.hasOwn(TOOLBAR_ROOM, gone), false, `${gone} takes no room`);
    }
    const present = ["startOver", "views"];
    // More is always in the toolbar: its room counts with every button shown too
    const all = TOOLBAR_ROOM.undo + TOOLBAR_ROOM.redo + TOOLBAR_ROOM.export + TOOLBAR_ROOM.more + present.reduce((n, id) => n + TOOLBAR_ROOM[id], 0);
    assert.deepEqual(overflowHidden(all, false, present), [], "room for every button");
    assert.deepEqual(overflowHidden(all - 0.1, false, present), ["startOver"], "a little less: Start over goes first");
    assert.deepEqual(overflowHidden(0, false, present), present, "no room: all of them");
    // a narrow report has the Fields button too: what goes makes room for it
    const narrowHidden = overflowHidden(all, true, present);
    const freed = narrowHidden.reduce((n, id) => n + TOOLBAR_ROOM[id], 0);
    assert.ok(freed >= TOOLBAR_ROOM.fields, "the Fields button fits");
    assert.ok(freed - Math.min(...narrowHidden.map((id) => TOOLBAR_ROOM[id])) < TOOLBAR_ROOM.fields, "no button more than needed");
    // a Data button's place costs nothing while there is none: the same as without it in the order
    for (let w = 20; w <= all + 1; w += 0.5) {
        assert.deepEqual(overflowHidden(w, false, present, { ...TOOLBAR_ROOM, data: 50 }), overflowHidden(w, false, present));
    }
    // ... and with one, it goes before Start over and Views
    assert.deepEqual(overflowHidden(all + 0.4, false, [...present, "data"], { ...TOOLBAR_ROOM, data: 0.5 }), ["data"]);
    assert.deepEqual(overflowHidden(0, false, [...present, "data"], { ...TOOLBAR_ROOM, data: 3 }), ["data", "startOver", "views"]);
});

test("toolbar: a button the room left holds stays, even when one before it in the order had to go", () => {
    const present = ["data", "startOver", "views"];
    // fixed parts 100 (More among them); Data is wide: once it has gone, the rest fits
    const room = { undo: 18, redo: 18, export: 59, data: 30, startOver: 5, views: 10, more: 5 };
    const fixed = 100;
    assert.deepEqual(overflowHidden(fixed + 20, false, present, room), ["data"]);
    // a little less: the order takes Start over too (110 fits in 112); neither comes back (115 and 140 do not fit)
    assert.deepEqual(overflowHidden(fixed + 12, false, present, room), ["data", "startOver"]);
    // every button is in the toolbar or in More, never both, and the result is in the order
    for (let w = 0; w <= fixed + 60; w += 1) {
        const hidden = overflowHidden(w, false, present, room);
        assert.deepEqual(hidden, present.filter((id) => hidden.includes(id)));
        const shown = present.filter((id) => !hidden.includes(id));
        const need = fixed + shown.reduce((n, id) => n + room[id], 0);
        assert.ok(need <= w || shown.length === 0, `${w}: the buttons shown fit`);
        // nothing in More would fit in the room left
        for (const id of hidden) {
            assert.ok(need + room[id] > w, `${w}: ${id} would fit`);
        }
    }
});

test("toolbar room: the texts of the report's language, plus what a button has around it", () => {
    const chrome = { text: 30, menu: 40, sep: 9, gap: 6 };
    // one px per character
    const en = toolbarRoom(toolbarTexts(LABELS.en), (t) => t.length, chrome);
    const de = toolbarRoom(toolbarTexts(LABELS.de), (t) => t.length, chrome);
    assert.equal(en.undo, 30 + "Undo".length + 6);
    assert.equal(de.undo, 30 + "Rückgängig".length + 6);
    assert.equal(en.startOver, 40 + "Start over".length + 6);
    assert.equal(de.startOver, 40 + "Neu beginnen".length + 6);
    assert.equal(en.more, 40 + "More".length + 6);
    // Table | Chart and the chart type are on the result's tabs, not in the toolbar
    assert.deepEqual([en.display, en.chartType, en.layout, en.options], [undefined, undefined, undefined, undefined]);
    // a host's own texts are measured as they are
    assert.equal(toolbarRoom(toolbarTexts({ ...LABELS.en, views: "Saved reports" }), (t) => t.length, chrome).views, 40 + "Saved reports".length + 6);
});

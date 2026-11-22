// The arrow keys inside one Tab stop (rove.js): the view tabs, and the fields of the field list with
// their controls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SLOTS, opensMenu, roveTarget, tabStep } from "../src/rove.js";

test("view tabs keys: left and right move between the tabs and wrap, Home and End go to the ends (#580)", () => {
    assert.equal(tabStep("ArrowRight", 0, 2), 1);
    assert.equal(tabStep("ArrowRight", 1, 2), 0, "past the last: the first");
    assert.equal(tabStep("ArrowLeft", 0, 2), 1, "before the first: the last");
    assert.equal(tabStep("Home", 1, 2), 0);
    assert.equal(tabStep("End", 0, 2), 1);
    // Enter and Space show the tab (manual activation): the tab's own click
    assert.equal(tabStep("Enter", 0, 2), null);
    assert.equal(tabStep("ArrowDown", 0, 2), null);
});

test("field list keys: up and down between fields, left and right between a field's controls", () => {
    assert.deepEqual(SLOTS, ["handle", "name", "info", "menu"]);
    // row 1 has an "i", the others do not
    const slotsOf = (row) => (row === 1 ? ["handle", "name", "info", "menu"] : ["handle", "name", "menu"]);
    assert.deepEqual(roveTarget("ArrowDown", { row: 0, slot: "name" }, 3, slotsOf), { row: 1, slot: "name" });
    assert.deepEqual(roveTarget("ArrowDown", { row: 2, slot: "name" }, 3, slotsOf), { row: 2, slot: "name" }, "the last field stays");
    assert.deepEqual(roveTarget("ArrowUp", { row: 0, slot: "menu" }, 3, slotsOf), { row: 0, slot: "menu" });
    assert.deepEqual(roveTarget("ArrowDown", { row: 0, slot: "menu" }, 3, slotsOf), { row: 1, slot: "menu" }, "the column stays");
    assert.deepEqual(roveTarget("ArrowDown", { row: 1, slot: "info" }, 3, slotsOf), { row: 2, slot: "name" }, "a field without an i: its name");
    assert.deepEqual(roveTarget("End", { row: 0, slot: "handle" }, 3, slotsOf), { row: 2, slot: "handle" });
    assert.deepEqual(roveTarget("Home", { row: 2, slot: "name" }, 3, slotsOf), { row: 0, slot: "name" });
    assert.deepEqual(roveTarget("ArrowRight", { row: 1, slot: "name" }, 3, slotsOf), { row: 1, slot: "info" });
    assert.deepEqual(roveTarget("ArrowRight", { row: 0, slot: "name" }, 3, slotsOf), { row: 0, slot: "menu" });
    assert.deepEqual(roveTarget("ArrowRight", { row: 0, slot: "menu" }, 3, slotsOf), { row: 0, slot: "menu" }, "the last control stays");
    assert.deepEqual(roveTarget("ArrowLeft", { row: 0, slot: "name" }, 3, slotsOf), { row: 0, slot: "handle" });
    assert.equal(roveTarget("Enter", { row: 0, slot: "name" }, 3, slotsOf), null, "Enter is the control's own");
    assert.equal(roveTarget("ArrowDown", { row: 0, slot: "name" }, 0, slotsOf), null);
    assert.equal(opensMenu({ key: "F10", shiftKey: true }), true);
    assert.equal(opensMenu({ key: "ContextMenu", shiftKey: false }), true);
    assert.equal(opensMenu({ key: "F10", shiftKey: false }), false);
});

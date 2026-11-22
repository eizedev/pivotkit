// Drag and drop without a pointer (dnd-moves.js): where the arrow keys move a field, and what a screen
// reader hears while a field moves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { announcementsOf, nextTarget } from "../src/dnd-moves.js";
import { LABELS } from "../src/labels.js";

const en = LABELS.en;

test("keyboard drag: left and right through a zone's positions, up and down through the zones", () => {
    const targets = [
        { id: "zone:filters", zone: "filters", kind: "zone" },
        { id: "zone:cols", zone: "cols", kind: "zone" },
        { id: "chip:rows:A", zone: "rows", kind: "chip", index: 0 },
        { id: "chip:rows:C", zone: "rows", kind: "chip", index: 2 },
        { id: "zone:rows", zone: "rows", kind: "zone" },
        { id: "zone:values", zone: "values", kind: "zone" }
    ];
    const field = { kind: "field" };
    // a field from the field list starts in Rows, at the end
    assert.equal(nextTarget("ArrowRight", targets, null, field), "zone:rows");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "zone" }, field), "chip:rows:C");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "chip", index: 2 }, field), "chip:rows:A");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "chip", index: 0 }, field), null, "the first position");
    assert.equal(nextTarget("ArrowUp", targets, { zone: "rows", kind: "chip", index: 0 }, field), "zone:cols");
    assert.equal(nextTarget("ArrowUp", targets, { zone: "cols", kind: "zone" }, field), "zone:filters");
    assert.equal(nextTarget("ArrowDown", targets, { zone: "rows", kind: "zone" }, field), "zone:values");
    assert.equal(nextTarget("ArrowDown", targets, { zone: "values", kind: "zone" }, field), null);
    // the chip B (index 1) of Rows, not over anything yet: left is before A, right is before C
    const chip = { kind: "chip", zone: "rows", index: 1 };
    assert.equal(nextTarget("ArrowLeft", targets, null, chip), "chip:rows:A");
    assert.equal(nextTarget("ArrowRight", targets, null, chip), "chip:rows:C");
    assert.equal(nextTarget("ArrowUp", targets, null, chip), "zone:cols");
});

test("drag announcements name the zone and the position", () => {
    const a = announcementsOf(en);
    const active = { data: { current: { kind: "field", label: "Region" } } };
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "chip", zone: "rows", index: 1, count: 2 } } } }), "Region is over Rows, position 2 of 3.");
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "zone", zone: "cols", count: 0 } } } }), "Region is over Columns, at the end.");
    assert.equal(a.onDragOver({ active, over: null }), "Region is not over a zone.");
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "panel" } } } }), "Region is not over a zone.", "a field still in the list");
    const chip = { data: { current: { kind: "chip", zone: "rows", index: 0, label: "Region" } } };
    assert.equal(a.onDragEnd({ active: chip, over: { data: { current: { kind: "chip", zone: "rows", index: 1, count: 2 } } } }), "Region dropped in Rows, position 2 of 2.");
    assert.equal(a.onDragEnd({ active: chip, over: { data: { current: { kind: "panel" } } } }), "Region removed");
    assert.match(en.dragInstructions, /menu/, "the instructions name the menu as the other way");
});

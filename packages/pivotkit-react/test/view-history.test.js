// The undo history (view-history.js): each step with its note, Undo and Redo, a reset as a step, the
// saved view a step shows, and what a controlled host passes back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_LIMIT, answered, createState, record, redo, reset, settle, tagFor, told, undo } from "../src/view-history.js";

test("history: steps with notes, undo and redo say what they did, reset is a step", () => {
    let s = createState("schema", "start");
    s = record(s, "a", "Region added to Rows");
    s = record(s, "b", "Region removed");
    assert.equal(record(s, "b", "nothing"), s, "an unchanged view is no step");
    const u = undo(s);
    assert.deepEqual([u.state.present, u.note], ["a", "Region removed"]);
    const r = redo(u.state);
    assert.deepEqual([r.state.present, r.note], ["b", "Region removed"]);
    assert.equal(undo(createState("x", "y")).note, null);
    const back = reset(s, "back to the start view");
    assert.equal(back.present, "start");
    assert.equal(undo(back).state.present, "b", "a reset can be undone");
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = record(s, `v${i}`, `step ${i}`);
    assert.equal(s.past.length, HISTORY_LIMIT);
});

test("history: the host passing back what it got changes nothing; another view is a step; a new schema starts over", () => {
    let s = record(createState("schema", "start"), "a", "first");
    const at = (shown, schema = "schema") => ({ schema, start: "start", shown, outside: "change from outside" });
    assert.equal(settle(s, at("a")), s, "the same view: the history stays as it is");
    const outside = settle(s, at("loaded"));
    assert.deepEqual([outside.present, outside.past.length, undo(outside).note], ["loaded", 2, "change from outside"]);
    const fresh = settle(s, at("renormalized", "other"));
    assert.deepEqual([fresh.schema, fresh.present, fresh.past.length, fresh.start], ["other", "renormalized", 0, "start"]);
});

test("history: each step carries the saved view it shows; Undo and Redo move it with the view", () => {
    const x = { name: "X" };
    let s = createState("schema", "start");
    assert.equal(s.tag, null);
    s = record(s, "x", "view “X”", x);
    s = record(s, "x2", "Region added", undefined);
    assert.equal(s.tag, x, "a change keeps the tag of the view before");
    s = record(s, "empty", "new, empty report", null);
    assert.equal(s.tag, null);
    const back = undo(s).state;
    assert.equal(back.tag, x, "Undo after New: the name is back");
    assert.equal(redo(back).state.tag, null, "Redo after it: the empty view has none");
    assert.equal(reset(back, "back").tag, null, "Reset: the start view is no saved view");
    assert.equal(undo(reset(back, "back")).state.tag, x);
    // the same view with another tag (a save, the same view loaded): no step
    const saved = record(back, "x2", "saved", { name: "Y" });
    assert.deepEqual([saved.past.length, saved.tag.name], [back.past.length, "Y"]);
});

test("history tags: a new schema starts without one, a change from outside keeps it, another source's is no name, a save keeps the redo steps", () => {
    const x = { name: "X", sourceId: "sales" };
    const s = record(createState("schema", "start"), "x", "view “X”", x);
    // another schema: a new history from the view shown, no saved view
    const fresh = settle(s, { schema: "other", start: "start", shown: "x", outside: "change from outside" });
    assert.equal(fresh.tag, null);
    // the host passed another view: a step from outside, the tag stays with the view before it
    const outside = settle(s, { schema: "schema", start: "start", shown: "y", outside: "change from outside" });
    assert.deepEqual([outside.present, outside.tag, undo(outside).state.tag], ["y", x, x]);
    // Undo into a step loaded for another source: the step keeps its tag, the report shows no name
    const tickets = record(record(createState("schema", "start"), "t", "view “T”", { name: "T", sourceId: "tickets" }), "t2", "Team added");
    const back = undo(tickets).state;
    assert.equal(back.tag.name, "T");
    assert.equal(tagFor(back.tag, "sales"), null);
    assert.equal(tagFor(back.tag, "tickets"), back.tag);
    assert.equal(tagFor(null, undefined), null);
    // a save while Redo has steps: the view and the redo steps stay, only the tag of the view shown
    const undone = undo(record(s, "x2", "Region added")).state;
    const saved = record(undone, "x", "saved", { name: "Y", sourceId: "sales" });
    assert.deepEqual([saved.future.length, saved.tag.name], [1, "Y"]);
    assert.deepEqual([redo(saved).state.present, redo(saved).state.tag], ["x2", x], "the step redone keeps its own tag");
    assert.equal(undo(redo(saved).state).state.tag.name, "Y");
});

test("the views a controlled host has not passed back: at most HISTORY_LIMIT, the ones after its answer wait (#204)", () => {
    // a host that never passes a view back: every change is told, the list stays at the limit, the newest kept
    let pending = [];
    for (let i = 0; i < HISTORY_LIMIT * 3; i++) {
        pending = told(pending, `v${i}`);
    }
    assert.equal(pending.length, HISTORY_LIMIT);
    assert.equal(pending[0], `v${HISTORY_LIMIT * 2}`);
    assert.equal(pending.at(-1), `v${HISTORY_LIMIT * 3 - 1}`);
    // a host that answers late (#141): the views told after the one it passes still wait
    assert.deepEqual(answered(["a", "b", "c"], "a"), ["b", "c"]);
    assert.deepEqual(answered(["a", "b", "c"], "c"), []);
    // a view it was not told is a change of its own: nothing waits
    assert.deepEqual(answered(["a", "b"], "x"), []);
});

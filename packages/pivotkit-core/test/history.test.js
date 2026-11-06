import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistory, emptyView } from "../src/index.js";

test("undo, redo, reset and the limit", () => {
    const start = { ...emptyView(), rows: ["Region"] };
    const h = createHistory(start, { limit: 3 });
    assert.equal(h.canUndo, false);
    const v1 = { ...start, cols: ["Product"] };
    assert.equal(h.push(v1), true);
    assert.equal(h.push({ ...v1 }), false, "an unchanged view is no step");
    h.push({ ...v1, display: "chart" });
    assert.equal(h.undo().display, "table");
    assert.equal(h.canRedo, true);
    assert.equal(h.redo().display, "chart");
    h.undo();
    h.push({ ...v1, rows: [] });
    assert.equal(h.canRedo, false, "a new step clears redo");
    assert.deepEqual(h.reset(), start);
    assert.deepEqual(h.undo().rows, []);
    for (let i = 0; i < 10; i++) {
        h.push({ ...start, sort: [{ field: "Region", by: "label", order: i % 2 ? "asc" : "desc" }] });
    }
    let steps = 0;
    while (h.canUndo) {
        h.undo();
        steps++;
    }
    assert.equal(steps, 3);
});

test("the history keeps copies", () => {
    const start = emptyView();
    const h = createHistory(start);
    const v = { ...start, rows: ["a"] };
    h.push(v);
    v.rows.push("b");
    assert.deepEqual(h.current.rows, ["a"]);
    h.current.rows.push("c");
    assert.deepEqual(h.current.rows, ["a"]);
    start.rows.push("z");
    assert.deepEqual(h.reset().rows, []);
});

// The room the table's row labels share (label-room.js). The room of a chart's labels is
// pivotkit-core's test/chart/label-room.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commonCap } from "../src/label-room.js";

test("row labels share their room (#584): short ones keep their width, long ones share the rest", () => {
    // all fit: no cap
    assert.equal(commonCap([80, 120, 100], 300), Infinity);
    assert.equal(commonCap([80, 120, 100], 400), Infinity);
    // 40 keeps its width; 120 and 100 share the 140 left: 70 each
    assert.equal(commonCap([40, 120, 100], 180), 70);
    // none is short enough to keep its width: an equal part each
    assert.equal(commonCap([80, 120, 100], 210), 70);
    // the caps add up to the room
    const widths = [30, 200, 90, 160];
    const cap = commonCap(widths, 400);
    assert.equal(widths.reduce((s, w) => s + Math.min(w, cap), 0), 400);
    // no room: 0 (the stylesheet's least width then applies)
    assert.equal(commonCap([80, 120], 0), 0);
    assert.equal(commonCap([80, 120], -50), 0);
    assert.equal(commonCap([], 100), Infinity);
});

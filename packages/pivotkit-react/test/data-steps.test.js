// The data steps exist twice: in data-history.js (loaded with the import UI) and in use-shown-data.js
// (the first load). The two copies must say the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as history from "../src/data-history.js";
import * as shown from "../src/use-shown-data.js";

test("the first load's data steps agree with data-history.js", () => {
    assert.deepEqual(shown.NO_DATA_STEPS, history.NO_DATA_STEPS);
    const steps = { past: [{ data: null, history: {}, note: "a" }], future: [{ data: 1, history: {}, note: "b" }] };
    assert.deepEqual(shown.withoutFuture(steps), history.withoutFuture(steps));
    const none = { past: steps.past, future: [] };
    assert.equal(shown.withoutFuture(none), none);
    assert.equal(history.withoutFuture(none), none);
});

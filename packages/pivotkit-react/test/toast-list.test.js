// The notes shown at once: an error stays until it is closed, even when newer notes come.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SHOWN, withToast } from "../src/toast-list.js";

const note = (id, tone) => ({ id, text: `note ${id}`, ...(tone ? { tone } : {}) });
const ids = (list) => list.map((t) => t.id);

test("at most MAX_SHOWN notes; the oldest goes first", () => {
    assert.equal(MAX_SHOWN, 2);
    assert.deepEqual(ids(withToast([note(1), note(2)], note(3))), [2, 3]);
});

test("an error stays when two later notes come; the notes beside it take turns", () => {
    let list = withToast([], note(1, "error"));
    list = withToast(list, note(2));
    list = withToast(list, note(3));
    assert.deepEqual(ids(list), [1, 3]);
});

test("errors only: the oldest error goes", () => {
    assert.deepEqual(ids(withToast([note(1, "error"), note(2, "error")], note(3, "error"))), [2, 3]);
});

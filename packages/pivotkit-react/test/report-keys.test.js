// The report's own keys (report-keys.js): Undo and Redo by Ctrl or Cmd, Escape ending Enlarge only
// once nothing else of the report is open, and fields keeping their keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportKeys } from "../src/report-keys.js";

/** A keydown as the root gets it; `closest` says whether the target is inside a field. */
const key = (k, { ctrl = false, meta = false, shift = false, alt = false, inField = false, prevented = false } = {}) => {
    const e = { key: k, ctrlKey: ctrl, metaKey: meta, shiftKey: shift, altKey: alt, defaultPrevented: prevented, target: { closest: () => (inField ? {} : null) }, preventDefault() { this.defaultPrevented = true; } };
    return e;
};

/** The handler with a log of what it did. */
const setup = ({ enlarged = false, open = false } = {}) => {
    const log = [];
    const big = { enlarged, setEnlarged: (on) => log.push(`enlarged:${on}`) };
    return { log, onKey: reportKeys({ big, layer: null, open, undo: () => log.push("undo"), redo: () => log.push("redo") }) };
};

test("Ctrl or Cmd with Z undoes, with Shift or Y redoes; Alt and fields keep their keys", () => {
    const { log, onKey } = setup();
    onKey(key("z", { ctrl: true }));
    onKey(key("Z", { meta: true, shift: true }));
    onKey(key("y", { ctrl: true }));
    onKey(key("z", { ctrl: true, alt: true }));
    onKey(key("z", { ctrl: true, inField: true }));
    onKey(key("z"));
    assert.deepEqual(log, ["undo", "redo", "redo"]);
});

test("Escape ends Enlarge only while nothing else of the report is open and no one took the key", () => {
    const enlarged = setup({ enlarged: true });
    const e = key("Escape");
    enlarged.onKey(e);
    assert.deepEqual(enlarged.log, ["enlarged:false"]);
    assert.equal(e.defaultPrevented, true);
    const open = setup({ enlarged: true, open: true });
    open.onKey(key("Escape"));
    const taken = setup({ enlarged: true });
    taken.onKey(key("Escape", { prevented: true }));
    const notEnlarged = setup();
    notEnlarged.onKey(key("Escape"));
    assert.deepEqual([...open.log, ...taken.log, ...notEnlarged.log], []);
});

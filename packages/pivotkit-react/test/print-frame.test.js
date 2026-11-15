// The print frame's life without a browser (print-frame.js): a frame removed while it loads gives up
// at once (its load timer ends with it), a loaded one is shown and counts as loaded. The browser
// specs (tests/browser/report-export.spec.js) cover printing itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropPrintFrame, preparePrintFrame, releasePrintFrame, takePrintFrame } from "../src/print-frame.js";

/** An <iframe> as far as print-frame.js uses one while it loads. */
class FakeFrame extends EventTarget {
    hidden = false;
    className = "";
    title = "";
    srcdoc = "";
    isConnected = false;
    /** @type {{ URL: string, readyState: string } | null} */
    contentDocument = null;
    setAttribute() {}
    remove() {
        this.isConnected = false;
    }
    /** The frame's own document has loaded. */
    load() {
        this.contentDocument = { URL: "about:srcdoc", readyState: "complete" };
        this.dispatchEvent(new Event("load"));
    }
}

/** A report's root holding print frames. */
function fakeRoot() {
    /** @type {FakeFrame[]} */
    const frames = [];
    return {
        frames,
        ownerDocument: { createElement: () => new FakeFrame() },
        append(frame) {
            frame.isConnected = true;
            frames.push(frame);
        },
        querySelectorAll: () => frames.filter((f) => f.isConnected)
    };
}

/** The value a promise has within `ms`, or "pending". */
const within = (promise, ms) => Promise.race([promise, new Promise((done) => setTimeout(() => done("pending"), ms))]);

test("a print frame removed while it loads gives up at once, not after the load timeout (#210)", async () => {
    const root = /** @type {any} */ (fakeRoot());
    const slot = takePrintFrame(root);
    assert.equal(slot.frame.hidden, true);
    dropPrintFrame(slot);
    assert.equal(await within(slot.loaded, 50), false);
    assert.equal(slot.isLoaded, false);
});

test("the menu's ready frame, released while it loads, gives up at once too (#210)", async () => {
    const root = /** @type {any} */ (fakeRoot());
    preparePrintFrame(root);
    const [frame] = root.frames;
    releasePrintFrame(root);
    assert.equal(frame.isConnected, false);
    // a print after the release makes a frame of its own
    const slot = takePrintFrame(root);
    assert.notEqual(slot.frame, frame);
    dropPrintFrame(slot);
    assert.equal(await within(slot.loaded, 50), false);
});

test("a loaded print frame is shown, counts as loaded and is the one a print takes (#210)", async () => {
    const root = /** @type {any} */ (fakeRoot());
    preparePrintFrame(root);
    const [frame] = root.frames;
    frame.load();
    const slot = takePrintFrame(root);
    assert.equal(slot.frame, frame);
    assert.equal(await within(slot.loaded, 50), true);
    assert.equal(slot.isLoaded, true);
    assert.equal(frame.hidden, false);
    // removed after it loaded: it stays loaded (nothing resolves it again)
    dropPrintFrame(slot);
    assert.equal(await slot.loaded, true);
});

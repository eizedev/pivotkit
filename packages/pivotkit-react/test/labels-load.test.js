// A language's first-load texts loaded on demand (pivotkit-element: deferred-late.js): what a report
// shows while they load, when they fail, when they take too long, and when it tries again. A file of
// its own, so labels.js's module state (which languages are here, which failed) starts empty.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { LABELS, LABELS_WAIT_MS, en, hasLabels, labelsHere, onLabels, requestLabels } from "../src/labels.js";

const texts = (lang) => ({ ...en, lang, report: `report in ${lang}` });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a failed load lets English stand in, says so once, and a later report's try takes the texts", async () => {
    const warn = mock.method(console, "warn", () => {});
    let heard = 0;
    const stop = onLabels(() => heard++);
    let fails = true;
    const loaders = { xa: () => (fails ? Promise.reject(new Error("offline")) : Promise.resolve().then(() => { LABELS.xa = texts("xa"); })) };
    assert.equal(labelsHere("xa-XA", loaders), false, "the report waits for its texts");
    requestLabels("xa-XA", loaders);
    await settle();
    assert.equal(labelsHere("xa-XA", loaders), true, "English stands in");
    assert.equal(hasLabels("xa"), false);
    assert.equal(heard, 1, "the reports waiting were told");
    // a second failure is not said again
    requestLabels("xa", loaders, { again: true });
    await settle();
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /the xa texts did not load, English stands in: offline/);
    // the next report that mounts tries again, and takes them
    fails = false;
    requestLabels("xa", loaders, { again: true });
    await settle();
    assert.equal(LABELS.xa.report, "report in xa");
    stop();
    warn.mock.restore();
});

test("texts that do not arrive within the time limit let English stand in; arriving later, they are added", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const warn = mock.method(console, "warn", () => {});
    try {
        const { promise, resolve } = Promise.withResolvers();
        const loaders = { xb: () => promise.then(() => { LABELS.xb = texts("xb"); }) };
        requestLabels("xb", loaders);
        assert.equal(labelsHere("xb", loaders), false);
        mock.timers.tick(LABELS_WAIT_MS - 1);
        assert.equal(labelsHere("xb", loaders), false, "still waiting");
        mock.timers.tick(1);
        assert.equal(labelsHere("xb", loaders), true, "English after the time limit");
        assert.match(warn.mock.calls[0].arguments[0], /no answer within 4 s/);
        resolve();
        await settle();
        assert.equal(hasLabels("xb"), true);
    } finally {
        warn.mock.restore();
        mock.timers.reset();
    }
});

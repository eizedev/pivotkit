// The events of <pivot-report>: bubbling, composed CustomEvents, and respondWith() for the template
// callbacks whose promise the report waits for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENTS, emit, request } from "../src/events.js";

test("every event name starts with pivot-", () => {
    for (const name of Object.values(EVENTS)) {
        assert.match(name, /^pivot-[a-z-]+$/);
    }
});

test("emit: bubbles, composed, cancelable only when asked; false when prevented", () => {
    const target = new EventTarget();
    let seen;
    target.addEventListener("pivot-export", (e) => {
        seen = e;
        e.preventDefault();
    });
    assert.equal(emit(target, "pivot-export", { kind: "csv" }, { cancelable: true }), false);
    assert.equal(seen.bubbles, true);
    assert.equal(seen.composed, true);
    assert.deepEqual(seen.detail, { kind: "csv" });
    // not cancelable: preventDefault() changes nothing
    assert.equal(emit(target, "pivot-export", {}), true);
});

test("request: the promise settles with the listener's answer", async () => {
    const target = new EventTarget();
    target.addEventListener("pivot-template-save", (e) => e.detail.respondWith(Promise.resolve(`stored ${e.detail.name}`)));
    assert.equal(await request(target, "pivot-template-save", { name: "A" }), "stored A");
});

test("request: a rejected answer rejects, so the report shows the error", async () => {
    const target = new EventTarget();
    target.addEventListener("pivot-template-delete", (e) => e.detail.respondWith(Promise.reject(new Error("no access"))));
    await assert.rejects(request(target, "pivot-template-delete", { name: "A" }), /no access/);
});

test("request: without a listener or an answer it resolves at once, with a warning", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    assert.equal(await request(new EventTarget(), "pivot-template-save", { name: "A" }), undefined);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /no listener answered pivot-template-save/);
    // an answer: no warning
    const target = new EventTarget();
    target.addEventListener("pivot-template-save", (e) => e.detail.respondWith(undefined));
    await request(target, "pivot-template-save", {});
    assert.equal(warn.mock.callCount(), 1);
});

test("request: respondWith() only while the event is dispatched, and once", async () => {
    const target = new EventTarget();
    let later;
    let second;
    target.addEventListener("pivot-template-save", (e) => {
        later = e.detail.respondWith;
        e.detail.respondWith(1);
        try {
            e.detail.respondWith(2);
        } catch (err) {
            second = err;
        }
    });
    assert.equal(await request(target, "pivot-template-save", {}), 1);
    assert.equal(second.name, "InvalidStateError");
    assert.throws(() => later(3), { name: "InvalidStateError" });
});

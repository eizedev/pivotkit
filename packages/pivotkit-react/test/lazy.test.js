// lazy(): a part loaded on demand is imported once, and a failed import is tried again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lazy } from "../src/lazy.js";

test("imports once, gives the module at once afterwards", async () => {
    let calls = 0;
    const part = lazy(async () => ({ n: ++calls }));
    assert.equal(part.now(), null);
    const [a, b] = await Promise.all([part.load(), part.load()]);
    assert.equal(a, b);
    assert.equal(calls, 1);
    assert.equal(part.now(), a);
});

test("a failed import is forgotten: the next call tries again", async () => {
    let calls = 0;
    const part = lazy(async () => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
        return { ok: true };
    });
    await assert.rejects(part.load(), /offline/);
    assert.equal(part.now(), null);
    assert.deepEqual(await part.load(), { ok: true });
    assert.equal(calls, 2);
});

// until() (tests/until.js): it goes on as soon as the condition holds, with the condition's value, and
// throws with its message when the condition never holds within its tries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "./until.js";

test("until: the condition's value once it holds, asked again until then", async () => {
    let asked = 0;
    const value = await until(() => (++asked === 3 ? { at: asked } : 0), { every: 1 });
    assert.deepEqual([value, asked], [{ at: 3 }, 3]);
    // an async condition, true at once: asked once
    let once = 0;
    assert.equal(await until(async () => (++once, "ready")), "ready");
    assert.equal(once, 1);
});

test("until: a condition that never holds throws its message after its tries", async () => {
    let asked = 0;
    await assert.rejects(until(() => (asked++, ""), { message: "never ready", tries: 4, every: 1 }), { message: "never ready (after 4 tries 1 ms apart)" });
    assert.equal(asked, 4);
});

// The playground's static server: a malformed path gets 400, a path that climbs out of its folder
// stays inside it, and the server keeps serving.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { startPlayground } from "./playground-server.js";

test("the playground server answers 400 to a malformed path, reads a path that climbs out of its folder inside it, and keeps running", async () => {
    const { base, child } = await startPlayground();
    try {
        const bad = await fetch(`${base}%E0%A4%A`);
        assert.equal(bad.status, 400);
        const next = await fetch(`${base}no-such-file.js`);
        assert.equal(next.status, 404);
        // "../../package.json" loses its "../" and names dist/package.json, which does not exist
        const outside = await fetch(`${base}..%2F..%2Fpackage.json`);
        assert.equal(outside.status, 404);
        // still answering after each refusal; without a build the playground has no files to serve
        const again = await fetch(`${base}no-such-file.js`);
        assert.equal(again.status, 404);
    } finally {
        child.kill();
        await once(child, "exit");
    }
});

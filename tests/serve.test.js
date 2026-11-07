import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

/** Starts the playground's static server on a free port; resolves with its base URL and the process. */
async function startServer() {
    const child = spawn(process.execPath, [new URL("../examples/playground/serve.js", import.meta.url).pathname, "0"], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    for await (const chunk of child.stdout) {
        out += chunk;
        const match = out.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
        if (match) {
            return { base: match[0], child };
        }
    }
    throw new Error(`the server did not start: ${out}`);
}

test("the playground server answers 400 to a malformed path and keeps running", async () => {
    const { base, child } = await startServer();
    try {
        const bad = await fetch(`${base}%E0%A4%A`);
        assert.equal(bad.status, 400);
        const next = await fetch(`${base}no-such-file.js`);
        assert.equal(next.status, 404);
        const outside = await fetch(`${base}..%2F..%2Fpackage.json`);
        assert.notEqual(outside.status, 200);
    } finally {
        child.kill();
        await once(child, "exit");
    }
});

// Starts examples/playground/serve.js, the playground's static server, for a test (on a free port) or
// a docs script (scripts/docs-playground.js, on a port of its own).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVE = fileURLToPath(new URL("../examples/playground/serve.js", import.meta.url));

/**
 * Starts the server and resolves with its base URL once it prints it. The caller stops `child`.
 * Fails, and stops the server, when it ends or prints no address within `ms`: also when the port is
 * taken, so a caller never talks to another server on that port.
 * @param {{ script?: string, port?: number, ms?: number }} [options]  another copy of serve.js; the
 *   port (0: a free one); the time limit
 * @returns {Promise<{ base: string, child: import("node:child_process").ChildProcess }>}
 */
export async function startPlayground({ script = SERVE, port = 0, ms = 10_000 } = {}) {
    const child = spawn(process.execPath, [script, String(port)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    // a listener, not a for await loop: leaving such a loop destroys the pipe, and a line the server
    // prints later would end it. The pipe stays read for as long as the server runs.
    const base = await new Promise((resolve) => {
        // wall time: a server that hangs before it prints its address fails the test instead of the run
        const timer = setTimeout(() => resolve(null), ms);
        const done = (value) => {
            clearTimeout(timer);
            child.stdout.off("data", read);
            child.off("exit", ended);
            resolve(value);
        };
        const read = (chunk) => {
            out += chunk;
            const found = /http:\/\/127\.0\.0\.1:\d+\//.exec(out)?.[0];
            if (found) done(found);
        };
        const ended = () => done(null);
        child.stdout.on("data", read);
        child.once("exit", ended);
    });
    if (base) {
        child.stdout.resume();
        return { base, child };
    }
    child.kill();
    throw new Error(`the server did not start: ${out}`);
}

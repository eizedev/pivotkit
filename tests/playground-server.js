// Starts examples/playground/serve.js, the playground's static server, on a free port for a test.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVE = fileURLToPath(new URL("../examples/playground/serve.js", import.meta.url));

/**
 * Starts the server and resolves with its base URL once it prints it. The caller stops `child`.
 * Fails, and stops the server, when it ends or prints no address within `ms`.
 * @param {{ script?: string, ms?: number }} [options]  another copy of serve.js; the time limit
 * @returns {Promise<{ base: string, child: import("node:child_process").ChildProcess }>}
 */
export async function startPlayground({ script = SERVE, ms = 10_000 } = {}) {
    const child = spawn(process.execPath, [script, "0"], { stdio: ["ignore", "pipe", "inherit"] });
    // wall time: a server that hangs before it prints its address fails the test instead of the run
    const timer = setTimeout(() => child.kill(), ms);
    let out = "";
    try {
        child.stdout.setEncoding("utf8");
        for await (const chunk of child.stdout) {
            out += chunk;
            const base = /http:\/\/127\.0\.0\.1:\d+\//.exec(out)?.[0];
            if (base) return { base, child };
        }
    } finally {
        clearTimeout(timer);
    }
    child.kill();
    throw new Error(`the server did not start: ${out}`);
}

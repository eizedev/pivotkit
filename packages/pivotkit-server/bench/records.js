/*
 * Memory and CPU of one rows request (POST /api/v1/sources/records) in pivotkit-server, beside a
 * render of the same source as the baseline. Not a test: it prints a Markdown table for the docs'
 * sizing section (docs/reference/rest.md#records-sizing).
 *
 *   npm run bench:records -w pivotkit-server              10,000, 50,000 (the row limit) and 100,000 rows
 *   node --expose-gc bench/records.js 20000               one size
 *
 * Per size: a CSV source of eight columns (texts with few and many values, a unique id, numbers, a
 * date, a date with a time, a yes/no), a person's token of an external issuer and a profile that
 * reads its rows. The REST handler runs in this process, without sockets; each answer is read to its
 * end. Each size and kind runs in a process of its own, on a fresh server: cold (the worker reads the
 * file), then warm (the worker kept the data; the median of five by CPU time). It measures:
 *
 * - CPU: process.cpuUsage() over the request, every thread of the process;
 * - RSS: the largest resident memory while the request ran, sampled every 2 ms, over the value
 *   before it (after a GC). It counts the main thread and the workers;
 * - heap: the main thread's largest heapUsed while the request ran, over the value before it. A
 *   worker's heap is not in it;
 * - the answer's size.
 *
 * 100,000 rows is above the default row limit: that run raises rest.records.maxRows and maxCells.
 * Numbers vary per machine and per run; the docs give them as a guide, with the machine.
 */

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { createContext } from "pivotkit-server";
import { createRestHandler } from "pivotkit-server/rest";
import { tempDir } from "../../../tests/temp-dir.js";
import { isMain } from "../../../scripts/is-main.js";

/** The sizes measured by default: 10,000 rows, the default row limit and 100,000 rows. */
const SIZES = [10_000, 50_000, 100_000];

/** A deterministic generator (mulberry32), so every run sees the same data. */
function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The CSV of `n` made-up orders. */
function csvOf(n) {
    const rnd = random(42);
    const lines = ["Region,Product,OrderId,Sales,Quantity,OrderDate,Shipped,Paid"];
    for (let i = 0; i < n; i++) {
        const day = new Date(Date.UTC(2024, 0, 1) + Math.floor(rnd() * 1000) * 86_400_000);
        const shipped = new Date(day.getTime() + Math.floor(rnd() * 86_400) * 1000);
        lines.push(`Region ${Math.floor(rnd() * 8)},Product ${Math.floor(rnd() * 500)},O-${String(i).padStart(8, "0")},${(rnd() * 1000).toFixed(2)},${Math.floor(rnd() * 20)},${day.toISOString().slice(0, 10)},${shipped.toISOString().slice(0, 19)},${rnd() < 0.5}`);
    }
    return `${lines.join("\n")}\n`;
}

/** A server over `n` rows: the handler, a person's token, and close(). */
async function serverOf(dir, n) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    writeFileSync(join(dir, "issuer.pub"), publicKey.export({ type: "spki", format: "pem" }).toString());
    const options = {
        sources: { orders: { file: join(dir, "orders.csv"), policy: { default: "show" } } },
        policy: { profiles: { staff: { records: ["orders"], results: true } } },
        auth: { mode: "token", tokens: [{ name: "ops", env: "BENCH_TOKEN" }], externalIssuers: [{ issuer: "host", typ: "host+jwt", scopes: ["pivotkit"], profiles: ["staff"], profile: "staff", keys: [{ kid: "k1", publicKey: { file: join(dir, "issuer.pub") } }] }] },
        rest: { records: { maxRows: Math.max(n, 50_000), maxCells: Math.max(n * 8, 1_000_000) } },
        log: "off"
    };
    const context = await createContext(options);
    // a static token the bench never uses: token mode needs one
    const rest = await createRestHandler(context, { env: { BENCH_TOKEN: randomBytes(24).toString("base64url") }, loopback: true });
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ jti: "bench", sub: "bench@example.com", profile: "staff" }).setProtectedHeader({ alg: "EdDSA", kid: "k1", typ: "host+jwt" }).setIssuer("host").setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
    return { rest, token, close: () => context.close() };
}

/** One request, read to its end, measured. */
async function measure(server, path, body) {
    globalThis.gc?.();
    const before = process.memoryUsage();
    let rss = before.rss;
    let heap = before.heapUsed;
    const sampler = setInterval(() => {
        const now = process.memoryUsage();
        rss = Math.max(rss, now.rss);
        heap = Math.max(heap, now.heapUsed);
    }, 2);
    const cpu = process.cpuUsage();
    const started = performance.now();
    const response = await server.rest.fetch(new Request(`http://127.0.0.1/api/v1${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` }, body: JSON.stringify(body) }), { address: "127.0.0.1" });
    let bytes = 0;
    const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        bytes += value.length;
        const now = process.memoryUsage();
        rss = Math.max(rss, now.rss);
        heap = Math.max(heap, now.heapUsed);
    }
    const ms = performance.now() - started;
    const used = process.cpuUsage(cpu);
    clearInterval(sampler);
    if (response.status !== 200) {
        throw new Error(`${path}: ${response.status}`);
    }
    return { ms, cpuMs: (used.user + used.system) / 1000, rssMb: (rss - before.rss) / 1_048_576, heapMb: (heap - before.heapUsed) / 1_048_576, bytes };
}

/** What each kind of request sends. */
const REQUESTS = Object.freeze({
    records: { path: "/sources/records", body: { source: "orders" } },
    render: { path: "/views/render/file", body: { source: "orders", view: { rows: ["Region"], cols: ["Paid"], values: [{ field: "Sales", agg: "sum" }] }, format: "csv" } }
});

/** How often the warm request runs: its median is reported. */
const WARM_RUNS = 5;

/**
 * One kind of request over `n` rows in this process: cold on a fresh server, then warm (the median
 * of WARM_RUNS by CPU time).
 * @param {number} n
 * @param {keyof typeof REQUESTS} kind
 */
async function child(n, kind) {
    const dir = tempDir("pivotkit-bench-records-");
    writeFileSync(join(dir, "orders.csv"), csvOf(n));
    const { path, body } = REQUESTS[kind];
    const server = await serverOf(dir, n);
    try {
        const cold = await measure(server, path, body);
        const warm = [];
        for (let i = 0; i < WARM_RUNS; i++) {
            warm.push(await measure(server, path, body));
        }
        warm.sort((a, b) => a.cpuMs - b.cpuMs);
        return { cold, warm: warm[Math.floor(WARM_RUNS / 2)] };
    } finally {
        await server.close();
    }
}

/** A child process per size and kind, so each starts from the same memory. */
function measured(n, kind) {
    const run = spawnSync(process.execPath, ["--expose-gc", fileURLToPath(import.meta.url), "--child", String(n), kind], { encoding: "utf8" });
    if (run.status !== 0) {
        throw new Error(run.stderr);
    }
    return JSON.parse(run.stdout);
}

const mb = (v) => `${Math.max(0, v).toFixed(0)} MiB`;
const ms = (v) => `${v.toFixed(0)} ms`;

if (isMain(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args[0] === "--child") {
        process.stdout.write(JSON.stringify(await child(Number(args[1]), /** @type {keyof typeof REQUESTS} */ (args[2]))));
    } else {
        const sizes = args.map(Number).filter((n) => n > 0);
        const rows = [];
        for (const n of sizes.length ? sizes : SIZES) {
            const records = measured(n, "records");
            const render = measured(n, "render");
            rows.push(`| ${n.toLocaleString("en-US")} | ${(records.warm.bytes / 1_048_576).toFixed(1)} MiB | ${ms(records.cold.cpuMs)} / ${ms(records.warm.cpuMs)} | ${ms(render.cold.cpuMs)} / ${ms(render.warm.cpuMs)} | ${mb(records.cold.rssMb)} / ${mb(records.warm.rssMb)} | ${mb(render.cold.rssMb)} / ${mb(render.warm.rssMb)} | ${mb(records.warm.heapMb)} |`);
        }
        console.log(`Node ${process.version}, ${cpus()[0]?.model ?? "unknown CPU"}, ${cpus().length} cores, ${Math.round(totalmem() / 1_073_741_824)} GiB\n`);
        console.log("| Rows | Answer | CPU rows, cold / warm | CPU render, cold / warm | RSS rows, cold / warm | RSS render, cold / warm | Main heap rows, warm |");
        console.log("| --- | --- | --- | --- | --- | --- | --- |");
        console.log(rows.join("\n"));
    }
}

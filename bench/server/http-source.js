// Memory benchmark of an HTTP source's load in pivotkit-server: how much the server process holds
// while it reads a backend's answer. A fake backend runs in a process of its own and streams a
// generated answer over https on loopback (a certificate made per run with openssl, names resolved
// by a lookup of the benchmark's own, as test/http-sources.test.js does), so its memory is not
// counted. Each case runs in a new server process: one describe_source call over the source, which
// loads every page, reads the rows, keeps them and computes in a worker.
//
// It prints, per format and size, the median of the runs:
//
// - peak RSS: process.resourceUsage().maxRSS of the server process, the main thread and the workers
//   together, minus the RSS before the load (after the workers started and a garbage collection);
// - peak heap: the largest JavaScript heap of the main thread seen by a garbage collection
//   (--trace-gc), or after the load. It leaves out Buffers (the answer's bytes), which lie outside
//   the heap, and the workers' heaps;
// - the time of the call.
//
//   node bench/server/http-source.js                                     json and csv, 10k 100k 500k and 20 MiB
//   node bench/server/http-source.js --formats json --sizes 100000 --runs 1
//
// The answer has seven columns, one of them hidden by the source's policy. Sizes above the default
// http.maxBytes (20 MiB) raise it and limits.fileBytes to 256 MiB; "20MiB" is the most rows that
// fit the default.
import { execFileSync, spawn } from "node:child_process";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { arch, cpus, platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { tempDir } from "../../tests/temp-dir.js";

const self = fileURLToPath(import.meta.url);
const DEFAULT_MAX_BYTES = 20_971_520;
const RAISED_BYTES = 268_435_456;
const REGIONS = ["North", "South", "East", "West", "Central", "Coast", "Mountain", "Valley"];
const STATES = ["open", "paid", "late"];

/** Row i of the answer: an object for JSON, the same values for CSV. */
const rowOf = (i) => ({
    id: i,
    region: REGIONS[i % REGIONS.length],
    customer: `customer-${(i * 7919) % 50_000}`,
    amount: ((i * 37) % 100_000) / 100,
    day: new Date(Date.UTC(2025, 0, 1 + (i % 365))).toISOString().slice(0, 10),
    state: STATES[i % STATES.length],
    memo: `internal memo ${i}`
});

/** The answer's text: JSON as { generatedAt, items: [objects] }, CSV with a header line. */
function answerOf(format, rows) {
    const parts = [];
    if (format === "json") {
        parts.push('{"generatedAt":"2026-01-01T00:00:00Z","items":[');
        for (let i = 0; i < rows; i++) {
            parts.push(`${i ? "," : ""}${JSON.stringify(rowOf(i))}`);
        }
        parts.push("]}");
    } else {
        parts.push(Object.keys(rowOf(0)).join(","));
        for (let i = 0; i < rows; i++) {
            parts.push(`\n${Object.values(rowOf(i)).join(",")}`);
        }
        parts.push("\n");
    }
    return parts.join("");
}

/** The most rows whose answer fits `bytes`. */
function rowsWithin(format, bytes) {
    const per = Buffer.byteLength(answerOf(format, 10_000)) / 10_000;
    let rows = Math.floor(bytes / per);
    while (Buffer.byteLength(answerOf(format, rows)) > bytes) {
        rows -= 1000;
    }
    return rows;
}

/** The fake backend: serves the answer file, streamed, until it is ended. */
async function backend([key, cert, file, type]) {
    const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
        res.writeHead(200, { "content-type": type, "content-length": statSync(file).size });
        createReadStream(file).pipe(res);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.stdout.write(`${JSON.stringify({ port: /** @type {any} */ (server.address()).port })}\n`);
}

/** One load in this process: prints one JSON line with the measurements. */
async function load([cert, port, format, maxBytes]) {
    const { callerOf, createContext, present } = await import("pivotkit-server");
    const { createGuardedFetch } = await import("../../packages/pivotkit-server/src/sources/fetch.js");
    const { httpMeans } = await import("../../packages/pivotkit-server/src/sources/http.js");
    httpMeans.fetch = createGuardedFetch({
        ca: readFileSync(cert),
        lookup: (_host, options, callback) => callback(null, options?.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4)
    });
    const bytes = Number(maxBytes);
    const shown = Object.fromEntries(Object.keys(rowOf(0)).filter((k) => k !== "memo").map((k) => [k, "show"]));
    const context = await createContext({
        log: "error",
        ...(bytes > DEFAULT_MAX_BYTES ? { limits: { fileBytes: bytes } } : {}),
        compute: { timeMs: 300_000 },
        httpSources: { backends: { api: { url: `https://api.example.test:${port}/v1`, intranet: true } } },
        sources: {
            // a code source to start the workers before the measure
            warm: { load: async () => [{ n: 1 }], policy: { default: "show" } },
            data: {
                timeMs: 300_000,
                http: { backend: "api", path: `/data.${format}`, ...(format === "json" ? { rows: "/items", asOf: "/generatedAt" } : { format: "csv" }), maxBytes: bytes },
                policy: { default: "hide", fields: shown }
            }
        }
    }, { stderr: { write: () => {} } });
    const local = callerOf("none", undefined);
    await Promise.all([1, 2].map(() => present(context, "render_view", { source: "warm", view: { rows: ["n"] }, format: "csv" }, local)));
    global.gc?.();
    await new Promise((resolve) => setImmediate(resolve));
    const before = process.memoryUsage();
    const started = performance.now();
    const described = await present(context, "describe_source", { source: "data" }, local);
    const ms = performance.now() - started;
    const after = process.memoryUsage();
    const peakRss = process.resourceUsage().maxRSS * 1024;
    process.stdout.write(`RESULT ${JSON.stringify({ rows: described.result.rows, ms, rssBefore: before.rss, peakRss, heapAfter: after.heapUsed })}\n`);
    await context.close();
}

/** Runs one case in a new server process; the main thread's peak heap from its --trace-gc lines. */
async function measure(cert, port, format, maxBytes) {
    const child = spawn(process.execPath, ["--expose-gc", "--trace-gc", self, "load", cert, String(port), format, String(maxBytes)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const code = await new Promise((resolve) => child.on("exit", resolve));
    const lines = out.split("\n");
    const result = lines.find((l) => l.startsWith("RESULT "));
    if (code !== 0 || !result) {
        throw new Error(`the load failed (exit ${code}): ${out.slice(-2000)}`);
    }
    const value = JSON.parse(result.slice(7));
    // the first line is the main thread's (its global.gc() before the load); workers have other isolates
    const gcLines = lines.filter((l) => /^\[\d+:0x[0-9a-f]+\]/.test(l));
    const main = gcLines[0]?.match(/^\[\d+:(0x[0-9a-f]+)\]/)?.[1];
    let heap = value.heapAfter;
    for (const line of gcLines) {
        // "Scavenge 5.0 (5.9) -> ...", "Scavenge (during sweeping) 69.6 (103.1) -> ...", "Incremental Mark-Compact ..."
        const m = line.match(/^\[\d+:(0x[0-9a-f]+)\]\s+[\d.]+ ms: [A-Za-z -]+?(?: \([^)]*\))? ([\d.]+) \(/);
        if (m && m[1] === main) {
            heap = Math.max(heap, Number(m[2]) * 1_048_576);
        }
    }
    return { rows: value.rows, ms: value.ms, rss: value.peakRss - value.rssBefore, heap };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const mb = (bytes) => (bytes / 1_048_576).toFixed(0);

async function main() {
    const { values: args } = parseArgs({ args: process.argv.slice(2), options: { formats: { type: "string", default: "json,csv" }, sizes: { type: "string", default: "10000,100000,500000,20MiB" }, runs: { type: "string", default: "3" }, json: { type: "string" } } });
    // removed when this process ends
    const dir = tempDir("bench");
    const results = [];
    const key = join(dir, "key.pem");
    const cert = join(dir, "cert.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=api.example.test", "-addext", "subjectAltName=DNS:api.example.test"], { stdio: "ignore" });
    console.log(`Node ${process.versions.node}, ${platform()} ${arch()}, ${cpus()[0]?.model ?? "unknown CPU"}; median of ${args.runs} runs`);
    console.log("| format | rows | answer MB | peak RSS MB | peak heap MB (main) | ms |");
    console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const format of args.formats.split(",")) {
        for (const size of args.sizes.split(",")) {
            const rows = size === "20MiB" ? rowsWithin(format, DEFAULT_MAX_BYTES) : Number(size);
            const file = join(dir, `data.${format}`);
            writeFileSync(file, answerOf(format, rows));
            const answer = statSync(file).size;
            const server = spawn(process.execPath, [self, "backend", key, cert, file, format === "json" ? "application/json" : "text/csv"], { stdio: ["ignore", "pipe", "inherit"] });
            try {
                const port = await new Promise((resolve, reject) => {
                    server.stdout.once("data", (d) => resolve(JSON.parse(String(d)).port));
                    server.once("exit", (c) => reject(new Error(`the backend ended (${c})`)));
                });
                const runs = [];
                for (let i = 0; i < Number(args.runs); i++) {
                    runs.push(await measure(cert, port, format, answer > DEFAULT_MAX_BYTES ? RAISED_BYTES : DEFAULT_MAX_BYTES));
                }
                const row = { format, rows, answer, rss: median(runs.map((r) => r.rss)), heap: median(runs.map((r) => r.heap)), ms: median(runs.map((r) => r.ms)) };
                results.push(row);
                console.log(`| ${format} | ${rows.toLocaleString("en-US")} | ${mb(answer)} | ${mb(row.rss)} | ${mb(row.heap)} | ${row.ms.toFixed(0)} |`);
            } finally {
                server.kill();
            }
        }
    }
    if (args.json) {
        writeFileSync(args.json, `${JSON.stringify(results, null, 2)}\n`);
    }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "backend") {
    await backend(rest);
} else if (mode === "load") {
    await load(rest);
} else {
    await main();
}

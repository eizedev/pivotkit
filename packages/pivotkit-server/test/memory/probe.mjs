// What pivotkit keeps of an HTTP source's answer with hidden columns, measured in the heap (run by
// test/memory.test.js with --expose-gc; prints one JSON line). The backend answers a CSV and a JSON
// source with the same rows: two hidden columns full of unique markers and one shown column of
// unique markers (the control: what is kept is found). After a signed-in caller's calls and a GC, it
// counts the markers in:
// - the kept loads themselves (the cache's values: its texts and the bytes of its typed arrays and
//   SharedArrayBuffers, which a heap snapshot does not show);
// - a heap snapshot of the main thread and of each compute worker: every string still reachable
//   (a snapshot holds only reachable objects), and the largest ArrayBuffer still reachable, which
//   would show the answer's bytes kept anywhere (a snapshot has a buffer's size, not its bytes);
// - then the same scan over a snapshot with markers kept on purpose: the scan must find them, or its
//   zero means nothing.
// A snapshot names a long flat string by its first characters only (about 1,000 in V8), so a text
// kept whole (the decoded answer, a slice's parent) shows only its start. Every row of the answer has
// hidden markers, about every 220 characters, so any kept stretch of the answer shows some.
// The markers are made at run time from a hash, so they are in no source text, and the lists to look
// them up are made after the snapshots, so they are in none of them.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import v8 from "node:v8";
import { callerOf, createContext, present } from "pivotkit-server";
import { createGuardedFetch } from "../../src/sources/fetch.js";
import { httpMeans, loadFor } from "../../src/sources/http.js";
import { tempDir } from "../helpers.js";

const ROWS = 3000;
const seed = createHash("sha256").update(String(Math.random())).digest("hex");
/** A marker's 24 hex characters: a hash of the run's seed, its class (h, s hidden; v shown) and its row. */
const markerOf = (kind, i) => createHash("sha256").update(`${seed}:${kind}:${i}`).digest("hex").slice(0, 24);
/** A marker as the CSV has it. */
const marker = (kind, i) => `K${kind}${markerOf(kind, i)}K`;

/**
 * Every run of 24 hex characters in a text (each window of a longer run): a marker is found by its
 * hash alone, also where the text around it is not known (a sliced string's parent).
 * @param {string} text
 * @param {Set<string>} into
 */
function hexWindows(text, into) {
    for (const m of text.matchAll(/[0-9a-f]{24,}/g)) {
        for (let at = 0; at + 24 <= m[0].length; at++) {
            into.add(m[0].slice(at, at + 24));
        }
    }
    return into;
}

/** How many distinct markers of the hidden and of the shown columns a set of windows holds (made after the snapshots, so the list is in none of them). */
function counted(windows, controls = []) {
    const of = (kind) => Array.from({ length: ROWS }, (_, i) => markerOf(kind, i)).filter((m) => windows.has(m)).length;
    return { hidden: of("h") + of("s") + of("jh") + of("js"), shown: of("v") + of("jv"), controls: controls.filter((c) => windows.has(markerOf(...c))).length };
}

/** The CSV answer, made in a function so nothing of it stays reachable from here. */
function csvAnswer() {
    const lines = ["order,region,amount,name,memo,secretnote"];
    for (let i = 0; i < ROWS; i++) {
        lines.push(`o${i},${["north", "south", "east", "west"][i % 4]},${(i % 97) + 1},${marker("v", i)},${marker("h", i)} ${"q".repeat(120)},${marker("s", i)}`);
    }
    return Buffer.from(`${lines.join("\n")}\n`);
}

/** The same rows as a JSON answer, with markers of their own (jv shown, jh and js hidden). */
function jsonAnswer() {
    const items = Array.from({ length: ROWS }, (_, i) => ({ order: `o${i}`, region: ["north", "south", "east", "west"][i % 4], amount: (i % 97) + 1, name: marker("jv", i), memo: `${marker("jh", i)} ${"q".repeat(120)}`, secretnote: marker("js", i) }));
    return Buffer.from(JSON.stringify({ items }));
}

/** Every text in a value pivotkit keeps, and the bytes of its typed arrays and buffers as UTF-8. */
function textsOf(value, seen = new Set(), out = []) {
    if (typeof value === "string") {
        out.push(value);
        return out;
    }
    if (value === null || typeof value !== "object" || seen.has(value)) {
        return out;
    }
    seen.add(value);
    if (ArrayBuffer.isView(value)) {
        out.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8"));
        return out;
    }
    if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
        out.push(Buffer.from(value).toString("utf8"));
        return out;
    }
    const entries = value instanceof Map ? [...value.entries()].flat() : value instanceof Set ? [...value] : Object.values(value);
    for (const v of entries) {
        textsOf(v, seen, out);
    }
    return out;
}

/**
 * A heap snapshot's reachable strings (their hex windows) and the largest reachable ArrayBuffer's
 * bytes. A flat string's node names its text; a concatenated one names none, so its text is put
 * together from its parts (edges "first" and "second"); a sliced one names neither its text nor its
 * offset, so its parent's whole text stands for it (the parent is reachable through it).
 */
async function snapshotOf(stream) {
    const parts = [];
    for await (const chunk of stream) {
        parts.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    }
    const snap = JSON.parse(parts.join(""));
    const { node_fields: fields, node_types: [types], edge_fields: edgeFields, edge_types: [edgeTypes] } = snap.snapshot.meta;
    const [typeAt, nameAt, sizeAt, edgesAt] = ["type", "name", "self_size", "edge_count"].map((f) => fields.indexOf(f));
    const [edgeTypeAt, edgeNameAt, edgeToAt] = ["type", "name_or_index", "to_node"].map((f) => edgeFields.indexOf(f));
    const typeOf = (node) => types[snap.nodes[node + typeAt]];
    // where each node's edges start
    const firstEdge = new Map();
    for (let node = 0, edge = 0; node < snap.nodes.length; node += fields.length) {
        firstEdge.set(node, edge);
        edge += snap.nodes[node + edgesAt] * edgeFields.length;
    }
    /** A concatenated string's parts, first then second. */
    const partsOf = (node) => {
        const found = {};
        const start = firstEdge.get(node);
        for (let e = start; e < start + snap.nodes[node + edgesAt] * edgeFields.length; e += edgeFields.length) {
            const name = edgeTypes[snap.edges[e + edgeTypeAt]] === "internal" ? snap.strings[snap.edges[e + edgeNameAt]] : null;
            if (name === "first" || name === "second") {
                found[name] = snap.edges[e + edgeToAt];
            }
        }
        return [found.first, found.second].filter((n) => n !== undefined);
    };
    /** A sliced string's parent. */
    const parentOf = (node) => {
        const start = firstEdge.get(node);
        for (let e = start; e < start + snap.nodes[node + edgesAt] * edgeFields.length; e += edgeFields.length) {
            if (snap.strings[snap.edges[e + edgeNameAt]] === "parent") {
                return snap.edges[e + edgeToAt];
            }
        }
        return -1;
    };
    /** A string node's text: a concatenated one put together from its parts. */
    const textOf = (root) => {
        let text = "";
        const stack = [root];
        while (stack.length) {
            const node = /** @type {number} */ (stack.pop());
            if (typeOf(node) === "concatenated string") {
                stack.push(...partsOf(node).reverse());
            } else if (typeOf(node) === "string") {
                text += snap.strings[snap.nodes[node + nameAt]];
            } else if (typeOf(node) === "sliced string") {
                // its parent's text, set apart so no marker is made across the join
                text += ` ${textOf(parentOf(node))} `;
            }
        }
        return text;
    };
    // a concatenated string that is part of another is read with it
    const inner = new Set();
    for (let node = 0; node < snap.nodes.length; node += fields.length) {
        if (typeOf(node) === "concatenated string") {
            partsOf(node).forEach((n) => inner.add(n));
        }
    }
    const windows = new Set();
    let largestBuffer = 0;
    for (let node = 0; node < snap.nodes.length; node += fields.length) {
        const type = typeOf(node);
        if (type === "string" || (type === "concatenated string" && !inner.has(node))) {
            hexWindows(textOf(node), windows);
        } else if (snap.strings[snap.nodes[node + nameAt]] === "system / JSArrayBufferData") {
            largestBuffer = Math.max(largestBuffer, snap.nodes[node + sizeAt]);
        }
    }
    return { windows, largestBuffer };
}

const collect = () => {
    for (let i = 0; i < 3; i++) {
        global.gc?.();
    }
};

// a backend over https on loopback, with a certificate made for this run
const dir = tempDir("pivotkit-memory-");
execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=backend.example.test", "-addext", "subjectAltName=DNS:backend.example.test"], { stdio: "ignore" });
const cert = readFileSync(join(dir, "cert.pem"));
/** The backend's requests and the size of its smallest answer. */
const hits = { csv: 0, json: 0 };
let bodyBytes = Infinity;
const backend = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
    const format = req.url?.endsWith(".csv") ? "csv" : "json";
    hits[format]++;
    const body = format === "csv" ? csvAnswer() : jsonAnswer();
    bodyBytes = Math.min(bodyBytes, body.length);
    res.writeHead(200, { "content-type": format === "csv" ? "text/csv" : "application/json" });
    res.end(body);
});
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
httpMeans.fetch = createGuardedFetch({ ca: cert, lookup: (_host, options, callback) => callback(null, options?.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4) });

/** The policy of both sources: memo and secretnote hidden (by the default). */
const SHOWN = { default: "hide", fields: { order: "show", region: "show", amount: "show", name: "show" } };
const context = await createContext(
    {
        log: "off",
        compute: { workers: 1 },
        output: { dir: join(dir, "out") },
        httpSources: { backends: { shop: { url: `https://backend.example.test:${backend.address().port}/v1`, intranet: true } } },
        sources: {
            orders: { http: { backend: "shop", path: "/orders.csv", format: "csv" }, policy: SHOWN },
            ordersJson: { http: { backend: "shop", path: "/orders.json", rows: "/items" }, policy: SHOWN }
        }
    },
    { stderr: { write: () => true } }
);
// a signed-in person: their load is kept (a caller without an identity keeps nothing)
const carol = callerOf("oauth", { token: "jwt", clientId: "app", scopes: [], expiresAt: 0, extra: { subject: "carol", issuer: "https://issuer.example.test" } });
for (const source of ["orders", "ordersJson"]) {
    await present(context, "describe_source", { source }, carol);
    await present(context, "render_view", { source, view: { rows: ["region"], values: [{ field: "amount", agg: "sum" }] }, format: "csv" }, carol);
    await present(context, "render_view", { source, view: { rows: ["name"], values: [{ field: "amount", agg: "sum" }] }, format: "json" }, carol);
}

// the load as the cache keeps it (fresh, so no new request)
async function keptLoad(source) {
    const kept = await loadFor(context.computer, await context.registry.resolve(source, carol), carol, context.log);
    return { ...counted(hexWindows(textsOf(kept.value).join("\n"), new Set())), columns: (kept.value.table?.columns ?? []).map((c) => (typeof c === "string" ? c : c.name)) };
}
const cached = { csv: await keptLoad("orders"), json: await keptLoad("ordersJson") };

// the controls the scan must find: a marker; one deep in a long text, put together; one put together
// from parts; one near the start of a long flat text (as a kept answer would be); a buffer the size
// of the answer
const controls = [["c", 1], ["c", 2], ["c", 3], ["c", 4]];
const withControls = () => {
    /** @type {any} */ (globalThis).memoryProbeControl = [marker("c", 1), `${"x".repeat(5000)}${marker("c", 2)}`, ["K", markerOf("c", 3), "K"].join(""), Buffer.from(`${"y".repeat(500)}${marker("c", 4)}${"y".repeat(bodyBytes)}`).toString("latin1"), Buffer.alloc(bodyBytes, 120)];
};
/** A snapshot's counts; its windows are dropped here, so the next snapshot does not see them. */
const report = async (stream) => {
    const { windows, largestBuffer } = await snapshotOf(stream);
    return { ...counted(windows, controls), largestBuffer };
};

collect();
const main = await report(v8.getHeapSnapshot());
const workers = [];
for (const stream of await context.computer.heapSnapshots()) {
    workers.push(await report(stream));
}
withControls();
collect();
const control = await report(v8.getHeapSnapshot());

console.log(JSON.stringify({ rows: ROWS, hits, bodyBytes, cached, main, workers, control }));
await context.close();
backend.close();

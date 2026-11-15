// What pivotkit keeps of a source's data with hidden columns, measured in the heap (run by
// test/memory.test.js with --expose-gc; prints one JSON line).
//
// Six sources give the same kind of rows: an HTTP source answering CSV, one answering JSON and a
// code source, each once for a signed-in person (whose load is kept) and once for a caller without
// an identity (nothing is kept; a CSV answer goes straight to the worker). Every row has hidden
// columns: two texts full of unique markers, a fraction (float64) and a whole number above the
// small-integer range (int32), all unique; and shown columns: a text marker and a whole number (the
// controls: what is kept is found). Hidden by the default level (HTTP sources) and by a field's own
// `hide` (memo on HTTP sources; every hidden field of the code sources).
//
// After the calls and a GC it looks in:
// - the kept loads (the cache's values): their texts, their numbers, and the bytes of their typed
//   arrays and SharedArrayBuffers, read as UTF-8 and as float64 and int32 (little-endian) at every
//   offset;
// - the data sets the worker keeps (compute.js keptDataSets), looked at the same way;
// - a heap snapshot of the main thread and of the worker: every string still reachable (a snapshot
//   holds only reachable objects), every boxed number with its value (exposeNumericValues), and the
//   largest ArrayBuffer still reachable, which would show an answer's bytes kept anywhere (a
//   snapshot has a buffer's size, not its bytes, and no number held in a double array or as a small
//   integer: those are looked at in the kept data above);
// - then the same scan over a snapshot with controls kept on purpose: it must find them, or its
//   zeros mean nothing.
// A snapshot names a long flat string by its first characters only (about 1,000 in V8), so a text
// kept whole (a decoded answer, a slice's parent) shows only its start. Every row has hidden
// markers, about every 250 characters, so any kept stretch of an answer shows some.
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
import { loadCode } from "../../src/sources/code.js";
import { tempDir } from "../helpers.js";

const ROWS = 2000;
/** The sources: kind, and whether a signed-in person calls it (else a caller without an identity). */
// called in this order: the callers without an identity first, so the worker's four data sets end
// with the three a person's calls keep
const SOURCES = [
    { id: "csvAnonymous", kind: "csv", person: false },
    { id: "jsonAnonymous", kind: "json", person: false },
    { id: "codeAnonymous", kind: "code", person: false },
    { id: "csvPerson", kind: "csv", person: true },
    { id: "jsonPerson", kind: "json", person: true },
    { id: "codePerson", kind: "code", person: true }
];
const seed = createHash("sha256").update(String(Math.random())).digest("hex");
/** A text marker's 24 hex characters: a hash of the run's seed, the source, its class (h, s hidden; v shown) and its row. */
const markerOf = (source, kind, i) => createHash("sha256").update(`${seed}:${source}:${kind}:${i}`).digest("hex").slice(0, 24);
const marker = (source, kind, i) => `K${kind}${markerOf(source, kind, i)}K`;
/** The numbers of a source's row: hidden float64 and int32 (above the small-integer range), shown int32. */
const STEP = 20_000;
const FLOATS = [700_000, 700_000 + SOURCES.length * STEP];
const INTS = [1_800_000_000, 1_900_000_000 + SOURCES.length * STEP];
const numbersOf = (n, i) => ({ hiddenFloat: FLOATS[0] + n * STEP + i + 0.375, hiddenInt: 1_900_000_000 + n * STEP + i, shownInt: 1_800_000_000 + n * STEP + i });

/** A source's rows, made anew on every request or load, so nothing of them stays reachable from here. */
function rowsOf(n) {
    const { id } = SOURCES[n];
    return Array.from({ length: ROWS }, (_, i) => {
        const { hiddenFloat, hiddenInt, shownInt } = numbersOf(n, i);
        return { order: `o${i}`, region: ["north", "south", "east", "west"][i % 4], amount: (i % 97) + 1, name: marker(id, "v", i), shownint: shownInt, memo: `${marker(id, "h", i)} ${"q".repeat(120)}`, secretnote: marker(id, "s", i), hfloat: hiddenFloat, hint: hiddenInt };
    });
}
const COLUMNS = ["order", "region", "amount", "name", "shownint", "memo", "secretnote", "hfloat", "hint"];
const SHOWN = ["order", "region", "amount", "name", "shownint"];
const answerOf = (n) => {
    const rows = rowsOf(n);
    return SOURCES[n].kind === "csv" ? Buffer.from(`${COLUMNS.join(",")}\n${rows.map((r) => COLUMNS.map((c) => r[c]).join(",")).join("\n")}\n`) : Buffer.from(JSON.stringify({ items: rows }));
};

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

/** The numbers of this probe's ranges in bytes, read as float64 and int32 (little-endian) at every offset. */
function numbersInBytes(bytes, into) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let at = 0; at + 4 <= bytes.byteLength; at++) {
        const int = view.getInt32(at, true);
        if (int >= INTS[0] && int < INTS[1]) {
            into.add(int);
        }
        if (at + 8 <= bytes.byteLength) {
            const float = view.getFloat64(at, true);
            if ((float >= FLOATS[0] && float < FLOATS[1]) || (float >= INTS[0] && float < INTS[1])) {
                into.add(float);
            }
        }
    }
    return into;
}

/** What a kept value holds: the hex windows of its texts and bytes, and its numbers (own and in its bytes). */
function lookInto(value) {
    const windows = new Set();
    const numbers = new Set();
    const seen = new Set();
    const stack = [value];
    while (stack.length) {
        const v = stack.pop();
        if (typeof v === "string") {
            hexWindows(v, windows);
        } else if (typeof v === "number") {
            numbers.add(v);
        } else if (v !== null && typeof v === "object" && !seen.has(v)) {
            seen.add(v);
            if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || v instanceof SharedArrayBuffer) {
                const bytes = ArrayBuffer.isView(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : Buffer.from(v);
                hexWindows(bytes.toString("latin1"), windows);
                numbersInBytes(bytes, numbers);
            } else {
                stack.push(...(v instanceof Map ? [...v.entries()].flat() : v instanceof Set ? [...v] : Object.values(v)));
            }
        }
    }
    return { windows, numbers };
}

/** Per source, how many of its hidden and shown values a look found (the lists made here, after the snapshots). */
function counted({ windows, numbers }) {
    return Object.fromEntries(
        SOURCES.map(({ id }, n) => {
            const rows = Array.from({ length: ROWS }, (_, i) => i);
            const texts = (kind) => rows.filter((i) => windows.has(markerOf(id, kind, i))).length;
            const nums = (key) => rows.filter((i) => numbers.has(numbersOf(n, i)[key])).length;
            return [id, { hiddenTexts: texts("h") + texts("s"), hiddenNumbers: nums("hiddenFloat") + nums("hiddenInt"), shownTexts: texts("v"), shownNumbers: nums("shownInt") }];
        })
    );
}

/**
 * A heap snapshot's reachable strings (their hex windows), boxed numbers and largest ArrayBuffer.
 * A flat string's node names its text; a concatenated one names none, so its text is put together
 * from its parts (edges "first" and "second"); a sliced one names neither its text nor its offset,
 * so its parent's whole text stands for it. A boxed number's value is the text its "value" edge
 * points to (exposeNumericValues).
 */
async function snapshotOf(stream) {
    const parts = [];
    for await (const chunk of stream) {
        parts.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    }
    const snap = JSON.parse(parts.join(""));
    const { node_fields: fields, node_types: [types], edge_fields: edgeFields } = snap.snapshot.meta;
    const [typeAt, nameAt, sizeAt, edgesAt] = ["type", "name", "self_size", "edge_count"].map((f) => fields.indexOf(f));
    const [edgeNameAt, edgeToAt] = ["name_or_index", "to_node"].map((f) => edgeFields.indexOf(f));
    const typeOf = (node) => types[snap.nodes[node + typeAt]];
    const nameOf = (node) => snap.strings[snap.nodes[node + nameAt]];
    const firstEdge = new Map();
    for (let node = 0, edge = 0; node < snap.nodes.length; node += fields.length) {
        firstEdge.set(node, edge);
        edge += snap.nodes[node + edgesAt] * edgeFields.length;
    }
    /** A node's targets of named edges (names of internal and property edges are texts). */
    const edgesOf = (node, wanted) => {
        const found = {};
        const start = firstEdge.get(node);
        for (let e = start; e < start + snap.nodes[node + edgesAt] * edgeFields.length; e += edgeFields.length) {
            const name = snap.strings[snap.edges[e + edgeNameAt]];
            if (wanted.includes(name)) {
                found[name] = snap.edges[e + edgeToAt];
            }
        }
        return wanted.map((w) => found[w]).filter((n) => n !== undefined);
    };
    /** A string node's text: a concatenated one put together from its parts. */
    const textOf = (root) => {
        let text = "";
        const stack = [root];
        while (stack.length) {
            const node = /** @type {number} */ (stack.pop());
            const type = typeOf(node);
            if (type === "concatenated string") {
                stack.push(...edgesOf(node, ["first", "second"]).reverse());
            } else if (type === "sliced string") {
                // its parent's text, set apart so no marker is made across the join
                text += ` ${edgesOf(node, ["parent"]).map(textOf).join("")} `;
            } else if (type === "string") {
                text += nameOf(node);
            }
        }
        return text;
    };
    const inner = new Set();
    for (let node = 0; node < snap.nodes.length; node += fields.length) {
        if (typeOf(node) === "concatenated string") {
            edgesOf(node, ["first", "second"]).forEach((n) => inner.add(n));
        }
    }
    const windows = new Set();
    const numbers = new Set();
    let largestBuffer = 0;
    for (let node = 0; node < snap.nodes.length; node += fields.length) {
        const type = typeOf(node);
        if (type === "string" || (type === "concatenated string" && !inner.has(node))) {
            hexWindows(textOf(node), windows);
        } else if (type === "number") {
            for (const value of edgesOf(node, ["value"])) {
                numbers.add(Number(nameOf(value)));
            }
        } else if (nameOf(node) === "system / JSArrayBufferData") {
            largestBuffer = Math.max(largestBuffer, snap.nodes[node + sizeAt]);
        }
    }
    return { windows, numbers, largestBuffer };
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
/** The requests and loads per source, and the size of the smallest answer. */
const hits = Object.fromEntries(SOURCES.map((s) => [s.id, 0]));
let answerBytes = Infinity;
const backend = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
    const n = SOURCES.findIndex((s) => req.url === `/v1/${s.id}`);
    hits[SOURCES[n].id]++;
    const body = answerOf(n);
    answerBytes = Math.min(answerBytes, body.length);
    res.writeHead(200, { "content-type": SOURCES[n].kind === "csv" ? "text/csv" : "application/json" });
    res.end(body);
});
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
httpMeans.fetch = createGuardedFetch({ ca: cert, lookup: (_host, options, callback) => callback(null, options?.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4) });

// HTTP sources: hidden by the default, memo by its own rule too; code sources: by each field's rule
const httpPolicy = { default: "hide", fields: { ...Object.fromEntries(SHOWN.map((c) => [c, "show"])), memo: "hide" } };
const codePolicy = { default: "show", fields: { memo: "hide", secretnote: "hide", hfloat: "hide", hint: "hide" } };
const context = await createContext(
    {
        log: "off",
        compute: { workers: 1 },
        output: { dir: join(dir, "out") },
        httpSources: { backends: { shop: { url: `https://backend.example.test:${backend.address().port}/v1`, intranet: true } } },
        sources: Object.fromEntries(
            SOURCES.map((s, n) => [
                s.id,
                s.kind === "code"
                    ? {
                          load: async () => {
                              hits[s.id]++;
                              return rowsOf(n);
                          },
                          ttl: 60,
                          policy: codePolicy
                      }
                    : { http: { backend: "shop", path: `/${s.id}`, ...(s.kind === "csv" ? { format: "csv" } : { rows: "/items" }) }, policy: httpPolicy }
            ])
        )
    },
    { stderr: { write: () => true } }
);
const carol = callerOf("oauth", { token: "jwt", clientId: "app", scopes: [], expiresAt: 0, extra: { subject: "carol", issuer: "https://issuer.example.test" } });
// signed in, but with no subject: nothing is kept or shared for it
const anonymous = callerOf("oauth", { token: "jwt", clientId: "app", scopes: [], expiresAt: 0, extra: { subject: null, issuer: "https://issuer.example.test" } });
const callerFor = (s) => (s.person ? carol : anonymous);
for (const s of SOURCES) {
    await present(context, "describe_source", { source: s.id }, callerFor(s));
    await present(context, "render_view", { source: s.id, view: { rows: ["region"], values: [{ field: "amount", agg: "sum" }] }, format: "csv" }, callerFor(s));
    await present(context, "render_view", { source: s.id, view: { rows: ["name"], values: [{ field: "shownint", agg: "sum" }] }, format: "json" }, callerFor(s));
}

/** A person's kept load, as the cache gives it (fresh, so no new request or load). */
async function keptLoad(s) {
    const resolved = await context.registry.resolve(s.id, carol);
    const kept = s.kind === "code" ? await loadCode(resolved, carol, context.log) : await loadFor(context.computer, resolved, carol, context.log);
    const table = kept.value.table;
    return { look: counted(lookInto(kept.value))[s.id], columns: (table?.columns ?? []).map((c) => (typeof c === "string" ? c : c.name)) };
}
const kept = {};
for (const s of SOURCES.filter((s) => s.person)) {
    kept[s.id] = await keptLoad(s);
}
const worker = counted(lookInto(await context.computer.keptDataSets()));

// the controls the snapshot scan must find, markers and a number of their own: a marker; one deep in
// a long text, put together; one put together from parts; one near the start of a long flat text (as
// a kept answer would be); a boxed number; and a buffer the size of the smallest answer
const CONTROL_NUMBER = FLOATS[0] - 1.375;
const withControls = () => {
    /** @type {any} */ (globalThis).memoryProbeControl = {
        texts: [marker("control", "c", 1), `${"x".repeat(5000)}${marker("control", "c", 2)}`, ["K", markerOf("control", "c", 3), "K"].join(""), Buffer.from(`${"y".repeat(500)}${marker("control", "c", 4)}${"y".repeat(answerBytes)}`).toString("latin1")],
        number: { value: CONTROL_NUMBER },
        buffer: Buffer.alloc(answerBytes, 120)
    };
};
/** A snapshot's counts (and the controls found); its sets are dropped here, so the next snapshot does not see them. */
const report = async (stream) => {
    const { windows, numbers, largestBuffer } = await snapshotOf(stream);
    return { sources: counted({ windows, numbers }), largestBuffer, controls: { texts: [1, 2, 3, 4].filter((i) => windows.has(markerOf("control", "c", i))).length, number: numbers.has(CONTROL_NUMBER) } };
};

collect();
const main = await report(v8.getHeapSnapshot({ exposeNumericValues: true }));
const workers = [];
for (const stream of await context.computer.heapSnapshots({ exposeNumericValues: true })) {
    workers.push(await report(stream));
}
withControls();
collect();
const control = await report(v8.getHeapSnapshot({ exposeNumericValues: true }));

console.log(JSON.stringify({ rows: ROWS, sources: SOURCES, hits, answerBytes, kept, worker, main, workers, control: { ...control.controls, largestBuffer: control.largestBuffer } }));
await context.close();
backend.close();

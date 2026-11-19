// What list_sources and GET /sources say about a source's data: its row count (rows) and when it is
// from (dataAsOf), known from the last read, only for a source whose rows are the same for every
// caller, and the row count only where the caller's policy shows it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { callerOf, createContext, present } from "pivotkit-server";
import { presentedOutput } from "pivotkit-server/internal";
import { BY_REGION, call, restServer, workspace } from "./helpers.js";

const LOCAL = callerOf("none", undefined);
const ROWS = [{ Region: "North", Sales: 10 }, { Region: "South", Sales: 20 }, { Region: "West", Sales: 7 }];
const WHEN = new Date(Date.UTC(2026, 9, 1, 6, 30, 15));

/** The list's entry of a source, by id. */
const entryOf = async (context, id, caller = LOCAL) => (await present(context, "list_sources", {}, caller)).result.sources.find((s) => s.id === id);

test("a file source: no rows or dataAsOf before its data is read; after a read, both, from that read", async () => {
    const dir = workspace();
    const file = join(dir, "data", "sales.csv");
    utimesSync(file, WHEN, WHEN);
    const context = await createContext({ log: "off", sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir });
    try {
        const before = await entryOf(context, "sales");
        assert.equal(before.rows, undefined, "nothing read yet: nothing known");
        assert.equal(before.dataAsOf, undefined);
        await present(context, "describe_source", { source: "sales" }, LOCAL);
        const after = await entryOf(context, "sales");
        assert.equal(after.rows, 5);
        assert.equal(after.dataAsOf, "2026-10-01T06:30:15Z");
        // a changed file: the list keeps the last read's pair until the data is read again
        writeFileSync(file, "Region,Sales\nNorth,1\n");
        const later = new Date(Date.UTC(2026, 9, 2));
        utimesSync(file, later, later);
        assert.deepEqual([(await entryOf(context, "sales")).rows, (await entryOf(context, "sales")).dataAsOf], [5, "2026-10-01T06:30:15Z"]);
        await present(context, "render_view", { source: "sales", view: { rows: ["Region"] }, format: "csv" }, LOCAL);
        assert.deepEqual([(await entryOf(context, "sales")).rows, (await entryOf(context, "sales")).dataAsOf], [1, "2026-10-02T00:00:00Z"]);
    } finally {
        await context.close();
    }
});

test("rows follow the caller's policy: a profile with rows: false gets dataAsOf without the row count", async () => {
    const dir = workspace();
    utimesSync(join(dir, "data", "sales.csv"), WHEN, WHEN);
    const context = await createContext({ log: "off", sources: { sales: { file: "data/sales.csv" } }, policy: { profiles: { quiet: { rows: false } } }, baseDir: dir });
    const quiet = { scopes: null, client: "quiet", profile: "quiet" };
    try {
        // the quiet caller's own read fills it; the other caller still gets the count
        await present(context, "describe_source", { source: "sales" }, quiet);
        const hidden = await entryOf(context, "sales", quiet);
        assert.equal(hidden.rows, undefined);
        assert.equal(hidden.dataAsOf, "2026-10-01T06:30:15Z");
        assert.equal((await entryOf(context, "sales")).rows, 5);
        // describe_source agrees: rows: false withholds the count there too
        assert.equal((await present(context, "describe_source", { source: "sales" }, quiet)).result.rows, null);
    } finally {
        await context.close();
    }
});

test("a code source shared by every caller says both after a load; one whose rows can differ per caller or per call says neither", async () => {
    const context = await createContext({
        log: "off",
        sources: {
            shared: { load: async () => ({ rows: ROWS, asOf: "2026-11-01T09:00:00+01:00" }), cacheShared: true },
            perCaller: { load: async () => ({ rows: ROWS, asOf: "2026-11-01T09:00:00Z" }) },
            perPerson: { load: async () => ({ rows: ROWS, asOf: "2026-11-01T09:00:00Z" }), perPerson: true },
            byRegion: { load: async () => ({ rows: ROWS, asOf: "2026-11-01T09:00:00Z" }), cacheShared: true, params: { region: { type: "string" } } }
        }
    });
    try {
        for (const id of ["shared", "perCaller", "perPerson"]) {
            await present(context, "describe_source", { source: id }, LOCAL);
        }
        await present(context, "describe_source", { source: "byRegion", params: { region: "North" } }, LOCAL);
        const shared = await entryOf(context, "shared");
        assert.equal(shared.rows, 3);
        assert.equal(shared.dataAsOf, "2026-11-01T08:00:00Z");
        for (const id of ["perCaller", "perPerson", "byRegion"]) {
            const entry = await entryOf(context, id);
            assert.equal(entry.rows, undefined, id);
            assert.equal(entry.dataAsOf, undefined, id);
        }
    } finally {
        await context.close();
    }
});

test("list_sources' output schema names rows and dataAsOf for each source", () => {
    const items = /** @type {any} */ (presentedOutput("list_sources")).properties.sources.items.properties;
    assert.equal(items.rows.type, "integer");
    assert.equal(items.dataAsOf.type, "string");
    assert.match(items.rows.description, /policy/);
});

test("GET /sources carries rows and dataAsOf as list_sources does", async () => {
    const dir = workspace();
    utimesSync(join(dir, "data", "sales.csv"), WHEN, WHEN);
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir });
    try {
        const before = await call(`${server.api}/sources`);
        assert.equal(before.status, 200);
        assert.equal(before.data.sources[0].rows, undefined);
        assert.equal((await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } })).status, 200);
        const after = await call(`${server.api}/sources`);
        assert.equal(after.data.sources[0].rows, 5);
        assert.equal(after.data.sources[0].dataAsOf, "2026-10-01T06:30:15Z");
    } finally {
        await server.close();
    }
});

test("reads that end out of order: an older data set never replaces a newer one in the list", async () => {
    const context = await createContext({ log: "off", sources: { shared: { load: async () => ROWS, cacheShared: true } } });
    try {
        const spec = { id: "shared", kind: "source" };
        context.registry.noteRead(spec, { stats: { rows: 3 }, asOf: "2026-11-02T00:00:00Z" });
        context.registry.noteRead(spec, { stats: { rows: 9 }, asOf: "2026-11-01T00:00:00Z" });
        assert.deepEqual([(await entryOf(context, "shared")).rows, (await entryOf(context, "shared")).dataAsOf], [3, "2026-11-02T00:00:00Z"]);
        context.registry.noteRead(spec, { stats: { rows: 4 }, asOf: "2026-11-02T00:00:00Z" });
        assert.equal((await entryOf(context, "shared")).rows, 4, "the same time: the later read wins");
    } finally {
        await context.close();
    }
});

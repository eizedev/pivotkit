// What the services tell about the server: list_sources names listed files by their name, never by the
// server's path, and a policy that hides row counts hides "the source has rows" too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { callerOf, createContext, present } from "pivotkit-server";
import { BY_REGION, SALES_CSV, call, restServer, workspace } from "./helpers.js";

const LOCAL = callerOf("none", undefined);

test("list_sources lists the files of every allowed directory by name: no server path, a name an earlier directory has comes once", async () => {
    const dir = workspace();
    for (const sub of ["first", "second"]) mkdirSync(join(dir, sub));
    writeFileSync(join(dir, "first", "a.csv"), SALES_CSV);
    writeFileSync(join(dir, "second", "b.csv"), SALES_CSV);
    writeFileSync(join(dir, "second", "a.csv"), SALES_CSV);
    const ctx = await createContext({ log: "off", files: { allowDirs: [join(dir, "first"), join(dir, "second")], list: true } });
    try {
        const { result } = await present(ctx, "list_sources", {}, LOCAL);
        const ids = result.sources.filter((s) => s.kind === "file").map((s) => s.id).sort();
        assert.deepEqual(ids, ["file:a.csv", "file:b.csv"]);
        assert.ok(!JSON.stringify(result).includes(dir), "no server path in the list");
        // a listed id reads its file
        const read = await present(ctx, "describe_source", { source: "file:b.csv" }, LOCAL);
        assert.ok(read.result.rows > 0);
    } finally {
        await ctx.close();
    }
});

test("a filter that keeps no rows: no noRowsKept where the policy hides row counts", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { counted: { file: "data/sales.csv", policy: { default: "show" } }, hidden: { file: "data/sales.csv", policy: { default: "show", rows: false } } }, output: { dir: "out" }, baseDir: dir });
    try {
        const view = { ...BY_REGION, filters: [{ field: "Region", type: "in", items: ["Nowhere"] }] };
        const counted = await call(`${server.api}/views/render`, { body: { source: "counted", view, format: "csv" } });
        assert.ok(counted.data.findings.some((f) => f.code === "noRowsKept"), JSON.stringify(counted.data.findings));
        const hidden = await call(`${server.api}/views/render`, { body: { source: "hidden", view, format: "csv" } });
        assert.equal(hidden.status, 200, JSON.stringify(hidden.data));
        assert.deepEqual(hidden.data.findings.filter((f) => f.code === "noRowsKept"), []);
    } finally {
        await server.close();
    }
});

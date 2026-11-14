// Which findings a view gets under the exposure policy, REST and MCP alike (both go through
// present()): a filter that keeps no rows is said for a view whose fields are all shown and never for
// one that touches a field the operator does not show; and suggest_view's draft does not change with
// what the policy keeps back (a date field's span, the distinct counts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BY_REGION, call, restServer, workspace } from "./helpers.js";

/** Orders with a Product column of `products` values (first, so a draft looks at it first) and a date column over a given span. */
function orders({ from, to, products }) {
    const start = Date.parse(from);
    const end = Date.parse(to);
    const lines = ["Product,Region,Sales,OrderDate"];
    for (let i = 0; i < 300; i++) {
        const day = new Date(start + ((end - start) * i) / 299).toISOString().slice(0, 10);
        lines.push(`P${i % products},${["North", "South", "West"][i % 3]},${i},${day}`);
    }
    return `${lines.join("\n")}\n`;
}

test("a filter that keeps no rows: a finding for a view of shown fields, none for a view that touches a summary field", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } }, closed: { file: "data/sales.csv", policy: { fields: { Region: "show" } } } }, output: { dir: "out" }, baseDir: dir });
    try {
        const view = { ...BY_REGION, filters: [{ field: "Region", type: "in", items: ["Nowhere"] }] };
        const open = await call(`${server.api}/views/render`, { body: { source: "sales", view, format: "csv" } });
        assert.equal(open.status, 200, JSON.stringify(open.data));
        const empty = open.data.findings.find((f) => f.code === "noRowsKept");
        assert.ok(empty, JSON.stringify(open.data.findings));
        assert.equal(empty.severity, "warning");
        assert.doesNotMatch(empty.message, /Nowhere/, "the finding names no item");
        // Sales is at summary: whether "Nowhere" is an item of Region stays unsaid
        const closed = await call(`${server.api}/views/render`, { body: { source: "closed", view, format: "csv" } });
        assert.equal(closed.status, 200, JSON.stringify(closed.data));
        assert.deepEqual(closed.data.findings.filter((f) => f.code === "noRowsKept"), []);
        // a filter that keeps rows says nothing
        const kept = await call(`${server.api}/views/render`, { body: { source: "sales", view: { ...BY_REGION, filters: [{ field: "Region", type: "in", items: ["North"] }] }, format: "csv" } });
        assert.deepEqual(kept.data.findings.filter((f) => f.code === "noRowsKept"), []);
    } finally {
        await server.close();
    }
});

test("suggest_view: a summary date field's grouping and a draft under counts: false do not change with the data", async () => {
    const short = orders({ from: "2026-01-01", to: "2026-02-15", products: 3 });
    const long = orders({ from: "2020-01-01", to: "2025-12-31", products: 200 });
    const drafts = [];
    for (const data of [short, long]) {
        const dir = workspace({ "sales.csv": data });
        const server = await restServer({ sources: { dated: { file: "data/sales.csv", policy: { fields: { Region: "show" } } }, counted: { file: "data/sales.csv", policy: { default: "show", counts: false } } }, baseDir: dir });
        try {
            const dated = await call(`${server.api}/views/suggest`, { body: { source: "dated", layout: { cols: ["OrderDate"] } } });
            const counted = await call(`${server.api}/views/suggest`, { body: { source: "counted" } });
            assert.equal(dated.status, 200, JSON.stringify(dated.data));
            assert.equal(counted.status, 200, JSON.stringify(counted.data));
            drafts.push({ dated: dated.data, counted: counted.data });
        } finally {
            await server.close();
        }
    }
    const [a, b] = drafts;
    assert.deepEqual(a.dated.view.view.derived, b.dated.view.view.derived, "the grouping of a summary date says nothing of its span");
    assert.equal(a.dated.name, b.dated.name);
    // the date is shown here, so its grouping may follow its span: the fields picked may not follow the counts
    const fieldsOf = (d) => d.counted.picks.map((p) => [p.part, p.field]);
    assert.deepEqual(fieldsOf(a), fieldsOf(b), "the draft does not depend on counts the policy keeps back");
});

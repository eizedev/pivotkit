import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, findNode, toGrid } from "../src/index.js";
import { SALES, bodyRow, texts } from "./fixtures.js";

const data = encode(SALES);
const base = { rows: ["Region", "Product"], cols: [], values: [{ field: "Units", agg: "sum" }] };

test("subtotals after their children and a grand total row", () => {
    const g = toGrid(computePivot(data, base), { locale: "en-US" });
    assert.deepEqual(texts(g).slice(g.headerRows).map((r) => r.filter((t) => t !== null).join("|")), [
        "North|A|8", "B|2", "North Total|10",
        "South|A|7", "B|1", "South Total|8",
        "West|A|4", "West Total|4",
        "(blank)|A|6", "(blank) Total|6",
        "Grand Total|28"
    ]);
    // the North label is merged down over its two products
    const north = bodyRow(g, "North");
    assert.equal(north[0].rowSpan, 2);
    assert.equal(bodyRow(g, "North Total")[0].total, 1);
    assert.equal(bodyRow(g, "Grand Total")[2].total, 2);
});

test("totals can be switched off", () => {
    const g = toGrid(computePivot(data, { ...base, cols: ["Product"], rows: ["Region"], totals: { grandTotalRow: false, grandTotalColumn: false, rowSubtotals: false, colSubtotals: false } }));
    assert.equal(bodyRow(g, "Grand Total"), undefined);
    assert.ok(!g.rows[0].some((c) => c && c.text === "Grand Total"));
    const noSub = toGrid(computePivot(data, { ...base, totals: { rowSubtotals: false } }));
    assert.equal(bodyRow(noSub, "North Total"), undefined);
    assert.ok(bodyRow(noSub, "Grand Total"));
});

test("column subtotals and the grand total column, with merged headers", () => {
    const r = computePivot(data, { rows: [], cols: ["Product", "Region"], values: [{ field: "Units", agg: "sum" }, { agg: "count" }] });
    const g = toGrid(r, { locale: "en-US" });
    assert.equal(g.headerRows, 3);
    const a = g.rows[0][1];
    assert.equal(a.text, "A");
    assert.equal(a.colSpan, 8); // four regions x two values
    const aTotal = g.rows[0].find((c) => c && c.text === "A Total");
    assert.equal(aTotal.rowSpan, 2);
    assert.equal(aTotal.colSpan, 2);
    assert.deepEqual(g.rows[2].slice(1, 3).map((c) => c.text), ["Sum of Units", "Count"]);
    assert.ok(g.merges.some((m) => m.row === 0 && m.col === 1 && m.colSpan === 8));
});

test("a collapsed group shows its total in one row", () => {
    const view = { ...base, collapsed: { rows: [["South"], [null]] } };
    const g = toGrid(computePivot(data, view), { locale: "en-US" });
    const south = bodyRow(g, "South");
    assert.equal(south[0].colSpan, 2);
    assert.deepEqual(south[0].toggle, { axis: "rows", path: ["South"], collapsed: true });
    assert.equal(south[2].text, "8");
    assert.equal(bodyRow(g, "South Total"), undefined);
    assert.ok(bodyRow(g, "(blank)"));
    // an expanded group offers to collapse
    assert.deepEqual(bodyRow(g, "North")[0].toggle, { axis: "rows", path: ["North"], collapsed: false });
});

test("natural label order with blank last, descending and by value", () => {
    const d = encode([{ k: "Item 10", v: 1 }, { k: "item 2", v: 5 }, { k: null, v: 9 }, { k: "Item 1", v: 3 }]);
    const keys = (sort) => computePivot(d, { rows: ["k"], values: [{ field: "v", agg: "sum" }], sort }).rowRoot.children.map((n) => n.key);
    assert.deepEqual(keys([]), ["Item 1", "item 2", "Item 10", null]);
    assert.deepEqual(keys([{ field: "k", order: "desc" }]), ["Item 10", "item 2", "Item 1", null]);
    assert.deepEqual(keys([{ field: "k", by: "value", order: "desc" }]), [null, "item 2", "Item 1", "Item 10"]);
    assert.deepEqual(keys([{ field: "k", by: "value", value: { field: "v", agg: "min" } }]), ["Item 10", "Item 1", "item 2", null]);
});

test("numbers and dates sort by value, not as text", () => {
    const d = encode([{ n: 10 }, { n: 9 }, { n: 100 }, { n: -1 }]);
    assert.deepEqual(computePivot(d, { rows: ["n"] }).rowRoot.children.map((x) => x.key), [-1, 9, 10, 100]);
});

test("sort by value on an inner level sorts within each parent", () => {
    const r = computePivot(data, { rows: ["Region", "Rep"], values: [{ field: "Units", agg: "sum" }], sort: [{ field: "Rep", by: "value", order: "desc" }] });
    assert.deepEqual(findNode(r, "rows", ["South"]).children.map((n) => n.key), ["Cid", "Dee"]);
});

test("column sort by value uses the column totals", () => {
    const r = computePivot(data, { cols: ["Region"], values: [{ field: "Units", agg: "sum" }], sort: [{ field: "Region", by: "value", order: "asc" }] });
    assert.deepEqual(r.colRoot.children.map((n) => n.key), ["West", null, "South", "North"]);
});

test("values only, rows only and an empty view", () => {
    const valuesOnly = toGrid(computePivot(data, { values: [{ field: "Units", agg: "sum" }] }));
    assert.deepEqual(texts(valuesOnly), [["", "Sum of Units"], ["Grand Total", "28"]]);
    const rowsOnly = toGrid(computePivot(data, { rows: ["Product"] }));
    assert.deepEqual(texts(rowsOnly).map((r) => r[0]), ["Product", "A", "B", "Grand Total"]);
    const empty = toGrid(computePivot(data, {}));
    assert.deepEqual(texts(empty), [["", ""], ["", ""]]);
});

test("no rows left after filtering still gives a grid with zero counts", () => {
    const r = computePivot(data, { rows: ["Region"], values: [{ agg: "count" }], filters: [{ field: "Region", type: "include", items: [] }] });
    const g = toGrid(r);
    assert.deepEqual(texts(g).slice(g.headerRows), [["Grand Total", "0"]]);
});

test("conditional formatting: colour scale and data bars on non-total cells", () => {
    const r = computePivot(data, {
        rows: ["Region"],
        values: [
            { field: "Units", agg: "sum", conditional: { type: "colorScale", colors: ["#ff0000", "#00ff00"] } },
            { field: "Units", agg: "sum", conditional: { type: "dataBar" } }
        ]
    });
    const g = toGrid(r);
    const north = bodyRow(g, "North");
    const west = bodyRow(g, "West");
    assert.deepEqual(north[1].style, { scale: 1, color: "#00ff00" });
    assert.deepEqual(west[1].style, { scale: 0, color: "#ff0000" });
    assert.equal(north[2].style.bar, 1);
    assert.equal(west[2].style.bar, 0.4);
    assert.equal(bodyRow(g, "Grand Total")[1].style, undefined);
});

test("labels and locale can be replaced", () => {
    const r = computePivot(data, { rows: ["Region"], values: [{ field: "Price", agg: "average", format: "number:2" }], formatting: { locale: "de-DE" } });
    const g = toGrid(r, { labels: { grandTotal: "Gesamtergebnis", blank: "(leer)", valueName: "{agg} von {field}", aggregators: { average: "Mittelwert" } } });
    assert.equal(g.rows[0][1].text, "Mittelwert von Price");
    assert.equal(bodyRow(g, "(leer)")[1].text, "9,00");
    assert.equal(bodyRow(g, "North")[1].text, "14,00");
    assert.ok(bodyRow(g, "Gesamtergebnis"));
});

test("collapsed column groups show one total column and plot as one series", async () => {
    const { toSeries } = await import("../src/index.js");
    const r = computePivot(data, { cols: ["Product", "Region"], values: [{ field: "Units", agg: "sum" }], collapsed: { cols: [["A"]] } });
    const g = toGrid(r, { locale: "en-US" });
    const a = g.rows[0].find((c) => c && c.text === "A");
    assert.equal(a.rowSpan, 2);
    assert.deepEqual(a.toggle, { axis: "cols", path: ["A"], collapsed: true });
    assert.deepEqual(toSeries(r).series.map((s) => [s.name, s.data[0]]), [["A", 25], ["B / North", 2], ["B / South", 1]]);
});

test("many fields with large dictionaries fall back to text group keys", () => {
    const rows = [];
    for (let i = 0; i < 3000; i++) {
        rows.push({ a: `a${i}`, b: `b${i}`, c: `c${i}`, d: `d${i}`, e: `e${i % 2}`, v: 1 });
    }
    const d = encode(rows);
    const r = computePivot(d, { rows: ["a", "b", "c", "d", "e"], values: [{ field: "v", agg: "sum" }] });
    assert.equal(r.rowRoot.children.length, 3000);
    assert.equal(r.value(r.rowRoot, r.colRoot, 0), 3000);
    assert.equal(r.value(findNode(r, "rows", ["a7", "b7", "c7", "d7", "e1"]), r.colRoot, 0), 1);
});

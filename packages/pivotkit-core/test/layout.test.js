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
        // a group with one child has no subtotal: it would repeat the child (#156)
        "West|A|4",
        "(blank)|A|6",
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
    const r = computePivot(data, { rows: [], cols: ["Product", "Region"], values: [{ field: "Units", agg: "sum" }, { agg: "count" }], totals: { colSubtotals: true } });
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

test("a single value's name is one header cell over all of its columns", () => {
    const g = toGrid(computePivot(data, { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] }), { locale: "en-US" });
    const names = g.rows[g.headerRows - 1];
    assert.deepEqual(names.map((c) => (c ? c.text : null)), ["Region", "Sum of Units", null, null]);
    assert.equal(names[1].colSpan, 3);
    assert.equal(names[1].valueIndex, 0);
    assert.ok(g.merges.some((m) => m.row === g.headerRows - 1 && m.col === 1 && m.colSpan === 3));
    // two values keep a name per column
    const two = toGrid(computePivot(data, { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }, { agg: "count" }] }), { locale: "en-US" });
    assert.deepEqual(two.rows[1].slice(1, 3).map((c) => c.text), ["Sum of Units", "Count"]);
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
    // rows without values: the labels alone, no empty column and no total without a number (#155, #156)
    const rowsOnly = toGrid(computePivot(data, { rows: ["Product"] }));
    assert.deepEqual(texts(rowsOnly), [["Product"], ["A"], ["B"]]);
    const empty = toGrid(computePivot(data, {}));
    assert.deepEqual(texts(empty), [[""], [""]]);
});

test("rows without values: one column per row field, no empty data column (#155)", () => {
    const g = toGrid(computePivot(encode([{ g: "a" }, { g: "b" }]), { rows: ["g"] }));
    assert.equal(g.columnCount, 1);
    assert.deepEqual(g.dataColumns, []);
    assert.deepEqual(texts(g), [["g"], ["a"], ["b"]]);
    // two row fields: two label columns and nothing after them
    const two = toGrid(computePivot(data, { rows: ["Region", "Product"] }), { locale: "en-US" });
    assert.equal(two.columnCount, 2);
    assert.ok(two.rows.every((row) => row.length === 2));
});

test("rows without values: no subtotal or grand total rows, the toggles stay (#156)", () => {
    const g = toGrid(computePivot(data, { rows: ["Region", "Product"] }), { locale: "en-US" });
    assert.deepEqual(texts(g).slice(g.headerRows).map((r) => r.filter((t) => t !== null).join("|")), [
        "North|A", "B",
        "South|A", "B",
        "West|A",
        "(blank)|A"
    ]);
    assert.ok(g.bodyRows.every((r) => r.total === 0));
    // a group keeps its toggle, also with a single child: collapsing it still hides the inner label
    assert.deepEqual(bodyRow(g, "North")[0].toggle, { axis: "rows", path: ["North"], collapsed: false });
    assert.deepEqual(bodyRow(g, "West")[0].toggle, { axis: "rows", path: ["West"], collapsed: false });
    // the totals switched on explicitly change nothing either
    const on = toGrid(computePivot(data, { rows: ["Region", "Product"], totals: { grandTotalRow: true, rowSubtotals: true } }), { locale: "en-US" });
    assert.deepEqual(texts(on), texts(g));
});

test("columns without values: the column labels stay, without total columns (#156)", () => {
    const g = toGrid(computePivot(data, { rows: ["Region"], cols: ["Product", "Rep"], totals: { colSubtotals: true } }), { locale: "en-US" });
    const headerTexts = g.rows.slice(0, g.headerRows).flat().filter(Boolean).map((c) => c.text);
    assert.ok(headerTexts.includes("A") && headerTexts.includes("Ann"));
    assert.ok(!headerTexts.some((t) => /Total/.test(t)), headerTexts.join(","));
    assert.ok(g.dataColumns.every((c) => c.total === 0 && c.valueIndex === -1));
    assert.equal(g.columnCount, 1 + g.dataColumns.length);
});

test("a group with a single child has no subtotal, on rows and on columns (#156)", () => {
    const d = encode([
        { a: "x", b: "1", c: "x", e: "1", n: 1 },
        { a: "x", b: "2", c: "x", e: "2", n: 2 },
        { a: "y", b: "1", c: "y", e: "1", n: 4 }
    ]);
    const g = toGrid(computePivot(d, { rows: ["a", "b"], cols: ["c", "e"], values: [{ field: "n", agg: "sum" }], totals: { colSubtotals: true } }), { locale: "en-US" });
    const rowLabels = g.bodyRows.map((r) => r.rowPath.join("/") + ":" + r.total);
    assert.deepEqual(rowLabels, ["x/1:0", "x/2:0", "x:1", "y/1:0", ":2"]);
    assert.deepEqual(g.dataColumns.map((c) => c.colPath.join("/") + ":" + c.total), ["x/1:0", "x/2:0", "x:1", "y/1:0", ":2"]);
    // y keeps its toggle on both axes
    assert.deepEqual(bodyRow(g, "y")[0].toggle, { axis: "rows", path: ["y"], collapsed: false });
    assert.deepEqual(g.rows[0].find((c) => c && c.text === "y").toggle, { axis: "cols", path: ["y"], collapsed: false });
    // collapsed, y shows its total in one line, as any collapsed group
    const collapsed = toGrid(computePivot(d, { rows: ["a", "b"], values: [{ field: "n", agg: "sum" }], collapsed: { rows: [["y"]] } }), { locale: "en-US" });
    assert.deepEqual(bodyRow(collapsed, "y").filter(Boolean).map((c) => c.text), ["y", "4"]);
});

test("column subtotals are off by default; row subtotals and both grand totals on (#156)", () => {
    const r = computePivot(data, { rows: ["Region", "Product"], cols: ["Rep", "Date"], values: [{ field: "Units", agg: "sum" }] });
    assert.deepEqual(r.view.totals, { grandTotalRow: true, grandTotalColumn: true, rowSubtotals: true, colSubtotals: false });
    const g = toGrid(r, { locale: "en-US" });
    assert.ok(!g.dataColumns.some((c) => c.total === 1));
    assert.equal(g.dataColumns.at(-1).total, 2);
    assert.ok(g.bodyRows.some((row) => row.total === 1));
    assert.equal(g.bodyRows.at(-1).total, 2);
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

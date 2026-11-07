import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, PivotkitError, computePivot, encode, toEChartsOption, toGrid, toSeries } from "../src/index.js";
import { toCsv, toXlsx } from "../src/export.js";
import { derivedColumn } from "../src/derive.js";

const isError = (code, limit) => (e) => e instanceof PivotkitError && e.code === code && (limit === undefined || e.details.limit === limit);

/** n rows with a distinct row key and a distinct column key each: an n x n pivot. */
function square(n) {
    return encode(Array.from({ length: n }, (_, i) => ({ A: `a${i}`, W: `w${i}`, v: i })));
}

test("a 5k x 5k pivot is refused before the dense grid is allocated", () => {
    const result = computePivot(square(5000), { rows: ["A"], cols: ["W"], values: [{ agg: "count" }] });
    const before = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    assert.throws(() => toGrid(result), isError("LIMIT_EXCEEDED", "cells"));
    assert.throws(() => toSeries(result), isError("LIMIT_EXCEEDED", "cells"));
    assert.throws(() => toEChartsOption(result), isError("LIMIT_EXCEEDED", "cells"));
    // nothing of the 25 million cells was built
    assert.ok(performance.now() - t0 < 1000);
    assert.ok(process.memoryUsage().heapUsed - before < 200e6);
});

test("the cell limit is configurable and names itself in the error", () => {
    const result = computePivot(square(30), { rows: ["A"], cols: ["W"], values: [{ agg: "count" }] });
    // (2 header rows + 31 body rows) x (1 label column + 31 value columns)
    assert.equal(toGrid(result).rows.length * toGrid(result).columnCount, 33 * 32);
    assert.throws(() => toGrid(result, { limits: { cells: 1000 } }), (e) => {
        assert.ok(isError("LIMIT_EXCEEDED", "cells")(e));
        assert.deepEqual(e.details, { limit: "cells", value: 1056, max: 1000 });
        assert.match(e.message, /limits\.cells/);
        return true;
    });
    assert.doesNotThrow(() => toGrid(result, { limits: { cells: 1056 } }));
    assert.equal(LIMITS.cells, 2_000_000);
});

/** n rows of 16 text fields with n distinct values each, every row a combination of its own. */
function wide(n) {
    return encode(Array.from({ length: n }, (_, i) => Object.fromEntries(Array.from({ length: 16 }, (_, j) => [`f${j}`, `v${(i * (j + 7)) % n}`]))));
}

test("a hostile view of many high-cardinality fields is refused quickly, with bounded memory", () => {
    const data = wide(50_000);
    const fields = Array.from({ length: 16 }, (_, j) => `f${j}`);
    const view = { rows: fields.slice(0, 8), cols: fields.slice(8), values: [{ agg: "count" }] };
    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    // without the limits this builds 800,000 nodes and 4 million cells (gigabytes) and returns
    assert.throws(() => computePivot(data, view), isError("LIMIT_EXCEEDED", "groups"));
    assert.ok(performance.now() - t0 < 3000, `${Math.round(performance.now() - t0)} ms`);
    // up to the 500,000 nodes the limit allows (about 200 MB of trees) plus what the build leaves to
    // the garbage collector, which runs when it likes (about 260 MB in Node 26, 350 MB measured in CI
    // with coverage before the trees shared one child map)
    assert.ok(process.memoryUsage().heapUsed - before < 400e6, `${Math.round((process.memoryUsage().heapUsed - before) / 1e6)} MB`);
});

test("computePivot counts groups and cells against options.limits", () => {
    const data = square(30);
    const view = { rows: ["A"], cols: ["W"], values: [{ agg: "count" }] };
    // 31 row nodes + 31 column nodes; 30 (row leaf, column leaf) pairs of 2 x 2 cells each
    assert.throws(() => computePivot(data, view, { limits: { groups: 61 } }), (e) => {
        assert.ok(isError("LIMIT_EXCEEDED", "groups")(e));
        assert.match(e.message, /limits\.groups/);
        return true;
    });
    assert.doesNotThrow(() => computePivot(data, view, { limits: { groups: 62 } }));
    assert.throws(() => computePivot(data, view, { limits: { pivotCells: 119 } }), isError("LIMIT_EXCEEDED", "pivotCells"));
    assert.doesNotThrow(() => computePivot(data, view, { limits: { pivotCells: 120 } }));
    // the row tree alone already exceeds the limit: refused before the column tree is built
    assert.throws(() => computePivot(data, { rows: ["A"] }, { limits: { groups: 30 } }), isError("LIMIT_EXCEEDED", "groups"));
});

test("the default limits fit a browser tab", () => {
    assert.equal(LIMITS.rows, 1_000_000);
    assert.equal(LIMITS.groups, 500_000);
    assert.equal(LIMITS.pivotCells, 2_000_000);
    assert.equal(LIMITS.cacheEntries, 16);
    assert.equal(LIMITS.axisFields, 8);
    // cell keys (row node id x column count + column node id) stay exact under the highest groups limit
    const half = 2 ** 27 / 2;
    assert.ok(half * half + half < Number.MAX_SAFE_INTEGER);
    assert.throws(() => computePivot(square(2), {}, { limits: { groups: 2 ** 27 + 1 } }), isError("INVALID_OPTION"));
    assert.doesNotThrow(() => computePivot(square(2), {}, { limits: { groups: 2 ** 27 } }));
});

test("invalid limits are a programmer error", () => {
    const result = computePivot(square(2), { rows: ["A"] });
    for (const limits of [{ cells: 0 }, { cells: 1.5 }, { cells: "10" }, { nope: 1 }, "x"]) {
        assert.throws(() => toGrid(result, { limits }), isError("INVALID_OPTION"), JSON.stringify(limits));
    }
});

test("encode refuses more rows than limits.rows", () => {
    const rows = Array.from({ length: 11 }, () => ({ a: 1 }));
    assert.throws(() => encode(rows, { limits: { rows: 10 } }), isError("LIMIT_EXCEEDED", "rows"));
    assert.equal(encode(rows, { limits: { rows: 11 } }).length, 11);
});

test("XLSX: more columns or rows than an Excel sheet holds is a clear error", () => {
    // 16,384 value columns plus the label column
    const wide = toGrid(computePivot(square(16_384), { cols: ["W"], values: [{ agg: "count" }], totals: { grandTotalColumn: false } }));
    assert.equal(wide.columnCount, 16_385);
    assert.throws(() => toXlsx(wide), isError("LIMIT_EXCEEDED", "xlsxColumns"));
    // a grid of 1,048,577 rows; sparse, so the test needs no memory
    const tall = { ...wide, rows: new Array(1_048_577), columnCount: 1 };
    assert.throws(() => toXlsx(tall), isError("LIMIT_EXCEEDED", "xlsxRows"));
});

test("wrong arguments throw PivotkitError, not a TypeError deep inside", () => {
    const data = square(2);
    const cases = {
        "computePivot(null)": () => computePivot(null, {}),
        "computePivot({})": () => computePivot({}, {}),
        "toGrid(null)": () => toGrid(null),
        "toGrid({})": () => toGrid({}),
        "toSeries(null)": () => toSeries(null),
        "toEChartsOption(undefined)": () => toEChartsOption(undefined),
        "toXlsx({})": () => toXlsx({}),
        "toCsv(null)": () => toCsv(null),
        "encode({ length: 4e9 })": () => encode({ length: 4e9 })
    };
    for (const [name, fn] of Object.entries(cases)) {
        assert.throws(fn, isError("INVALID_ARGUMENT"), name);
    }
    // a bad view is never an error
    assert.doesNotThrow(() => toGrid(computePivot(data, { rows: 5, values: "x", formatting: { locale: "<script>" } })));
});

test("an invalid locale or time zone in the options is a programmer error", () => {
    const data = square(2);
    assert.throws(() => computePivot(data, {}, { locale: "xx_invalid" }), isError("INVALID_OPTION"));
    assert.throws(() => toGrid(computePivot(data, {}), { locale: 5 }), isError("INVALID_OPTION"));
    assert.throws(() => encode([], { timeZone: "Mars/Olympus" }), isError("INVALID_OPTION"));
});

test("the cache of derived columns and sort orders is bounded", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ a: `x${i % 5}`, v: i }));
    const data = encode(rows);
    for (let size = 1; size <= 300; size++) {
        computePivot(data, { rows: ["b"], derived: [{ name: "b", field: "v", by: "bin", size }], values: [{ field: "v", agg: "sum" }] });
    }
    assert.ok(data.cache.size <= LIMITS.cacheEntries, `${data.cache.size} entries`);
    const small = encode(rows, { limits: { cacheEntries: 4 } });
    for (let size = 1; size <= 20; size++) {
        derivedColumn(small, { name: "b", field: "v", by: "bin", size, origin: 0 });
    }
    assert.equal(small.cache.size, 4);
    // an evicted column is rebuilt with the same content
    const again = computePivot(small, { rows: ["b"], derived: [{ name: "b", field: "v", by: "bin", size: 1 }], values: [{ agg: "count" }] });
    assert.equal(again.rowRoot.children.length, 1000);
});

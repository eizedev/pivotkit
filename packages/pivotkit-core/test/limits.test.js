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

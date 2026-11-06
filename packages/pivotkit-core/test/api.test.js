import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "pivotkit-core";
import * as exporters from "pivotkit-core/export";
import { CATALOG, aggregatorsFor, encode, validate } from "pivotkit-core";

const src = fileURLToPath(new URL("../src/", import.meta.url));

test("the package exports its documented entry points and nothing else", () => {
    assert.deepEqual(Object.keys(core).sort(), [
        "CATALOG", "DEFAULT_LABELS", "DEFAULT_THEME", "LIMITS", "PivotkitError", "VIEW_VERSION", "aggregatorsFor",
        "cellRows", "computePivot", "createHistory", "emptyView", "encode", "fieldItems", "findNode", "formatter", "isFormat",
        "migrate", "normalize", "suggestDateUnit", "toEChartsOption", "toGrid", "toSeries", "validate", "viewFields"
    ]);
    assert.deepEqual(Object.keys(exporters).sort(), ["toCsv", "toCsvBytes", "toXlsx"]);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), [".", "./export", "./package.json"]);
});

/** Every module the file imports, transitively, as paths relative to src/, and the bare imports. */
function importGraph(file, seen = new Set(), bare = new Set()) {
    seen.add(file);
    const text = readFileSync(join(src, file), "utf8");
    for (const [, spec] of text.matchAll(/^(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm)) {
        if (spec.startsWith(".")) {
            const next = join(dirname(file), spec);
            if (!seen.has(next)) {
                importGraph(next, seen, bare);
            }
        } else {
            bare.add(spec);
        }
    }
    return { seen, bare };
}

test("the main entry does not load fflate; only the export entry does", () => {
    assert.deepEqual([...importGraph("index.js").bare], []);
    assert.deepEqual([...importGraph("export.js").bare], ["fflate"]);
    assert.ok(!importGraph("index.js").seen.has("xlsx.js"));
});

test("the catalog lists exactly what normalize accepts", () => {
    const data = encode([{ n: 1, d: "2026-01-01", s: "a" }]);
    for (const agg of CATALOG.aggregators) {
        const field = aggregatorsFor("number").includes(agg) ? "n" : "s";
        assert.equal(validate({ values: [{ field, agg }] }, data).valid, true, agg);
    }
    for (const by of CATALOG.deriveUnits) {
        const derived = by === "bin" ? { name: "X", field: "n", by, size: 1 } : { name: "X", field: "d", by };
        assert.equal(validate({ derived: [derived] }, data).valid, true, by);
    }
    for (const type of CATALOG.chartTypes) {
        assert.equal(validate({ chart: { type } }, data).valid, true, type);
    }
    for (const showAs of CATALOG.showAs) {
        assert.equal(validate({ values: [{ field: "n", agg: "sum", showAs }] }, data).valid, true, showAs);
    }
    assert.deepEqual(aggregatorsFor("string"), ["count", "countUnique", "listUnique", "first", "last"]);
    assert.ok(CATALOG.showAsAlongAxis.includes("runningTotal"));
    assert.ok(!CATALOG.showAsAlongAxis.includes("percentOfGrandTotal"));
    assert.ok(Object.isFrozen(CATALOG));
    // the UI's sub-lists name only entries of the full lists
    for (const agg of CATALOG.commonAggregators) assert.ok(CATALOG.aggregators.includes(agg), agg);
    assert.deepEqual([...CATALOG.timelineUnits, ...CATALOG.cyclicUnits].sort(), CATALOG.deriveUnits.filter((u) => u !== "bin").sort());
});

test("options in an older shape fail loudly instead of being ignored", async () => {
    const { computePivot, toGrid } = core;
    const data = encode([{ Team: "A", Hours: 1 }]);
    const view = { version: 1, rows: ["Team"], values: [{ field: "Hours", agg: "sum" }] };
    // the earlier positional locale: a string where the options object goes
    assert.throws(() => computePivot(data, view, "de-DE"), (e) => e instanceof core.PivotkitError && e.code === "INVALID_OPTION");
    const result = computePivot(data, view);
    assert.throws(() => toGrid(result, "de-DE"), (e) => e.code === "INVALID_OPTION");
    assert.throws(() => exporters.toCsv(toGrid(result), ["x"]), (e) => e.code === "INVALID_OPTION");
    // undefined and null still mean "no options"
    assert.equal(toGrid(result, undefined).locale, toGrid(result, null).locale);
});

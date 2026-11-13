import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "pivotkit-core";
import * as exporters from "pivotkit-core/export";
import * as links from "pivotkit-core/link";
import * as templates from "pivotkit-core/templates";
import * as importer from "pivotkit-core/import";
import * as charts from "pivotkit-core/chart";
import { CATALOG, aggregatorsFor, encode, validate } from "pivotkit-core";

const src = fileURLToPath(new URL("../src/", import.meta.url));

test("the package exports its documented entry points and nothing else", () => {
    assert.deepEqual(Object.keys(core).sort(), [
        "CATALOG", "CHART_COLORS", "DEFAULT_LABELS", "DEFAULT_THEME", "DESCRIBE_LIMITS", "HINT_LIMITS", "ISSUE_CAP", "LIMITS", "MATCH_DEFAULTS", "OUTSIDE_LIMITS", "PivotkitError", "VIEW_FILE_FORMAT", "VIEW_FILE_LIMITS", "VIEW_FILE_SCHEMA", "VIEW_FILE_VERSION", "VIEW_ISSUES", "VIEW_ISSUE_CODES", "VIEW_VERSION", "aggregatorsFor", "autoChartType",
        "cellRows", "chartPlan", "chartThemeFrom", "closest", "computePivot", "createHistory", "describeSource", "describeView", "emptyView", "encode", "fieldDefaultsFromSchema", "fieldItems", "fieldLabel", "findNode", "foldText", "formatter", "fromViewFile", "isFormat", "linkFragment", "linkParam",
        "migrate", "normalize", "outsideLimits", "relativeDateRange", "suggestDateUnit", "swapAxes", "toEChartsOption", "toGrid", "toSeries", "toViewFile", "validate", "viewFields", "viewFileFields", "viewFileName", "viewFileText", "withLinkFragment"
    ]);
    assert.deepEqual(Object.keys(exporters).sort(), ["rowsToCsv", "rowsToCsvBytes", "rowsToXlsx", "scaleColor", "toCsv", "toCsvBytes", "toJson", "toTsv", "toXlsx"]);
    assert.deepEqual(Object.keys(charts).sort(), [
        "BOTTOM_LEGEND_ROOM", "CATEGORY_LABEL_WIDTH", "GROUP_LABEL_ROOM", "RIGHT_LEGEND_MIN_WIDTH", "SLANTED_LABEL_WIDTH", "categoryLabelLayout", "columnLabelLayout", "decorateOption", "groupLabelsFit", "heatmapCellLabels", "pieLabelRoom", "ringLabelsFit", "rowLabelInterval"
    ]);
    assert.deepEqual(Object.keys(links).sort(), ["LINK_ISSUE_CODES", "LINK_LIMITS", "decodeViewLink", "encodeViewLink", "linkFragment", "linkParam", "readViewLink", "withLinkFragment"]);
    assert.deepEqual(Object.keys(templates).sort(), ["TEMPLATES_EXTENSION", "TEMPLATE_LIMITS", "parseTemplates", "templatesFromSchema"]);
    assert.deepEqual(Object.keys(importer).sort(), [
        "BUILT_IN_READERS", "IMPORT_NOTE_CODES", "IMPORT_TYPES", "PLUGIN_API_VERSION", "bytesOf", "checkFileLimit", "cleanText", "createTable", "csvReader", "dateToIso", "fileError", "fileName",
        "jsonReader", "limitError", "loadReader", "noteMessage", "readFile", "readOptions", "readerFor", "retype", "validatePlugin"
    ]);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), [".", "./export", "./chart", "./import", "./link", "./templates", "./schema/view-file-1.json", "./schema/view-2.json", "./schema/view-file-2.json", "./package.json"]);
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

test("the main entry does not load fflate; only the export and link entries do", () => {
    assert.deepEqual([...importGraph("index.js").bare], []);
    assert.deepEqual([...importGraph("export.js").bare], ["fflate"]);
    assert.deepEqual([...importGraph("link.js").bare], ["fflate"]);
    assert.ok(!importGraph("index.js").seen.has("xlsx.js"));
});

test("the chart entry (a report's marks on the chart) loads no dependency and no export module", () => {
    const { seen, bare } = importGraph("chart-style.js");
    assert.deepEqual([...bare], []);
    assert.ok(!seen.has("xlsx.js") && !seen.has("csv.js"));
});

test("the import entry loads no dependency and no reader until a file is read", () => {
    const { seen, bare } = importGraph("import.js");
    assert.deepEqual([...bare], []);
    for (const reader of ["import-csv.js", "import-json.js", "import-text.js"]) assert.ok(!seen.has(reader), reader);
    // and the main entry never reaches the import modules
    assert.ok(![...importGraph("index.js").seen].some((f) => f.startsWith("import")));
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
    for (const [key, list] of [["valueLabels", CATALOG.chartValueLabels], ["legend", CATALOG.chartLegends], ["axisLabels", CATALOG.chartAxisLabels], ["groupLabels", CATALOG.chartGroupLabels], ["labelPosition", CATALOG.chartLabelPositions]]) {
        for (const value of list) {
            assert.equal(validate({ chart: { [key]: value } }, data).valid, true, `${key} ${value}`);
        }
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

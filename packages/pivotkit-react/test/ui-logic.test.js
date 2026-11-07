// The pure parts of the UI: the history with its notes, the keyboard moves of drag and drop, what a
// screen reader hears, the chart's text alternative and hints, file names and labels from a host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toGrid, toSeries } from "pivotkit-core";
import { chartHints, chartSummary } from "../src/chart-summary.js";
import { tooltipContent, tooltipFormatter } from "../src/chart-tooltip.js";
import { MANY_SERIES, MAX_CATEGORIES, SLANTED_LABEL_WIDTH, columnLabelLayout, heatmapCellLabels, pieLabelRoom, rowLabelInterval } from "../src/chart-types.js";
import { announcementsOf, nextTarget } from "../src/dnd-moves.js";
import { dataUrlToBlob, safeFileName } from "../src/files.js";
import { LABELS, errorText, fill, plural, resolveLabels } from "../src/labels.js";
import { fieldAction, layoutSummary, valueLabel } from "../src/names.js";
import { HISTORY_LIMIT, createState, record, redo, reset, settle, undo } from "../src/view-history.js";

const en = LABELS.en;

test("history: steps with notes, undo and redo say what they did, reset is a step", () => {
    let s = createState("schema", "start");
    s = record(s, "a", "Region added to Rows");
    s = record(s, "b", "Region removed");
    assert.equal(record(s, "b", "nothing"), s, "an unchanged view is no step");
    const u = undo(s);
    assert.deepEqual([u.state.present, u.note], ["a", "Region removed"]);
    const r = redo(u.state);
    assert.deepEqual([r.state.present, r.note], ["b", "Region removed"]);
    assert.equal(undo(createState("x", "y")).note, null);
    const back = reset(s, "back to the start view");
    assert.equal(back.present, "start");
    assert.equal(undo(back).state.present, "b", "a reset can be undone");
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = record(s, `v${i}`, `step ${i}`);
    assert.equal(s.past.length, HISTORY_LIMIT);
});

test("history: the host passing back what it got changes nothing; another view is a step; a new schema starts over", () => {
    let s = record(createState("schema", "start"), "a", "first");
    const at = (shown, schema = "schema") => ({ schema, start: "start", shown, outside: "change from outside" });
    assert.equal(settle(s, at("a")), s, "the same view: the history stays as it is");
    const outside = settle(s, at("loaded"));
    assert.deepEqual([outside.present, outside.past.length, undo(outside).note], ["loaded", 2, "change from outside"]);
    const fresh = settle(s, at("renormalized", "other"));
    assert.deepEqual([fresh.schema, fresh.present, fresh.past.length, fresh.start], ["other", "renormalized", 0, "start"]);
});

test("keyboard drag: left and right through a zone's positions, up and down through the zones", () => {
    const targets = [
        { id: "zone:filters", zone: "filters", kind: "zone" },
        { id: "zone:cols", zone: "cols", kind: "zone" },
        { id: "chip:rows:A", zone: "rows", kind: "chip", index: 0 },
        { id: "chip:rows:C", zone: "rows", kind: "chip", index: 2 },
        { id: "zone:rows", zone: "rows", kind: "zone" },
        { id: "zone:values", zone: "values", kind: "zone" }
    ];
    const field = { kind: "field" };
    // a field from the field list starts in Rows, at the end
    assert.equal(nextTarget("ArrowRight", targets, null, field), "zone:rows");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "zone" }, field), "chip:rows:C");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "chip", index: 2 }, field), "chip:rows:A");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "chip", index: 0 }, field), null, "the first position");
    assert.equal(nextTarget("ArrowUp", targets, { zone: "rows", kind: "chip", index: 0 }, field), "zone:cols");
    assert.equal(nextTarget("ArrowUp", targets, { zone: "cols", kind: "zone" }, field), "zone:filters");
    assert.equal(nextTarget("ArrowDown", targets, { zone: "rows", kind: "zone" }, field), "zone:values");
    assert.equal(nextTarget("ArrowDown", targets, { zone: "values", kind: "zone" }, field), null);
    // the chip B (index 1) of Rows, not over anything yet: left is before A, right is before C
    const chip = { kind: "chip", zone: "rows", index: 1 };
    assert.equal(nextTarget("ArrowLeft", targets, null, chip), "chip:rows:A");
    assert.equal(nextTarget("ArrowRight", targets, null, chip), "chip:rows:C");
    assert.equal(nextTarget("ArrowUp", targets, null, chip), "zone:cols");
});

test("drag announcements name the zone and the position", () => {
    const a = announcementsOf(en);
    const active = { data: { current: { kind: "field", label: "Region" } } };
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "chip", zone: "rows", index: 1, count: 2 } } } }), "Region is over Rows, position 2 of 3.");
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "zone", zone: "cols", count: 0 } } } }), "Region is over Columns, at the end.");
    assert.equal(a.onDragOver({ active, over: null }), "Region is not over a zone.");
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "panel" } } } }), "Region is not over a zone.", "a field still in the list");
    const chip = { data: { current: { kind: "chip", zone: "rows", index: 0, label: "Region" } } };
    assert.equal(a.onDragEnd({ active: chip, over: { data: { current: { kind: "chip", zone: "rows", index: 1, count: 2 } } } }), "Region dropped in Rows, position 2 of 2.");
    assert.equal(a.onDragEnd({ active: chip, over: { data: { current: { kind: "panel" } } } }), "Region removed");
    assert.match(en.dragInstructions, /menu/, "the instructions name the menu as the other way");
});

test("the chart's text alternative names type, values, counts and extremes", () => {
    const rows = [{ R: "North", P: "A", V: 5 }, { R: "South", P: "A", V: 9 }, { R: "South", P: "B", V: 1 }];
    const r = computePivot(encode(rows), { rows: ["R"], cols: ["P"], values: [{ field: "V", agg: "sum" }] });
    const s = toSeries(r);
    const text = chartSummary(s, { type: "bar", rows: ["R"], valueNames: ["Sum of V"], labels: en, locale: "en-US" });
    assert.equal(text, "Bars: Sum of V by R. 2 categories, 2 series. Highest 9 at South / A; lowest 1 at South / B. Switch to Table to read every value.");
    const de = chartSummary(s, { type: "line", rows: ["R"], valueNames: ["Summe von V"], labels: LABELS.de, locale: "de-DE" });
    assert.match(de, /^Linien: Summe von V nach R\. 2 Kategorien, 2 Reihen\./);
});

test("counts in words take the plural form of the language: 1 series, 1 Reihe", () => {
    const r = computePivot(encode([{ R: "North", V: 5 }]), { rows: ["R"], values: [{ field: "V", agg: "sum" }] });
    const s = toSeries(r);
    assert.match(chartSummary(s, { type: "bar", rows: ["R"], valueNames: ["Sum of V"], labels: en, locale: "en-US" }), /\. 1 category, 1 series\./);
    assert.match(chartSummary(s, { type: "bar", rows: ["R"], valueNames: ["Summe von V"], labels: LABELS.de, locale: "de-DE" }), /\. 1 Kategorie, 1 Reihe\./);
    assert.equal(plural(en.rowsCount, 1, { lang: "en", locale: "en-US" }), "1 row");
    assert.equal(plural(en.rowsCount, 1234, { lang: "en", locale: "en-US" }), "1,234 rows");
    assert.equal(plural(LABELS.de.drillCount, 1, { lang: "de", locale: "de-DE" }), "1 Zeile");
    assert.equal(plural(LABELS.de.drillCount, 0, { lang: "de", locale: "de-DE" }), "0 Zeilen");
    // a language with more forms: a host's labels keep "few" and "many", which English does not have
    const pl = resolveLabels("en", { lang: "pl", rowsCount: { one: "{count} wiersz", few: "{count} wiersze", many: "{count} wierszy", other: "{count} wiersza" } });
    assert.equal(plural(pl.rowsCount, 3, { lang: pl.lang, locale: "pl-PL" }), "3 wiersze");
    assert.equal(plural(pl.rowsCount, 5, { lang: pl.lang, locale: "pl-PL" }), "5 wierszy");
    // a form of the wrong type is ignored; a missing form falls back to "other"
    assert.equal(resolveLabels("en", { rowsCount: { one: 1 } }).rowsCount.one, "{count} row");
    assert.equal(plural({ other: "{count} things" }, 1, { lang: "en", locale: "en-US" }), "1 things");
});

test("chart hints: many series, dates on columns for lines, the category cap", () => {
    const rows = [];
    for (let c = 0; c < MANY_SERIES + 2; c++) rows.push({ R: "r", C: `c${c}`, V: c });
    const many = toSeries(computePivot(encode(rows), { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }] }));
    assert.deepEqual(chartHints(many, { type: "bar", datesOnColumnsOnly: false, labels: en, locale: "en-US" }).map((h) => [h.id, h.swap]), [["series", true]]);
    assert.deepEqual(chartHints(many, { type: "pie", datesOnColumnsOnly: false, labels: en, locale: "en-US" }), [], "a pie has no series to tell apart");
    assert.deepEqual(chartHints(many, { type: "line", datesOnColumnsOnly: true, labels: en, locale: "en-US" }).map((h) => h.id), ["dates"]);
    const wide = Array.from({ length: MAX_CATEGORIES + 5 }, (_, i) => ({ K: `k${i}`, V: i }));
    const capped = toSeries(computePivot(encode(wide), { rows: ["K"], values: [{ field: "V", agg: "sum" }] }), { maxCategories: MAX_CATEGORIES });
    const hints = chartHints(capped, { type: "bar", datesOnColumnsOnly: false, labels: en, locale: "en-US" });
    assert.equal(hints.at(-1).text, `Showing the first ${MAX_CATEGORIES} of ${MAX_CATEGORIES + 5} categories. Add a filter or Top N to choose them.`);
});

test("value names: plain aggregator words, show-as renames the value", () => {
    assert.equal(valueLabel({ field: "Revenue", agg: "sum" }, en), "Sum of Revenue");
    assert.equal(valueLabel({ field: "Revenue", agg: "sum", showAs: { type: "percentOfGrandTotal" } }, en), "% of grand total of Revenue");
    assert.equal(valueLabel({ field: "Hours", agg: "stdev" }, en), "Standard deviation (sample) of Hours");
    assert.equal(valueLabel({ field: "Umsatz", agg: "average", showAs: { type: "rankDescending" } }, LABELS.de), "Rang (größter zuerst) von Durchschnitt von Umsatz");
    assert.equal(valueLabel({ field: "X", agg: "sum", label: "Own" }, en), "Own");
    // no Excel abbreviations in either language
    for (const lang of [LABELS.en, LABELS.de]) {
        for (const name of Object.values(lang.core.aggregators)) assert.doesNotMatch(name, /StdAbw|StdDev|VarP|VarianzN|^Min$|^Max$/, name);
    }
});

test("file names: no path, no reserved characters or names", () => {
    assert.equal(safeFileName("report"), "report");
    assert.equal(safeFileName(" .report. . "), "report");
    // trailing dots and spaces are trimmed in linear time (a regex for them backtracked quadratically)
    const t0 = performance.now();
    assert.equal(safeFileName(`a${". ".repeat(200_000)}x`), `a${". ".repeat(200_000)}x`.slice(0, 120).replace(/[\s.]+$/, ""));
    assert.equal(safeFileName(`a${". ".repeat(200_000)}`), "a");
    assert.ok(performance.now() - t0 < 200, `${Math.round(performance.now() - t0)} ms`);
    assert.equal(safeFileName("../../etc/passwd"), "etc-passwd");
    assert.equal(safeFileName("C:\\\\temp\\\\x"), "C-temp-x");
    assert.equal(safeFileName('a<b>c:"d|e?*'), "a-b-c-d-e-");
    assert.equal(safeFileName("CON"), "pivot");
    assert.equal(safeFileName(""), "pivot");
    assert.equal(safeFileName(42), "pivot");
    assert.equal(safeFileName("x".repeat(300)).length, 120);
});

test("a data: URL becomes a Blob without fetch()", async () => {
    const png = dataUrlToBlob("data:image/png;base64,iVBORw0KGgo=");
    assert.equal(png.type, "image/png");
    assert.deepEqual([...new Uint8Array(await png.arrayBuffer())].slice(1, 4).map((c) => String.fromCharCode(c)).join(""), "PNG");
    assert.equal(await dataUrlToBlob("data:text/plain,a%20b").text(), "a b");
    assert.throws(() => dataUrlToBlob("https://example.com/x.png"), TypeError);
});

test("labels from a host: wrong types are ignored, not merged", () => {
    const l = resolveLabels("en", { emptySteps: "not a list", zones: { rows: 5, cols: "Spalten" }, undo: null, unknownKey: "x", lang: "fr" });
    assert.deepEqual(l.emptySteps, en.emptySteps);
    assert.deepEqual([l.zones.rows, l.zones.cols, l.undo, l.lang], ["Rows", "Spalten", "Undo", "fr"]);
    assert.equal(/** @type {any} */ (l).unknownKey, undefined);
    assert.deepEqual(resolveLabels("en", { emptySteps: ["One", "Two"] }).emptySteps, ["One", "Two"]);
    assert.deepEqual(resolveLabels("en", { emptySteps: [1, 2] }).emptySteps, en.emptySteps);
});

test("a field of the field list says where it is and what a click on it does", () => {
    const at = (type, zones, labels = en) => {
        const a = fieldAction("Priority", type, zones, labels);
        return [a.kind, a.zone, a.name, a.description];
    };
    assert.deepEqual(at("string", []), ["add", "rows", "Priority", "Add to Rows"]);
    // in Columns: a click moves it to Rows, it is not added a second time
    assert.deepEqual(at("string", ["cols"]), ["move", "rows", "Priority, in Columns", "Move to Rows"]);
    assert.deepEqual(at("date", ["filters"]), ["move", "rows", "Priority, in Filters", "Move to Rows"]);
    // in Rows already: a click does nothing, so there is nothing to describe
    assert.deepEqual(at("string", ["rows"]), [null, "rows", "Priority, in Rows", ""]);
    // counted in Values, not on an axis: a click adds it to Rows
    assert.deepEqual(at("string", ["values"]), ["add", "rows", "Priority, in Values", "Add to Rows"]);
    // a number is added to Values once more
    assert.deepEqual(at("number", ["values", "rows"]), ["add", "values", "Priority, in Values, Rows", "Add to Values"]);
    assert.deepEqual(at("string", ["cols"], LABELS.de), ["move", "rows", "Priority, in Spalten", "Nach Zeilen verschieben"]);
});

test("the compact layout's one line names every zone with fields, rows first", () => {
    const entries = { filters: [{ text: "Status" }], cols: [{ text: "Priority" }], rows: [{ text: "Team" }, { text: "Channel" }], values: [] };
    assert.deepEqual(layoutSummary(entries, en), [
        { zone: "rows", title: "Rows", fields: "Team, Channel" },
        { zone: "cols", title: "Columns", fields: "Priority" },
        { zone: "filters", title: "Filters", fields: "Status" }
    ]);
    assert.deepEqual(layoutSummary({ filters: [], cols: [], rows: [], values: [] }, LABELS.de), []);
});

test("a pie's room for its labels follows the chart's height, at most 24 px", () => {
    assert.equal(pieLabelRoom(200), 10);
    assert.equal(pieLabelRoom(480), 24);
    assert.equal(pieLabelRoom(900), 24);
    assert.equal(pieLabelRoom(-5), 0);
});

test("count labels written the old way keep working: one text for every count, nouns not doubled", () => {
    const l = resolveLabels("de", { rowsCount: "{count} Datensätze", chartCounts: "{categories} Kategorien, {series} Reihen." });
    assert.deepEqual(l.rowsCount, { other: "{count} Datensätze" });
    assert.equal(plural(l.rowsCount, 1, { lang: "de", locale: "de-DE" }), "1 Datensätze");
    const r = computePivot(encode([{ R: "A", V: 1 }, { R: "B", V: 2 }]), { rows: ["R"], values: [{ field: "V", agg: "sum" }] });
    assert.match(chartSummary(toSeries(r), { type: "bar", rows: ["R"], valueNames: ["Summe von V"], labels: l, locale: "de-DE" }), /\. 2 Kategorien, 1 Reihen\./);
});

test("a limit of the core is a message in words with what to change, any other error its message", () => {
    const data = encode(Array.from({ length: 40 }, (_, i) => ({ A: `a${i}`, B: `b${i}` })));
    const refused = (limits, view = { rows: ["A"], cols: ["B"] }) => {
        try {
            toGrid(computePivot(data, view, { limits }), { limits });
        } catch (e) {
            return e;
        }
        throw new Error("no limit was hit");
    };
    assert.equal(errorText(refused({ groups: 50 }), en, "en-US"), fill(en.tooManyGroups, { max: "50" }));
    assert.equal(errorText(refused({ pivotCells: 100 }), LABELS.de, "de-DE"), fill(LABELS.de.tooManyCells, { max: "100" }));
    // 40 rows x 2 x 2 x 1 count
    assert.equal(errorText(refused({ work: 100 }, { rows: ["A"], cols: ["B"], values: [{ agg: "count" }] }), en, "en-US"), fill(en.tooMuchWork, { value: "160", max: "100" }));
    // (2 header rows + 41 body rows) x (1 label column + 41 columns)
    assert.equal(errorText(refused({ cells: 1000 }), en, "en-US"), "This layout makes 1,806 cells, more than the limit of 1,000. Move a field with many values to Filters, or filter it.");
    let rows;
    try {
        encode([{}, {}, {}], { limits: { rows: 2 } });
    } catch (e) {
        rows = e;
    }
    assert.equal(errorText(rows, en, "en-US"), "The data has 3 rows, more than the limit of 2.");
    assert.equal(errorText(new Error("boom"), en, "en-US"), "The report cannot be shown: boom");
    for (const key of ["tooManyGroups", "tooManyCells", "tooManyRows", "tooMuchWork", "zoneFull", "templateTrimmed"]) {
        assert.equal(typeof LABELS.de[key], "string", key);
    }
});

test("chart tooltips: a title and a line per series or slice, values in the core's format", () => {
    const fmt = (v) => (typeof v === "number" ? `${v.toFixed(1)} u` : "");
    // trigger "axis" (bar, line, area): the category, then each series
    assert.deepEqual(
        tooltipContent([{ axisValueLabel: "North", name: "North", seriesName: "2025", value: 3, color: "#123456" }, { name: "North", seriesName: "2026", value: null, color: { type: "linear" } }], { valueFormatter: fmt }),
        { title: "North", lines: [{ color: "#123456", name: "2025", value: "3.0 u" }, { color: null, name: "2026", value: "" }] }
    );
    // pie: the value's name, then the slice
    assert.deepEqual(tooltipContent({ seriesType: "pie", seriesName: "Sum of Units", name: "<b>x</b>", value: 2, color: "#abc" }, { valueFormatter: fmt }), {
        title: "Sum of Units",
        lines: [{ color: "#abc", name: "<b>x</b>", value: "2.0 u" }]
    });
    // heatmap: the row and the column of the cell
    assert.deepEqual(tooltipContent({ seriesType: "heatmap", seriesName: "Count", value: [1, 0, 5], color: "#000" }, { valueFormatter: fmt, xNames: ["2025", "2026"], yNames: ["North"] }), {
        title: "Count",
        lines: [{ color: "#000", name: "North, 2026", value: "5.0 u" }]
    });
});

test("chart tooltips are nodes with texts and CSSOM styles, never markup", () => {
    /** a document with just what the formatter uses */
    const node = () => ({ style: {}, textContent: "", children: [], append(...c) { this.children.push(...c); } });
    const doc = /** @type {any} */ ({ createElement: () => node() });
    const box = /** @type {any} */ (tooltipFormatter(doc, {})({ seriesName: "<img src=x onerror=alert(1)>", name: "<script>", value: 1, color: "red" }));
    assert.equal(box.children[0].textContent, "<img src=x onerror=alert(1)>");
    const [marker, name, value] = box.children[1].children;
    assert.equal(marker.style.backgroundColor, "red");
    assert.equal(name.textContent, "<script>");
    assert.equal(value.textContent, "1");
    assert.equal(JSON.stringify(box).includes("innerHTML"), false);
});

test("heatmap column names: straight when they fit, slanted and cut when they would overlap", () => {
    const names = ["App", "Database", "Device", "Framework", "Language", "Operating system", "Server app", "Service", "Standard"];
    // the chart of a report 1440 px wide is about 1100 px
    assert.deepEqual(columnLabelLayout(names, 1100), { rotate: 0 });
    assert.deepEqual(columnLabelLayout(names, 390), { rotate: 45, width: SLANTED_LABEL_WIDTH, overflow: "truncate" });
    assert.deepEqual(columnLabelLayout(["2024", "2025"], 390), { rotate: 0 });
    assert.deepEqual(columnLabelLayout([], 390), { rotate: 0 });
});

test("heatmap cells show their numbers only when the formatted numbers fit", () => {
    const counts = ["4", "37", "487"];
    // 9 columns of about 113 px and 15 rows of 21 px: counts fit
    assert.equal(heatmapCellLabels(9, 15, 1100, 440, counts), true);
    // a phone: 29 px wide cells hold "487" (20 px) but not "1,234.5" or "-12.3%" (46 px, 40 px)
    assert.equal(heatmapCellLabels(9, 15, 340, 440, counts), true);
    assert.equal(heatmapCellLabels(9, 15, 340, 440, ["1,234.5"]), false);
    assert.equal(heatmapCellLabels(9, 15, 340, 440, ["-12.3%"]), false);
    assert.equal(heatmapCellLabels(3, 15, 340, 440, ["1,234.5"]), true);
    // rows lower than a line of text
    assert.equal(heatmapCellLabels(9, 15, 1100, 300, counts), false);
    assert.equal(heatmapCellLabels(0, 0, 0, 0, []), false);
});

test("heatmap row names: every one when a line fits each row, else every n-th", () => {
    // 15 rows in 440 px: 21 px each
    assert.equal(rowLabelInterval(15, 440), 0);
    // 15 rows in 300 px: 12 px each, every second name
    assert.equal(rowLabelInterval(15, 300), 1);
    // 45 rows in 300 px: 4 px each, every fourth
    assert.equal(rowLabelInterval(45, 300), 3);
    assert.equal(rowLabelInterval(0, 300), 0);
});

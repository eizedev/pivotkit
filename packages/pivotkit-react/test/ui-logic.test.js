// The pure parts of the UI: the history with its notes, the keyboard moves of drag and drop, what a
// screen reader hears, the chart's text alternative and hints, file names and labels from a host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toEChartsOption, toGrid, toSeries } from "pivotkit-core";
import { decorate } from "../src/chart-decorate.js";
import { chartSummary } from "../src/chart-summary.js";
import { tooltipContent, tooltipFormatter } from "../src/chart-tooltip.js";
import { BOTTOM_LEGEND_ROOM, SLANTED_LABEL_WIDTH, columnLabelLayout, heatmapCellLabels, pieLabelRoom, ringLabelsFit, rowLabelInterval } from "../src/chart-types.js";
import { announcementsOf, nextTarget } from "../src/dnd-moves.js";
import { dataUrlToBlob, safeFileName } from "../src/files.js";
import { LABELS, errorText, fill, plural, resolveLabels } from "../src/labels.js";
import { MENU_LABELS } from "../src/menu-labels.js";
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
    assert.equal(plural(MENU_LABELS.de.drillCount, 1, { lang: "de", locale: "de-DE" }), "1 Zeile");
    assert.equal(plural(MENU_LABELS.de.drillCount, 0, { lang: "de", locale: "de-DE" }), "0 Zeilen");
    // a language with more forms: a host's labels keep "few" and "many", which English does not have
    const pl = resolveLabels("en", { lang: "pl", rowsCount: { one: "{count} wiersz", few: "{count} wiersze", many: "{count} wierszy", other: "{count} wiersza" } });
    assert.equal(plural(pl.rowsCount, 3, { lang: pl.lang, locale: "pl-PL" }), "3 wiersze");
    assert.equal(plural(pl.rowsCount, 5, { lang: pl.lang, locale: "pl-PL" }), "5 wierszy");
    // a form of the wrong type is ignored; a missing form falls back to "other"
    assert.equal(resolveLabels("en", { rowsCount: { one: 1 } }).rowsCount.one, "{count} row");
    assert.equal(plural({ other: "{count} things" }, 1, { lang: "en", locale: "en-US" }), "1 things");
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
    // a number goes to Values; in Values already, a click adds no second value (that is the menu's
    // "Add to Values again"), so a repeated Enter cannot pile up "Count of Ticket 2", "3", ...
    assert.deepEqual(at("number", ["rows"]), ["add", "values", "Priority, in Rows", "Add to Values"]);
    assert.deepEqual(at("number", ["cols"]), ["add", "values", "Priority, in Columns", "Add to Values"]);
    assert.deepEqual(at("number", ["values", "rows"]), [null, "values", "Priority, in Values, Rows", ""]);
    assert.deepEqual(at("number", ["values"], LABELS.de), [null, "values", "Priority, in Werte", ""]);
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

test("a donut's numbers fit inside its ring only when the ring is wide enough for them", () => {
    const texts = ["32.3%", "10.7%"];
    // 42 % to 70 % of half of 300 px: a ring of 42 px holds "32.3%" (about 35 px with its room)
    assert.equal(ringLabelsFit(["42%", "70%"], { width: 330, height: 300 }, texts), true);
    // the box left by a legend on the right of a phone's chart: a ring of about 24 px does not
    assert.equal(ringLabelsFit(["42%", "70%"], { width: 170, height: 300 }, texts), false);
    // a pie has room from its centre
    assert.equal(ringLabelsFit(["0%", "70%"], { width: 60, height: 60 }, texts), true);
    assert.equal(ringLabelsFit([20, 40], { width: 300, height: 300 }, ["1"]), true);
    assert.equal(ringLabelsFit([20, 30], { width: 300, height: 300 }, ["1"]), false);
});

test("a donut on a phone: a right legend moves to the bottom, numbers that do not fit the ring go outside", () => {
    const rows = ["Central", "East", "North", "South", "West"].map((R, i) => ({ R, V: [32, 11, 17, 18, 22][i] }));
    const r = computePivot(encode(rows), { rows: ["R"], values: [{ field: "V", agg: "sum" }], display: "chart", chart: { type: "donut", legend: "right", labelPosition: "inside" } });
    const option = toEChartsOption(r);
    const style = /** @type {any} */ ({ getPropertyValue: () => "" });
    // wide: the legend stays on the right, the numbers inside the ring
    const wide = decorate(option, style, 480, undefined, 1280);
    assert.equal(wide.legend.orient, "vertical");
    assert.equal(wide.series[0].label.position, "inside");
    assert.equal(wide.series[0].right, option.series[0].right);
    // 390 px: the legend at the bottom with its room, the pie given back the width the legend took
    const phone = decorate(option, style, 480, undefined, 358);
    assert.equal(phone.legend.orient, undefined);
    assert.equal(phone.legend.right, undefined);
    assert.equal(phone.legend.bottom, 0);
    assert.equal(phone.series[0].right, undefined);
    assert.equal(phone.series[0].bottom, BOTTOM_LEGEND_ROOM + pieLabelRoom(480));
    assert.equal(phone.series[0].label.position, "inside");
    // so low that the ring is too thin for the numbers: they are written outside, on a line, in the text colour
    const low = decorate(option, /** @type {any} */ ({ getPropertyValue: (n) => (n === "--pk-text" ? "#eee" : "") }), 150, undefined, 358);
    assert.equal(low.series[0].label.position, undefined);
    assert.equal(low.series[0].label.color, "#eee");
    assert.deepEqual(low.series[0].labelLine, { show: true });
    assert.equal(low.series[0].label.formatter, option.series[0].label.formatter);
    // a bar chart's plot gets the width back too
    const bars = toEChartsOption(computePivot(encode(rows.map((x) => ({ ...x, C: "a" }))), { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }], chart: { type: "bar", legend: "right" } }));
    const narrowBars = decorate(bars, style, 480, undefined, 358);
    assert.equal(narrowBars.grid.right, 24);
    assert.equal(narrowBars.grid.bottom, BOTTOM_LEGEND_ROOM + 8);
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
    for (const key of ["tooManyGroups", "tooManyCells", "tooManyRows", "tooMuchWork", "zoneFull", "viewTrimmed"]) {
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

test("category axis labels: all straight when they fit, slanted, else every n-th; the modes force one", async () => {
    const { categoryLabelLayout, CATEGORY_LABEL_WIDTH } = await import("../src/chart-types.js");
    const short = ["A", "B", "C"];
    assert.deepEqual(categoryLabelLayout(short, { width: 800, height: 400 }), { rotate: 0, interval: 0, every: 1, width: CATEGORY_LABEL_WIDTH, overflow: "truncate" });
    const countries = Array.from({ length: 21 }, (_, i) => `Country number ${i}`);
    const slanted = categoryLabelLayout(countries, { width: 900, height: 400 });
    assert.deepEqual([slanted.rotate, slanted.every], [45, 1], "21 long names in 900 px: slanted, every one");
    const many = Array.from({ length: 200 }, (_, i) => `Country number ${i}`);
    const nth = categoryLabelLayout(many, { width: 900, height: 400 });
    assert.equal(nth.rotate, 45);
    assert.ok(nth.every > 1 && nth.interval === nth.every - 1);
    assert.equal(categoryLabelLayout(many, { width: 900, height: 400, mode: "all" }).every, 1);
    const straight = categoryLabelLayout(countries, { width: 900, height: 400, mode: "nth" });
    assert.deepEqual([straight.rotate, straight.every > 1], [0, true]);
    // horizontal bars: names stay straight, one per row while a line fits
    assert.equal(categoryLabelLayout(countries, { width: 900, height: 600, horizontal: true }).every, 1);
    assert.ok(categoryLabelLayout(many, { width: 900, height: 600, horizontal: true }).every > 1);
});

test("the tooltip's title is the category's whole name when the axis writes it shorter", async () => {
    const { tooltipContent } = await import("../src/chart-tooltip.js");
    const params = [{ dataIndex: 1, axisValueLabel: "B", seriesName: "Units", value: 2, color: "#123456" }];
    assert.equal(tooltipContent(params, { categoryNames: ["North / A", "North / B"] }).title, "North / B");
    assert.equal(tooltipContent(params).title, "B");
});

test("auto group labels need room: a phone-sized chart writes the whole names instead", async () => {
    const { groupLabelsFit } = await import("../src/chart-types.js");
    assert.equal(groupLabelsFit(21, 3, { width: 1100, height: 420 }), true);
    assert.equal(groupLabelsFit(21, 3, { width: 350, height: 180 }), false, "390 px phone");
    assert.equal(groupLabelsFit(200, 1, { width: 1100, height: 420 }), false, "groups of one category are too narrow");
    assert.equal(groupLabelsFit(21, 3, { width: 900, height: 600, horizontal: true }), true);
});

test("toolbar: which buttons go into More follows the width and a fixed priority, never the texts", async () => {
    const { OVERFLOW_ORDER, TOOLBAR_ROOM, overflowLevel } = await import("../src/overflow.js");
    // Redo stays with Undo: it never moves; Reset goes first (it makes room for "More", New would not)
    assert.deepEqual(OVERFLOW_ORDER, ["reset", "new", "layout", "views", "options", "chartType"]);
    const all = TOOLBAR_ROOM.display + TOOLBAR_ROOM.sep + TOOLBAR_ROOM.undo + TOOLBAR_ROOM.redo + TOOLBAR_ROOM.export + OVERFLOW_ORDER.reduce((n, id) => n + TOOLBAR_ROOM[id], 0);
    assert.equal(overflowLevel(all, false), 0, "room for every button");
    assert.equal(overflowLevel(all - 0.1, false), 1, "a little less: Reset goes first");
    assert.equal(overflowLevel(0, false), OVERFLOW_ORDER.length, "no room: all of them");
    // a narrow report has the Fields button too: Reset and New make room for it and for "More"
    assert.equal(overflowLevel(all, true), 2);
    // the level only grows as the toolbar gets narrower
    let last = 0;
    for (let w = 140; w >= 0; w -= 0.5) {
        const level = overflowLevel(w, false);
        assert.ok(level >= last);
        last = level;
    }
});

test("field list keys: up and down between fields, left and right between a field's controls", async () => {
    const { SLOTS, opensMenu, roveTarget } = await import("../src/rove.js");
    assert.deepEqual(SLOTS, ["handle", "name", "info", "menu"]);
    // row 1 has an "i", the others do not
    const slotsOf = (row) => (row === 1 ? ["handle", "name", "info", "menu"] : ["handle", "name", "menu"]);
    assert.deepEqual(roveTarget("ArrowDown", { row: 0, slot: "name" }, 3, slotsOf), { row: 1, slot: "name" });
    assert.deepEqual(roveTarget("ArrowDown", { row: 2, slot: "name" }, 3, slotsOf), { row: 2, slot: "name" }, "the last field stays");
    assert.deepEqual(roveTarget("ArrowUp", { row: 0, slot: "menu" }, 3, slotsOf), { row: 0, slot: "menu" });
    assert.deepEqual(roveTarget("ArrowDown", { row: 0, slot: "menu" }, 3, slotsOf), { row: 1, slot: "menu" }, "the column stays");
    assert.deepEqual(roveTarget("ArrowDown", { row: 1, slot: "info" }, 3, slotsOf), { row: 2, slot: "name" }, "a field without an i: its name");
    assert.deepEqual(roveTarget("End", { row: 0, slot: "handle" }, 3, slotsOf), { row: 2, slot: "handle" });
    assert.deepEqual(roveTarget("Home", { row: 2, slot: "name" }, 3, slotsOf), { row: 0, slot: "name" });
    assert.deepEqual(roveTarget("ArrowRight", { row: 1, slot: "name" }, 3, slotsOf), { row: 1, slot: "info" });
    assert.deepEqual(roveTarget("ArrowRight", { row: 0, slot: "name" }, 3, slotsOf), { row: 0, slot: "menu" });
    assert.deepEqual(roveTarget("ArrowRight", { row: 0, slot: "menu" }, 3, slotsOf), { row: 0, slot: "menu" }, "the last control stays");
    assert.deepEqual(roveTarget("ArrowLeft", { row: 0, slot: "name" }, 3, slotsOf), { row: 0, slot: "handle" });
    assert.equal(roveTarget("Enter", { row: 0, slot: "name" }, 3, slotsOf), null, "Enter is the control's own");
    assert.equal(roveTarget("ArrowDown", { row: 0, slot: "name" }, 0, slotsOf), null);
    assert.equal(opensMenu({ key: "F10", shiftKey: true }), true);
    assert.equal(opensMenu({ key: "ContextMenu", shiftKey: false }), true);
    assert.equal(opensMenu({ key: "F10", shiftKey: false }), false);
});

test("filter: the condition on the labels by the field's type, none for dates and yes/no", async () => {
    const { conditionKind } = await import("../src/view-ops.js");
    const data = encode([{ Region: "North", Units: 3, Day: "2026-01-05", Done: true }]);
    const view = { derived: [{ name: "Day by month", field: "Day", by: "yearMonth" }, { name: "Units (by 2)", field: "Units", by: "bin", size: 2 }] };
    assert.equal(conditionKind(data, view, "Region"), "text");
    assert.equal(conditionKind(data, view, "Units"), "number");
    assert.equal(conditionKind(data, view, "Units (by 2)"), "number");
    assert.equal(conditionKind(data, view, "Day"), null);
    assert.equal(conditionKind(data, view, "Day by month"), null, "a grouping of a date is a date");
    assert.equal(conditionKind(data, view, "Done"), null);
});

test("a date grouping is named in words: Date by month, Datum nach Monat", async () => {
    const { groupingName } = await import("../src/names.js");
    assert.equal(groupingName("Date", "yearMonth", LABELS.en), "Date by month");
    assert.equal(groupingName("Date", "month", LABELS.en), "Date by month of year");
    assert.equal(groupingName("Datum", "yearMonth", LABELS.de), "Datum nach Monat");
    assert.equal(groupingName("Amount", "bin", LABELS.en, 100), "Amount (by 100)");
    // a host's labels without unitInName: the unit's own name
    assert.equal(groupingName("Date", "year", { ...LABELS.en, unitInName: undefined }), "Date by Year");
});

test("toolbar room: the widest text of every language, plus what a button has around it", async () => {
    const { toolbarRoom, toolbarTexts, overflowLevel } = await import("../src/overflow.js");
    const texts = toolbarTexts([LABELS.en, LABELS.de]);
    assert.ok(texts.undo.includes("Undo") && texts.undo.includes("Rückgängig"));
    assert.ok(texts.chartType.includes("Gestapelte Balken"));
    // one px per character: the room is that of the longer language
    const room = toolbarRoom(texts, (t) => t.length, { text: 30, menu: 40, display: 50, sep: 9, gap: 6 });
    assert.equal(room.undo, 30 + "Rückgängig".length + 6);
    assert.equal(room.chartType, 40 + "Gestapelte Balken".length + 6);
    assert.equal(room.display, 50 + "Tabelle".length + "Diagramm".length + 6);
    // the same room whichever language is shown: the same level at the same width
    const shownDe = toolbarRoom(toolbarTexts([LABELS.en, LABELS.de, LABELS.de]), (t) => t.length, { text: 30, menu: 40, display: 50, sep: 9, gap: 6 });
    for (let w = 100; w < 600; w += 7) assert.equal(overflowLevel(w, false, shownDe), overflowLevel(w, false, room));
});

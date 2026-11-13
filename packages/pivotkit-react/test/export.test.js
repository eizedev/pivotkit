// The report's exports without a browser: what the host's onExport gets for the table's copies and
// for the drill-down panel's exports, what the note says, and the texts in both languages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cellRows, computePivot, encode } from "pivotkit-core";
import { exportDrill, rowsText } from "../src/drill-export.js";
import { drillTable } from "../src/drill-table.js";
import { LABELS } from "../src/labels.js";
import { de as menuDe } from "../src/menu-labels-de.js";
import { addMenuTexts, menuLabels } from "../src/menu-labels.js";
import { hexColor, loadExporters, runExport, xlsxThemeOf } from "../src/export-run.js";

// the German menu texts, as lazy-menus.jsx adds them once their chunk has loaded
addMenuTexts("de", menuDe);
const en = menuLabels(LABELS.en);
const de = menuLabels(LABELS.de);

const ROWS = [
    { Region: "Central", Month: "2026-07-01", Units: 1234.5, Note: "=cmd()", Paid: true },
    { Region: "Central", Month: "2026-07-01", Units: 2, Note: "plain", Paid: false },
    { Region: "North", Month: "2026-08-01", Units: 3, Note: "", Paid: true }
];
const encoded = encode(ROWS);
const result = computePivot(encoded, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });

/** A drill state as PivotReport builds it, for the rows behind Central. */
function drillOf(limit, locale = "en-US", labels = en) {
    const all = cellRows(result, { row: ["Central"] });
    const indices = all.slice(0, limit);
    const table = drillTable(encoded, indices, { locale, labels: labels.core });
    return { title: "Region: Central", name: "Central – Jul 2026", count: all.length, locale, indices, formats: { Units: "number:1" }, columns: table.columns.map((c) => ({ ...c, label: c.name === "Units" ? "Units sold" : undefined })), rows: table.rows };
}

/** Runs one export with an onExport that keeps everything, and returns what it got and what was said. */
async function run(kind, drill, labels = en) {
    const seen = [];
    const said = [];
    await exportDrill(kind, { drill, encoded, labels, onExport: (file) => (seen.push(file), false), announce: (text, extra) => said.push({ text, extra }), root: null });
    return { file: seen[0], said };
}

test("rowsText: all rows, or the first of more", () => {
    assert.equal(rowsText({ shown: 2, count: 2 }, en, "en-US"), "2 rows");
    assert.equal(rowsText({ shown: 1000, count: 4212 }, en, "en-US"), "1,000 of 4,212 rows");
    assert.equal(rowsText({ shown: 1000, count: 4212 }, de, "de-DE"), "1.000 von 4.212 Zeilen");
});

test("drill-down Copy: the rows as the panel shows them, tab-separated, a header row, formulas guarded", async () => {
    const { file, said } = await run("drill-copy", drillOf(1000));
    assert.equal(file.kind, "drill-copy");
    assert.equal(file.fileName, "Central – Jul 2026.tsv");
    assert.deepEqual(file.rows, { shown: 2, count: 2 });
    const lines = file.text.trimEnd().split("\r\n");
    assert.equal(lines[0], "Region\tMonth\tUnits sold\tNote\tPaid");
    assert.equal(lines[1], "Central\tJul 1, 2026\t1,234.5\t'=cmd()\tYes");
    assert.equal(await file.blob.text(), file.text);
    // the host kept it: the report says nothing
    assert.deepEqual(said, []);
});

test("drill-down Copy as JSON: row objects with the data's field names and raw values", async () => {
    const { file } = await run("drill-json", drillOf(1000));
    assert.equal(file.fileName, "Central – Jul 2026.json");
    assert.deepEqual(JSON.parse(file.text), [
        { Region: "Central", Month: "2026-07-01", Units: 1234.5, Note: "=cmd()", Paid: true },
        { Region: "Central", Month: "2026-07-01", Units: 2, Note: "plain", Paid: false }
    ]);
});

test("drill-down downloads: CSV with the panel's headers and formats, an Excel workbook named after the cell", async () => {
    const csv = await run("drill-csv", drillOf(1000));
    assert.equal(csv.file.fileName, "Central – Jul 2026.csv");
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await csv.file.blob.arrayBuffer());
    assert.equal(text, "\uFEFFRegion,Month,Units sold,Note,Paid\r\nCentral,2026-07-01,1234.5,'=cmd(),Yes\r\nCentral,2026-07-01,2,plain,No\r\n");
    const xlsx = await run("drill-xlsx", drillOf(1000));
    assert.equal(xlsx.file.fileName, "Central – Jul 2026.xlsx");
    assert.equal(xlsx.file.blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.ok(xlsx.file.blob.size > 0);
});

test("drill-down exports of the first of more rows hold those rows and say so", async () => {
    const said = [];
    const files = [];
    // the host lets it through: the report saves the file itself (no DOM here, so the download fails
    // after the host saw it) or copies (no clipboard here: the note says it is blocked)
    await exportDrill("drill-copy", { drill: drillOf(1), encoded, labels: en, onExport: (f) => void files.push(f), announce: (text, extra) => said.push({ text, extra }), root: null });
    assert.deepEqual(files[0].rows, { shown: 1, count: 2 });
    assert.equal(files[0].text.trimEnd().split("\r\n").length, 2);
    assert.deepEqual(said, [{ text: en.toastCopyBlocked, extra: { tone: "error" } }]);
    // the toast of a done export names the rows it holds
    assert.equal(en.drillCopied.replace("{rows}", rowsText({ shown: 1, count: 2 }, en, "en-US")), "Copied 1 of 2 rows: tab-separated, pastes into Excel or Google Sheets as columns");
    assert.equal(de.drillExported.replace("{file}", "a.csv").replace("{rows}", rowsText({ shown: 1000, count: 4212 }, de, "de-DE")), "a.csv exportiert (1.000 von 4.212 Zeilen)");
});

test("drill-down exports in German: the report's words for yes/no and the locale's separator", async () => {
    const { file } = await run("drill-csv", drillOf(1000, "de-DE", de), de);
    const text = new TextDecoder().decode(await file.blob.arrayBuffer());
    assert.equal(text.split("\r\n")[1], "Central;2026-07-01;1234,5;'=cmd();Ja");
});

test("Export → Copy table and Copy data as JSON go to the host's onExport first", async () => {
    await loadExporters();
    const files = [];
    const said = [];
    const context = { fileName: "sales/2026", result, locale: "en-US", labels: LABELS.en, limits: undefined, root: { current: null }, chartRef: { current: null }, announce: (t) => said.push(t), onExport: (f) => (files.push(f), false) };
    await runExport("copy-table", context);
    await runExport("copy-json", context);
    assert.deepEqual(files.map((f) => [f.kind, f.fileName]), [["copy-table", "sales-2026.tsv"], ["copy-json", "sales-2026.json"]]);
    assert.equal(files[0].text.split("\r\n")[0], "Region\tSum of Units");
    assert.equal(files[0].blob.type, "text/tab-separated-values");
    const json = JSON.parse(files[1].text);
    assert.deepEqual(json.rows[0], { labels: ["Central"], total: 0, collapsed: false, values: [1236.5] });
    assert.deepEqual(said, []);
    // without a clipboard (Node) the copy is refused and the note says so
    const refused = [];
    await runExport("copy-table", { fileName: "x", result, locale: "en-US", labels: LABELS.en, limits: undefined, root: { current: null }, chartRef: { current: null }, announce: (t, extra) => refused.push([t, extra]) });
    assert.deepEqual(refused, [[en.toastCopyBlocked, { tone: "error" }]]);
});

test("the menus' export texts exist in English and German, distinct from the view's copy", () => {
    for (const labels of [en, de]) {
        for (const key of ["copyTable", "copyDataJson", "drillCopy", "drillJson", "drillCsv", "drillXlsx", "drillPart", "drillCopied", "drillCopiedJson", "drillExported", "drillExportNote", "exportDownload", "exportCopy"]) {
            assert.equal(typeof labels[key], "string", `${labels.lang} ${key}`);
        }
        assert.notEqual(labels.copyDataJson, labels.copyJson);
        for (const key of ["copyTable", "copyDataJson", "drillCopy", "drillJson"]) {
            assert.equal(typeof labels.settingInfo[key], "string", `${labels.lang} settingInfo.${key}`);
        }
    }
    assert.equal(de.copyDataJson, "Daten als JSON kopieren");
    for (const key of ["toastTableCopied", "toastDataCopied", "toastCopyBlocked"]) {
        assert.equal(typeof en[key], "string");
        assert.equal(typeof de[key], "string");
    }
});

/** The colours fakeContext takes by name. */
const NAMED = { white: "#ffffff", rebeccapurple: "#663399" };
/** CSS.supports("color", text) for what fakeContext takes. */
const supports = (t) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.trim()) || Object.hasOwn(NAMED, t.trim().toLowerCase()) || /^oklch\(/.test(t);

/** A stand-in for a canvas's 2D context: fillStyle takes #rgb, #rrggbb and two names as hex, oklch as it is. */
function fakeContext() {
    const named = NAMED;
    let style = "#000000";
    return {
        get fillStyle() {
            return style;
        },
        set fillStyle(v) {
            const t = String(v).trim().toLowerCase();
            const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
            if (short) style = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
            else if (/^#[0-9a-f]{6}$/.test(t)) style = t;
            else if (Object.hasOwn(named, t)) style = named[t];
            else if (t.startsWith("oklch(")) style = t;
            // anything else: a canvas keeps the colour it had
        }
    };
}

// #212: the workbook's colours are the report's resolved tokens
test("hexColor: a colour the canvas takes as #rrggbb, else null (also black and white themselves)", () => {
    const ctx = fakeContext();
    const hex = (t, c = ctx) => hexColor(t, c, supports);
    assert.equal(hex("#EAF1FB"), "#eaf1fb");
    assert.equal(hex("#c00"), "#cc0000");
    assert.equal(hex("white"), "#ffffff");
    assert.equal(hex("#000000"), "#000000");
    // no colour: refused, not the colour the canvas had before
    assert.equal(hex("not a colour"), null);
    assert.equal(hex(""), null);
    // a colour the canvas does not write as hex (outside sRGB)
    assert.equal(hex("oklch(0.5 0.1 200)"), null);
    assert.equal(hex("#eaf1fb", null), null);
    // without CSS.supports (Node) nothing is taken
    assert.equal(hexColor("#eaf1fb", ctx), null);
});

test("xlsxThemeOf: the scale's low and high tokens (a middle one when set) and the bars' colour", () => {
    const ctx = fakeContext();
    const toHex = (t) => hexColor(t, ctx, supports);
    const style = (tokens) => ({ getPropertyValue: (name) => tokens[name] ?? "" });
    assert.deepEqual(xlsxThemeOf(style({ "--pk-scale-low": " #eaf1fb", "--pk-scale-high": "#2a78d6", "--pk-chart-1": "#2a78d6" }), toHex), { colorScale: ["#eaf1fb", "#2a78d6"], dataBar: "#2a78d6" });
    assert.deepEqual(xlsxThemeOf(style({ "--pk-scale-low": "#00f", "--pk-scale-mid": "white", "--pk-scale-high": "#c00" }), toHex), { colorScale: ["#0000ff", "#ffffff", "#cc0000"] });
    // one end missing or not a colour: pivotkit-core's default scale, not half of the theme's
    assert.deepEqual(xlsxThemeOf(style({ "--pk-scale-low": "#00f", "--pk-scale-high": "oklch(0.5 0.1 200)" }), toHex), {});
});

test("the HTML report, the chart as SVG and the report to print go through onExport first; a host may take them", async () => {
    const files = [];
    const said = [];
    const chartView = computePivot(encoded, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], display: "chart", chart: { type: "bar" } });
    const context = {
        fileName: "sales/2026",
        result: chartView,
        locale: "de-DE",
        labels: LABELS.de,
        limits: undefined,
        root: { current: null },
        chartRef: { current: { getWidth: () => 640.4, getHeight: () => 50 } },
        announce: (t, extra) => said.push([t, extra]),
        onExport: (f) => (files.push(f), false),
        title: "Units by region",
        source: "sales.csv",
        loadECharts: () => import("../src/echarts.js")
    };
    await runExport("html", context);
    await runExport("svg", context);
    await runExport("print", context);
    assert.deepEqual(files.map((f) => [f.kind, f.fileName, f.blob.type]), [["html", "sales-2026.html", "text/html;charset=utf-8"], ["svg", "sales-2026.svg", "image/svg+xml"], ["print", "sales-2026.html", "text/html;charset=utf-8"]]);
    const html = await files[0].blob.text();
    assert.match(html, /<html lang="de-DE"/);
    assert.match(html, /<h1>Units by region<\/h1>/);
    assert.match(html, /<dt>Quelle<\/dt><dd>sales\.csv<\/dd>/);
    // the table as the report shows it, the chart as an image since the view shows the chart
    assert.match(html, /<th scope="row" class="pk-th pk-row">Central<\/th><td class="pk-td pk-num">1\.236,5<\/td>/);
    assert.match(html, /<img alt="Diagramm: Units by region" width="640" height="100" src="data:image\/svg\+xml;base64,/);
    const svg = await files[1].blob.text();
    assert.match(svg, /^<svg width="640" height="100" /);
    assert.ok(svg.includes(">Central</text>"));
    // printing: the chart inline (no data: image a strict page would block)
    const print = await files[2].blob.text();
    assert.match(print, /<figure class="pk-report-chart"><svg /);
    assert.deepEqual(said, [], "a host that takes the file says itself what became of it");
});

test("the new export texts exist in English and German", () => {
    for (const labels of [en, de]) {
        for (const key of ["exportHtml", "exportSvg", "exportPrintGroup", "exportPrint", "toastPrintBlocked"]) {
            assert.equal(typeof labels[key], "string", `${labels.lang} ${key}`);
        }
        for (const key of ["exportHtml", "exportPrint"]) {
            assert.equal(typeof labels.settingInfo[key], "string", `${labels.lang} settingInfo.${key}`);
        }
    }
    assert.equal(en.exportPrint, "Print or save as PDF…");
    assert.equal(de.exportPrint, "Drucken oder als PDF speichern…");
});

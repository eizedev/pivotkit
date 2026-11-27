// render() on data that uses each feature it must keep: subtotals, "show values as", a relative filter
// with a fixed "now", an empty result, conditional colours, a cyclic date grouping, a one-letter field,
// a view file's name, strict and lenient, the limits, every format.
import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { DESCRIBE_LABELS, PivotkitError, encode } from "pivotkit-core";
import { readFile } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";
import { DARK_TOKENS, LIGHT_TOKENS, REPORT_LIMITS, render } from "pivotkit-report";
import { FIXED, SALES, bodyCells, echarts, svgTexts } from "./fixtures.js";

const BY_REGION = { rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum" }] };

test("every format renders the same table: media type, extension, body bytes and text", async () => {
    for (const [format, mediaType, extension] of [["json", "application/json", "json"], ["csv", "text/csv;charset=utf-8", "csv"], ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"], ["svg", "image/svg+xml", "svg"], ["html", "text/html;charset=utf-8", "html"]]) {
        const r = await render(BY_REGION, SALES, { format, echarts, ...FIXED });
        assert.equal(r.ok, true, format);
        assert.deepEqual([r.mediaType, r.extension], [mediaType, extension]);
        assert.ok(r.body instanceof Uint8Array && r.body.length > 100, format);
        assert.equal(typeof r.text === "string", format !== "xlsx", format);
    }
});

test("JSON and CSV carry the numbers of the pivot, subtotals and the grand total included", async () => {
    const json = JSON.parse((await render(BY_REGION, SALES, { format: "json", ...FIXED })).text);
    const north = json.rows.filter((r) => r.labels[0].startsWith("North"));
    assert.deepEqual(north.map((r) => [r.labels.join("|"), r.total, r.values[0]]), [["North|A", 0, 8], ["North|B", 0, 2], ["North Total|", 1, 10]]);
    assert.equal(json.rows.at(-1).values[0], 32);
    const csv = await render(BY_REGION, SALES, { format: "csv", ...FIXED });
    assert.deepEqual([...csv.body.slice(0, 3)], [0xef, 0xbb, 0xbf], "a byte order mark for Excel");
    assert.ok(csv.text.includes("North Total,,10\r\n"));
    assert.ok(csv.text.includes("Grand Total,,32\r\n"));
});

test("an XLSX file reads back with pivotkit-xlsx: the regions and the units are there", async () => {
    const r = await render(BY_REGION, SALES, { format: "xlsx", title: "Sales by region", ...FIXED });
    const table = await readFile(new File([r.body], "report.xlsx"), { plugins: [xlsxReader] });
    const cells = table.data.flat().map(String);
    for (const expected of ["North", "South", "West", "North Total", "Grand Total", "32", "10"]) {
        assert.ok(cells.includes(expected), expected);
    }
});

test("HTML: subtotals and the grand total are marked, merged labels span their rows, numbers right", async () => {
    const r = await render(BY_REGION, SALES, { format: "html", ...FIXED });
    assert.match(r.text, /<th scope="row" class="pk-th pk-row" rowspan="2">North<\/th>/);
    assert.match(r.text, /<th scope="row" class="pk-th pk-row pk-sub" colspan="2">North Total<\/th><td class="pk-td pk-num pk-sub">10<\/td>/);
    assert.match(r.text, /<th scope="row" class="pk-th pk-row pk-grand" colspan="2">Grand Total<\/th><td class="pk-td pk-num pk-grand">32<\/td>/);
    assert.deepEqual(bodyCells(r.text)[0], ["North", "A", "8"]);
    // a blank region is named as the table names it, after the others; a group of one item (West,
    // the blank region) has no subtotal row, as on the screen
    assert.deepEqual(bodyCells(r.text).at(-2), ["(blank)", "A", "6"]);
    assert.ok(!r.text.includes("West Total") && !r.text.includes("(blank) Total"));
});

test("HTML: a merged column header spans its columns, and a collapsed group is marked", async () => {
    const across = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }, { field: "Price", agg: "max" }] };
    const r = await render(across, SALES, { format: "html", ...FIXED });
    assert.equal(r.ok, true);
    assert.match(r.text, /<th scope="col" class="pk-th" colspan="2">A<\/th><th scope="col" class="pk-th" colspan="2">B<\/th>/);
    const collapsed = await render({ ...BY_REGION, collapsed: { rows: [["South"]] } }, SALES, { format: "html", ...FIXED });
    assert.match(collapsed.text, /<th scope="row" class="pk-th pk-row pk-collapsed" colspan="2">South<\/th><td class="pk-td pk-num">12<\/td>/);
});

test('"show values as" a share of the grand total: the report shows what the table shows', async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum", showAs: { type: "percentOfGrandTotal" } }] };
    const cells = bodyCells((await render(view, SALES, { format: "html", ...FIXED })).text);
    assert.deepEqual(cells.find((c) => c[0] === "North"), ["North", "31.3%"]);
    assert.deepEqual(cells.at(-1), ["Grand Total", "100.0%"]);
});

test("a relative date filter is counted from options.now: another now keeps other rows", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Date", type: "relative", unit: "month", count: 3 }] };
    // the last 3 whole months before November 2026: August to October
    const now = JSON.parse((await render(view, SALES, { format: "json", ...FIXED })).text);
    assert.deepEqual(now.rows.map((r) => [r.labels[0], r.values[0]]), [["South", 4], ["West", 4], ["Grand Total", 8]]);
    const before = JSON.parse((await render(view, SALES, { format: "json", ...FIXED, now: "2026-04-10" })).text);
    assert.deepEqual(before.rows.map((r) => [r.labels[0], r.values[0]]), [["North", 2], ["South", 8], ["Grand Total", 10]]);
});

test("an empty result is a report too: the headers and the grand total row, ok", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Region", type: "in", items: ["Nowhere"] }] };
    const r = await render(view, SALES, { format: "html", ...FIXED });
    assert.equal(r.ok, true);
    assert.match(r.text, /<thead><tr><th scope="col" class="pk-th pk-corner">Region<\/th><th scope="col" class="pk-th">Sum of Units<\/th><\/tr><\/thead>/);
    assert.deepEqual(bodyCells(r.text), [["Grand Total", "0"]]);
    assert.equal(r.summary.rows, 1);
});

test("conditional colours: a colour scale per cell and data bars, as rules without style attributes", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale", colors: ["#ff0000", "#00ff00"] } }, { field: "Price", agg: "sum", conditional: { type: "dataBar", color: "#123456" } }] };
    const r = await render(view, SALES, { format: "html", ...FIXED });
    assert.ok(!/\sstyle=/.test(r.text.slice(r.text.indexOf("<body"))), "no style attribute in the body");
    const scale = [...r.text.matchAll(/class="pk-td pk-num pk-has-scale (pk-c\d+)">(\d+)</g)].map((m) => [m[2], m[1]]);
    assert.equal(scale.length, 4);
    // the largest sum (South, 12) is the scale's end colour, the smallest (West, 4) its start
    const ruleOf = (cls) => new RegExp(`\\.${cls}\\{--pk-cell-bg:(#[0-9a-f]{6})\\}`).exec(r.text)?.[1];
    assert.equal(ruleOf(scale.find(([v]) => v === "12")[1]), "#00ff00");
    assert.equal(ruleOf(scale.find(([v]) => v === "4")[1]), "#ff0000");
    const bars = [...r.text.matchAll(/\.(pk-c\d+)\{--pk-bar:([\d.]+)%;--pk-bar-color:#123456\}/g)];
    assert.equal(bars.length, 4);
    assert.ok(bars.some((b) => b[2] === "100"));
    // cells of the same bar share one rule: 40 rows of four bar lengths write four rules, not forty
    const many = Array.from({ length: 40 }, (_, i) => ({ Id: `r${i}`, Units: (i % 4) + 1 }));
    const shared = await render({ rows: ["Id"], values: [{ field: "Units", agg: "sum", conditional: { type: "dataBar" } }] }, many, { format: "html", ...FIXED });
    assert.equal((shared.text.match(/class="[^"]*pk-has-bar/g) ?? []).length, 40);
    assert.equal((shared.text.match(/\.pk-c\d+\{--pk-bar:/g) ?? []).length, 4);
    // a colour scale of the theme and one of the view's own colours share their rules the same way
    for (const conditional of [{ type: "colorScale" }, { type: "colorScale", colors: ["#ff0000", "#00ff00"] }]) {
        const scaled = await render({ rows: ["Id"], values: [{ field: "Units", agg: "sum", conditional }] }, many, { format: "html", ...FIXED });
        assert.equal((scaled.text.match(/class="[^"]*pk-has-scale/g) ?? []).length, 40);
        assert.equal((scaled.text.match(/\.pk-c\d+\{--pk-cell-bg:/g) ?? []).length, 4, JSON.stringify(conditional));
    }
});

// #212: a scale or bars without colours of the view's own take the host's tokens, as the report on
// screen does: the HTML table and the workbook alike; without tokens the light theme's heat colours
test("conditional colours without the view's own: the host's tokens in the HTML table and the workbook", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale" } }, { field: "Price", agg: "sum", conditional: { type: "dataBar" } }] };
    const ends = (text) => {
        // a theme's scale also marks its half (pk-scale-lo, pk-scale-hi) for a dark screen (#370)
        const scale = [...text.matchAll(/class="pk-td pk-num pk-has-scale (?:pk-scale-(?:lo|hi) )?(pk-c\d+)">(\d+)</g)].map((m) => [m[2], m[1]]);
        // the light colour; a theme's scale also writes its colour for a dark screen after it (#370)
        const ruleOf = (cls) => new RegExp(`\\.${cls}\\{--pk-cell-bg:(#[0-9a-f]{6})[;}]`).exec(text)?.[1];
        return [ruleOf(scale.find(([v]) => v === "4")[1]), ruleOf(scale.find(([v]) => v === "12")[1])];
    };
    const workbook = async (options) => {
        const r = await render(view, SALES, { format: "xlsx", ...FIXED, ...options });
        const sheet = strFromU8(unzipSync(r.body)["xl/worksheets/sheet1.xml"]);
        return { scale: /<colorScale>(.*?)<\/colorScale>/.exec(sheet)[1], bar: /<dataBar>.*?<color rgb="FF([0-9A-F]{6})"/.exec(sheet)[1] };
    };
    // no tokens: light blue (low) to blue (high), never Excel's red for the lowest value
    assert.deepEqual(ends((await render(view, SALES, { format: "html", ...FIXED })).text), ["#eaf1fb", "#2a78d6"]);
    // the heat tokens of a host's theme, or the scale's own over them
    const heat = { "--pk-heat-low": "#fff5e6", "--pk-heat-high": "#b34700", "--pk-chart-1": "#6b2fa0" };
    assert.deepEqual(ends((await render(view, SALES, { format: "html", ...FIXED, tokens: heat })).text), ["#fff5e6", "#b34700"]);
    assert.deepEqual(ends((await render(view, SALES, { format: "html", ...FIXED, tokens: { ...heat, "--pk-scale-low": "#0000ff" } })).text), ["#0000ff", "#b34700"]);
    assert.match((await render(view, SALES, { format: "html", ...FIXED, tokens: heat })).text, /--pk-bar-color:#6b2fa0/);
    const book = await workbook({ tokens: heat });
    assert.equal(book.scale, '<cfvo type="min"/><cfvo type="max"/><color rgb="FFFFF5E6"/><color rgb="FFB34700"/>');
    assert.equal(book.bar, "6B2FA0");
    // a token that is no plain colour keeps the default
    assert.deepEqual(ends((await render(view, SALES, { format: "html", ...FIXED, tokens: { "--pk-heat-low": "oklch(0.9 0.02 250)" } })).text), ["#eaf1fb", "#2a78d6"]);
});

test("a cyclic date grouping (weekday) keeps the week's order, and a one-letter field works", async () => {
    const view = { rows: ["Day"], derived: [{ name: "Day", field: "Date", by: "weekday" }], values: [{ field: "Q", agg: "sum" }] };
    const cells = bodyCells((await render(view, SALES, { format: "html", ...FIXED })).text);
    // the dates fall on Tuesday to Sunday: in the week's order, not the alphabet's
    assert.deepEqual(cells.map((c) => c[0]), ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Grand Total"]);
    assert.equal(cells.at(-1)[1], "15");
});

test("a view file: its name is the title, its description is shown; a view's own title is the fallback", async () => {
    const file = { format: "pivotkit-view", formatVersion: 2, name: "Units by region", description: "Monthly check", view: BY_REGION };
    const r = await render(file, SALES, { format: "html", ...FIXED });
    assert.match(r.text, /<title>Units by region<\/title>/);
    assert.match(r.text, /<h1>Units by region<\/h1>\n<p class="pk-report-description">Monthly check<\/p>/);
    const titled = await render({ ...BY_REGION, chart: { title: "Chart title" } }, SALES, { format: "html", ...FIXED });
    assert.match(titled.text, /<h1>Chart title<\/h1>/);
    const plain = await render(BY_REGION, SALES, { format: "html", ...FIXED });
    assert.match(plain.text, /<h1>Report<\/h1>/);
});

test("the details: source, the rows the filters keep of the data's, the filters in words and the generated time from now", async () => {
    const view = { ...BY_REGION, filters: [{ field: "Region", type: "in", items: ["North", "South"] }] };
    const r = await render(view, SALES, { format: "html", source: "sales.csv", ...FIXED });
    assert.match(r.text, /<dl class="pk-report-details"><dt>Source<\/dt><dd>sales\.csv<\/dd><dt>Rows<\/dt><dd>6 of 8<\/dd><dt>Filters<\/dt><dd>Region is one of &quot;North&quot;, &quot;South&quot; \(blanks dropped\)<\/dd><dt>Generated<\/dt><dd>Nov 13, 2026, 10:00\s?AM<\/dd><\/dl>/);
});

test("a German report: German words around the table, the locale's numbers and CSV separator", async () => {
    const view = { rows: ["Region"], values: [{ field: "Price", agg: "average" }] };
    const html = await render(view, SALES, { format: "html", ...FIXED, locale: "de-DE" });
    assert.match(html.text, /<html lang="de-DE" dir="ltr">/);
    // the label names it, the value is the number ("Zeilen: 8 Zeilen" said it twice)
    assert.match(html.text, /<dt>Zeilen<\/dt><dd>8<\/dd>/);
    // the report's own words in German, as the report on a page shows them
    assert.match(html.text, /Durchschnitt von Price/);
    assert.match(html.text, /Gesamtergebnis/);
    assert.ok(bodyCells(html.text).some((c) => c[0] === "North" && c[1] === "14,00"));
    // the filters and the summary in German too, with the locale's numbers and German quotes
    const filtered = await render({ ...view, filters: [{ field: "Units", type: "compare", op: ">=", value: 1.5 }, { field: "Region", type: "in", items: ["North", "South"] }] }, SALES, { format: "html", ...FIXED, locale: "de-DE" });
    assert.match(filtered.text, /<dt>Filter<\/dt><dd>Units ist mindestens 1,5, ohne leere Werte; und Region ist einer der Werte „North“; „South“, ohne leere Werte<\/dd>/);
    // a list's items and two filters apart: "; " between items, "; und " between filters
    const lists = await render({ ...view, filters: [{ field: "Units", type: "in", items: [1, 2.5] }, { field: "Region", type: "in", items: ["North", "South"] }] }, SALES, { format: "html", ...FIXED, locale: "de-DE" });
    assert.match(lists.text, /<dd>Units ist einer der Werte 1; 2,5, ohne leere Werte; und Region ist einer der Werte „North“; „South“, ohne leere Werte<\/dd>/);
    // English as before: "; " between filters
    const english = await render({ ...view, filters: [{ field: "Units", type: "in", items: [1, 2.5] }, { field: "Region", type: "in", items: ["North", "South"] }] }, SALES, { format: "html", ...FIXED });
    assert.match(english.text, /<dd>Units is one of 1, 2\.5 \(blanks dropped\); Region is one of &quot;North&quot;, &quot;South&quot; \(blanks dropped\)<\/dd>/);
    assert.match(filtered.text, /<meta name="description" content="Durchschnitt von Price nach Region; Filter: Units ist mindestens 1,5, ohne leere Werte; und Region ist einer der Werte „North“; „South“, ohne leere Werte">/);
    const csv = await render(view, SALES, { format: "csv", ...FIXED, locale: "de-DE" });
    assert.ok(csv.text.includes("North;14\r\n"));
    const rtl = await render(view, SALES, { format: "html", ...FIXED, locale: "ar-EG" });
    assert.match(rtl.text, /dir="rtl"/);
});

test("a host's own labels and describeLabels: the table and the filters in the host's words, the numbers in the locale's", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Units", type: "compare", op: ">", value: 1.5 }] };
    // a German locale with English words: both follow the host, so the report does not mix languages
    const english = await render(view, SALES, { format: "html", ...FIXED, locale: "de-DE", labels: { grandTotal: "Total", valueName: "{agg} of {field}", aggregators: { sum: "Sum" } }, describeLabels: DESCRIBE_LABELS.en });
    assert.match(english.text, /Sum of Units/);
    assert.match(english.text, /<dt>Filter<\/dt><dd>Units is greater than 1,5 \(blanks dropped\)<\/dd>/);
    assert.match(english.text, /<meta name="description" content="sum of Units by Region where Units is greater than 1,5 \(blanks dropped\)">/);
    // without describeLabels the filters follow the locale, as before
    const german = await render(view, SALES, { format: "html", ...FIXED, locale: "de-DE", labels: { grandTotal: "Total" } });
    assert.match(german.text, /<dd>Units ist größer als 1,5, ohne leere Werte<\/dd>/);
    // a part of the words keeps the rest in the locale's language: English for an English report
    const part = await render(view, SALES, { format: "html", ...FIXED, describeLabels: { compare: { yes: "{field} exceeds {op}" }, ops: { ">": "{value}" } } });
    assert.match(part.text, /<dd>Units exceeds 1\.5 \(blanks dropped\)<\/dd>/);
    // and German for a German one: the report does not mix languages
    const germanPart = await render(view, SALES, { format: "html", ...FIXED, locale: "de-DE", describeLabels: { blanks: { exclude: "ohne Leere" } } });
    assert.match(germanPart.text, /<dd>Units ist größer als 1,5, ohne Leere<\/dd>/);
    await assert.rejects(render(view, SALES, { format: "html", ...FIXED, describeLabels: /** @type {any} */ ("de") }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION" && e.details.option === "describeLabels");
    // a word of the wrong kind or a key describeView does not know: refused before any work, not "(undefined)"
    for (const [words, message] of [[{ blanks: 5 }, /describeLabels\.blanks is a table of words, not a number/], [{ list: 5 }, /describeLabels\.list is a text/], [{ nope: "x" }, /describeLabels\.nope is not a word/], [{ lang: "!!" }, /describeLabels\.lang is a language/]]) {
        await assert.rejects(render(view, SALES, { format: "html", ...FIXED, describeLabels: /** @type {any} */ (words) }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION" && e.details.option === "describeLabels" && message.test(e.message), JSON.stringify(words));
    }
});

test("a bad view never throws: its issues come back; strict gives no body, else the normalized view renders", async () => {
    const view = { rows: ["Regoin"], values: [{ field: "Units", agg: "sum" }] };
    const lenient = await render(view, SALES, { format: "csv", ...FIXED });
    assert.equal(lenient.ok, false);
    assert.equal(lenient.issues[0].code, "unknownField");
    assert.equal(lenient.issues[0].params.suggestion, "Region");
    assert.ok(lenient.body.length > 0);
    const strict = await render(view, SALES, { format: "csv", strict: true, ...FIXED });
    assert.equal(strict.ok, false);
    assert.equal(strict.body, null);
    const notView = await render("not json", SALES, { format: "csv", strict: true });
    assert.deepEqual([notView.ok, notView.issues[0].code, notView.issues[0].severity], [false, "viewFile", "error"]);
});

test("strict renders a view whose dropped settings are only warnings, as it did before they were reported", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], sort: [{ field: "Region", order: "descending" }], totals: { grandTotalRow: "false" }, collapsed: [], chart: "bar" };
    const strict = await render(view, SALES, { format: "csv", strict: true, ...FIXED });
    assert.equal(strict.ok, true);
    assert.deepEqual(strict.issues.map((i) => [i.code, i.severity]), [["unknownSetting", "warning"], ["notSwitch", "warning"], ["notSection", "warning"], ["notSection", "warning"]]);
    assert.equal(strict.text, (await render({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }, SALES, { format: "csv", ...FIXED })).text);
});

test("a view from outside: outsideLimits apply unless the host says the view is its own (trusted)", async () => {
    const filters = Array.from({ length: 60 }, () => ({ field: "Region", type: "in", items: ["North", "South", "West"] }));
    const outside = await render({ rows: ["Region"], filters }, SALES, { format: "json" });
    assert.ok(outside.issues.some((i) => i.code === "tooMany"));
    const own = await render({ rows: ["Region"], filters }, SALES, { format: "json", trusted: true });
    assert.ok(!own.issues.some((i) => i.code === "tooMany"));
});

test("data: rows, columnar data and encoded data give the same report", async () => {
    const columnar = { columns: ["Region", "Units"], types: ["string", "number"], data: [SALES.map((r) => r.Region), SALES.map((r) => r.Units)] };
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
    const a = (await render(view, SALES, { format: "csv" })).text;
    assert.equal((await render(view, columnar, { format: "csv" })).text, a);
    assert.equal((await render(view, encode(SALES), { format: "csv" })).text, a);
    await assert.rejects(render(view, "rows", { format: "csv" }), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT");
});

test("options are checked: an unknown format, a chart size out of range, SVG without ECharts", async () => {
    const option = (o) => (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION" && e.details.option === o;
    await assert.rejects(render(BY_REGION, SALES, { format: "pdf" }), option("format"));
    await assert.rejects(render(BY_REGION, SALES, { format: "svg", echarts, size: { width: REPORT_LIMITS.chartWidth + 1 } }), option("size"));
    await assert.rejects(render(BY_REGION, SALES, { format: "svg" }), option("echarts"));
    await assert.rejects(render(BY_REGION, SALES, { format: "html", now: "yesterday" }), option("now"));
    // a misspelt option is refused with the closest name, not ignored
    await assert.rejects(render(BY_REGION, SALES, { fromat: "csv" }), (e) => option("fromat")(e) && /did you mean "format"\?/.test(e.message));
    // an option of a few values takes only those: "on" is not read as the default
    await assert.rejects(render(BY_REGION, SALES, { format: "html", chart: "on" }), option("chart"));
    await assert.rejects(render(BY_REGION, SALES, { format: "html", chartEmbed: "svg" }), option("chartEmbed"));
    await assert.rejects(render(BY_REGION, SALES, { format: "csv", bom: "no" }), option("bom"));
    // texts are texts and the table's cells a whole number of at least 1: not a TypeError deep inside, not an empty table
    for (const [key, wrong] of [["title", 5], ["description", {}], ["source", ["a"]], ["labels", "de"], ["texts", 1], ["tableCells", Number.NaN], ["tableCells", 0], ["tableCells", 10.5], ["tableCells", "100"]]) {
        await assert.rejects(render(BY_REGION, SALES, { format: "html", [key]: wrong, ...FIXED }), option(key), `${key} ${String(wrong)}`);
    }
    // null is "not given" and Infinity no limit, as before
    const given = await render(BY_REGION, SALES, { format: "html", title: null, description: null, source: null, labels: null, texts: null, tableCells: Infinity, ...FIXED });
    assert.equal(given.ok, true);
    // a view that holds itself is no view: an issue, never a TypeError
    const looped = /** @type {any} */ ({ rows: ["Region"] });
    looped.self = looped;
    const r = await render(looped, SALES, { format: "html", ...FIXED });
    assert.deepEqual([r.ok, r.issues[0].code], [false, "viewFile"]);
});

test("tokens and darkTokens of a wrong type are refused, not ignored", async () => {
    const option = (o) => (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION" && e.details.option === o;
    // a CSS text, a list, null or a number: a host's mistake that would give the default colours without a word
    for (const wrong of ["--pk-accent: #c00", [["--pk-accent", "#c00"]], null, 42]) {
        await assert.rejects(render(BY_REGION, SALES, { format: "html", tokens: /** @type {any} */ (wrong), ...FIXED }), option("tokens"), JSON.stringify(wrong));
        await assert.rejects(render(BY_REGION, SALES, { format: "html", darkTokens: /** @type {any} */ (wrong), ...FIXED }), option("darkTokens"), JSON.stringify(wrong));
    }
    // xlsx and csv read tokens too (a workbook's colour scale): the same check in every format
    await assert.rejects(render(BY_REGION, SALES, { format: "xlsx", tokens: /** @type {any} */ ("#c00"), ...FIXED }), option("tokens"));
    // in an object, a token that cannot be used is left out on its own, as documented
    const kept = await render(BY_REGION, SALES, { format: "html", tokens: { "--pk-accent": "url(x)", "--pk-chart-1": "#c00000" }, darkTokens: {}, ...FIXED });
    assert.equal(kept.ok, true);
    assert.doesNotMatch(kept.text, /url\(x\)/);
    assert.match(kept.text, /--pk-chart-1:#c00000/);
});

test("CSV: a byte order mark by default, none with bom: false", async () => {
    const withBom = await render(BY_REGION, SALES, { format: "csv", ...FIXED });
    const without = await render(BY_REGION, SALES, { format: "csv", bom: false, ...FIXED });
    assert.deepEqual([...withBom.body.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(new TextDecoder().decode(without.body.slice(0, 6)), "Region");
    assert.deepEqual(without.body, withBom.body.slice(3));
});

test("a limit throws PivotkitError LIMIT_EXCEEDED before the work", async () => {
    await assert.rejects(render(BY_REGION, SALES, { format: "csv", limits: { rows: 5 } }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows");
    await assert.rejects(render(BY_REGION, SALES, { format: "csv", limits: { cells: 10 } }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "cells");
});

test("a table over tableCells is cut after the last whole row, says so in the report and as an issue", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ Item: `Item ${String(i).padStart(2, "0")}`, Units: i }));
    const r = await render({ rows: ["Item"], values: [{ field: "Units", agg: "sum" }] }, rows, { format: "html", tableCells: 20, ...FIXED });
    assert.equal(bodyCells(r.text).length, 9);
    assert.match(r.text, /<p class="pk-report-note">The table shows the first 9 of 51 rows\. Export it as Excel or CSV for all of them\.<\/p>/);
    assert.deepEqual(r.issues.map((i) => [i.code, i.severity]), [["tableCut", "warning"]]);
    assert.equal(r.summary.truncated, true);
    assert.equal(r.ok, true);
});

test("HTML with the chart: an image of the SVG when the view shows the chart, a warning without ECharts", async () => {
    const view = { ...BY_REGION, display: "chart" };
    const r = await render(view, SALES, { format: "html", echarts, ...FIXED });
    const src = /<img alt="Chart: Report" width="800" height="480" src="data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)">/.exec(r.text);
    assert.ok(src, "the chart as a data: image");
    const svg = new TextDecoder().decode(Uint8Array.from(atob(src[1]), (c) => c.charCodeAt(0)));
    assert.ok(svgTexts(svg).includes("North"));
    const inline = await render(view, SALES, { format: "html", echarts, chartEmbed: "inline", ...FIXED });
    assert.match(inline.text, /<figure class="pk-report-chart"><svg /);
    // the table and the chart side by side (#51): the report has both
    const both = await render({ ...BY_REGION, display: "both" }, SALES, { format: "html", echarts, chartEmbed: "inline", ...FIXED });
    assert.match(both.text, /<figure class="pk-report-chart"><svg /);
    assert.ok(both.text.includes("<table"));
    const table = await render(BY_REGION, SALES, { format: "html", echarts, ...FIXED });
    assert.ok(!table.text.includes("pk-report-chart\""), "a table view has no chart unless asked");
    assert.ok((await render(BY_REGION, SALES, { format: "html", echarts, chart: true, ...FIXED })).text.includes('<figure class="pk-report-chart">'));
    const without = await render(view, SALES, { format: "html", ...FIXED });
    assert.deepEqual(without.issues.map((i) => i.code), ["chartUnavailable"]);
    assert.ok(without.text.includes("<table"));
    // asked for by name, a chart without ECharts is a wrong option, not a warning
    await assert.rejects(render(view, SALES, { format: "html", chart: true, ...FIXED }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION" && e.details.option === "echarts");
});

test("HTML chart synchronization (#988): light and dark chart variants follow light/dark tokens and [light, dark] colorMap", async () => {
    const decodeImg = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const both = await render({ ...BY_REGION, display: "both" }, SALES, { format: "html", echarts, colorMap: { "Sum of Units": ["#114488", "#66aaff"] }, ...FIXED });
    const imgs = [...both.text.matchAll(/<img [^>]*src="data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)">/g)];
    assert.equal(imgs.length, 2, "light and dark chart images");
    assert.ok(!/class="pk-chart-dark"/.test(imgs[0][0]));
    assert.match(imgs[1][0], /class="pk-chart-dark"/);
    const lightSvg = decodeImg(imgs[0][1]);
    const darkSvg = decodeImg(imgs[1][1]);
    assert.ok(lightSvg.includes(`fill="${LIGHT_TOKENS["--pk-surface"]}"`) && lightSvg.includes('fill="#114488"'));
    assert.ok(darkSvg.includes(`fill="${DARK_TOKENS["--pk-surface"]}"`) && darkSvg.includes('fill="#66aaff"'));
    // darkTokens reach the dark inline chart while light tokens remain on the light SVG
    const custom = await render({ ...BY_REGION, display: "both" }, SALES, {
        format: "html",
        echarts,
        chartEmbed: "inline",
        tokens: { "--pk-surface": "#fafafa", "--pk-chart-1": "#c00000" },
        darkTokens: { "--pk-surface": "#101418", "--pk-chart-1": "#ff7a7a" },
        ...FIXED
    });
    const svgs = custom.text.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
    assert.equal(svgs.length, 2);
    assert.ok(!svgs[0].includes('class="pk-chart-dark"') && svgs[0].includes('fill="#fafafa"') && svgs[0].includes('fill="#c00000"'));
    assert.ok(svgs[1].includes('class="pk-chart-dark"') && svgs[1].includes('fill="#101418"') && svgs[1].includes('fill="#ff7a7a"'));
});

test("an Excel workbook of a view that shows the chart holds the table and says the chart is not in it (#360)", async () => {
    const view = { ...BY_REGION, display: "chart", chart: { type: "line" } };
    const r = await render(view, SALES, { format: "xlsx", ...FIXED });
    assert.deepEqual(r.issues.map((i) => [i.code, i.severity]), [["chartNotInXlsx", "warning"]]);
    assert.match(r.issues[0].message, /html or svg/);
    assert.equal(r.ok, true);
    // the workbook is the table, without a drawing
    const parts = Object.keys(unzipSync(r.body));
    assert.ok(parts.includes("xl/worksheets/sheet1.xml"));
    assert.ok(!parts.some((p) => p.startsWith("xl/charts/") || p.startsWith("xl/drawings/")), parts.join(", "));
    // a table view, and the other formats of a chart view, have no such warning
    assert.deepEqual((await render(BY_REGION, SALES, { format: "xlsx", ...FIXED })).issues, []);
    for (const format of ["csv", "json", "svg", "html"]) {
        assert.ok(!(await render(view, SALES, { format, echarts, ...FIXED })).issues.some((i) => i.code === "chartNotInXlsx"), format);
    }
});

test("a chart over REPORT_LIMITS.categories categories draws the first ones and says so", async () => {
    const rows = Array.from({ length: 70 }, (_, i) => ({ Item: `I${String(i).padStart(2, "0")}`, Units: i }));
    const r = await render({ rows: ["Item"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", axisLabels: "all" } }, rows, { format: "svg", echarts, ...FIXED });
    const labels = svgTexts(r.text).filter((t) => /^I\d\d$/.test(t));
    assert.equal(labels.length, REPORT_LIMITS.categories);
    assert.ok(!labels.includes("I50"));
    assert.deepEqual(r.issues.map((i) => i.code), ["chartCut"]);
    assert.equal(r.summary.truncated, true);
});

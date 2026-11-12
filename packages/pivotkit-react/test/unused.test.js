// A view's unused parts in plain words (unused-texts.js): a text for every issue code of
// pivotkit-core in every language, the line each issue of normalize() becomes, and the loader; which
// lines still apply once the view is changed by hand (unused-keep.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, fieldLabel, normalize, VIEW_ISSUE_CODES } from "pivotkit-core";
import { ISSUE_CASES, issuesOf } from "../../pivotkit-core/test/issue-cases.js";
import { SALES } from "../../pivotkit-core/test/fixtures.js";
import { fill, LABELS, resolveLabels } from "../src/labels.js";
import { valueLabel } from "../src/names.js";
import { de } from "../src/unused-texts-de.js";
import { en, unusedItem, unusedItems } from "../src/unused-texts.js";
import { UNUSED_TEXTS_OF, loadUnused, unusedNow, unusedTexts } from "../src/unused-load.js";
import { partOf, stillApplies } from "../src/unused-keep.js";

const data = encode(SALES);
const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
/** The line of an issue as one text. */
/** What unused.jsx gives a line of the report's: its labels, fill and the names of fields and values. */
const ctxOf = (labels) => ({ labels, fill, field: (name) => fieldLabel(name, labels.core), value: (spec) => valueLabel(spec, labels) });
/** An issue's parts in the texts of `lang` (null: English) with the host's texts of `labels`. */
const item = (issue, raw, labels, lang = null) => unusedItem(issue, raw, unusedTexts({ mod: { en }, lang }, labels), ctxOf(labels));
const line = (issue, raw, labels, lang = null) => {
    const { pre, subject, post } = item(issue, raw, labels, lang);
    return `${pre}${subject}${post}`;
};

test("every issue code of pivotkit-core has a text in English and German, and German has every English text", () => {
    for (const code of VIEW_ISSUE_CODES) {
        assert.equal(typeof en.codes[code], "string", `en ${code}`);
        assert.equal(typeof de.codes[code], "string", `de ${code}`);
    }
    assert.deepEqual(keys(de), keys(en));
});

test("every language of LABELS besides English has its loader, with every key of the English texts", async () => {
    const others = Object.keys(LABELS).filter((lang) => lang !== "en");
    assert.deepEqual(Object.keys(UNUSED_TEXTS_OF).sort(), others.sort());
    for (const lang of others) {
        assert.deepEqual(keys(await UNUSED_TEXTS_OF[lang]()), keys(en), lang);
    }
});

test("each code's case becomes a line with its subject and no placeholder left, in English and German", () => {
    for (const code of VIEW_ISSUE_CODES) {
        const raw = ISSUE_CASES[code];
        for (const [labels, lang] of [[LABELS.en, null], [LABELS.de, de]]) {
            for (const issue of issuesOf(code, data)) {
                const { subject, post } = item(issue, raw, labels, lang);
                assert.ok(subject.length > 0, `${code} ${labels.lang}`);
                assert.ok(!/\{\w+\}/.test(post), `${code} ${labels.lang}: ${post}`);
                // what the report does instead: every text says it after a dash
                assert.match(post, / - /, `${code} ${labels.lang}`);
            }
        }
    }
});

test("an issue's line names the value, the field or the part of the view it is about", () => {
    const raw = {
        rows: ["Region", "Planet"],
        values: [{ field: "Units", agg: "sum", label: "Quakes", conditional: { type: "colorScale", colors: ["red"] } }, { field: "Region", agg: "sum" }],
        filters: [{ field: "Rep", type: "label", op: "contains" }],
        sort: [{ field: "Region", by: "value", value: { field: "Moons", agg: "sum" } }],
        chart: { legend: "left" }
    };
    const { issues } = normalize(raw, data);
    const lines = issues.map((i) => line(i, raw, LABELS.en));
    assert.deepEqual(lines, [
        "Planet: the data has no field of this name - it is left out of Rows",
        "Quakes: the colour scale needs two or three colours - the default colours are used",
        "Sum of Region: Sum does not work on “Region” (Text) - this value is left out",
        "Rep: the text condition has no text - this filter is left out",
        "Region: the data has no field “Moons” - the usual order is used",
        "Chart: the legend position “left” is unknown - the default is used"
    ]);
    assert.equal(line(issues[1], raw, LABELS.de, de), "Quakes: die Farbskala braucht zwei oder drei Farben - die Standardfarben werden verwendet");
    assert.equal(line(issues[0], raw, LABELS.de, de), "Planet: die Daten haben kein Feld mit diesem Namen - es wird in Zeilen weggelassen");
});

test("a host's field labels name the fields; a host's texts and an unknown code have their line", () => {
    // the report puts the host's field labels (fieldDefaults) into labels.core.fields
    const host = resolveLabels("en", { unused: { codes: { placedTwice: "twice - once is enough" } } });
    const labels = { ...host, core: { ...host.core, fields: { Region: "Sales region" } } };
    const raw = { rows: ["Region"], cols: ["region"] };
    const [issue] = normalize(raw, data).issues;
    assert.equal(line(issue, raw, labels), "Sales region: twice - once is enough");
    // a code of a newer pivotkit-core, a view without that part: the general text, the part's name
    assert.equal(line({ path: "chart.depth", message: "unknown depth", code: "newThing" }, {}, LABELS.en), "Chart: this part could not be used - it is left out");
    // a pivotkit-core without codes (0.1.0): the core's own message
    assert.equal(line({ path: "rows[0]", message: 'unknown field "Planet"' }, { rows: ["Planet"] }, LABELS.en), 'Planet: unknown field "Planet"');
    assert.equal(line({ path: "label", message: "unknown key", code: "unknownKey" }, {}, LABELS.en), "“label”: this setting is unknown here - it is ignored");
    assert.equal(line({ path: "label", message: "unknown key", code: "unknownKey" }, {}, LABELS.de, de), "„label“: diese Einstellung ist hier unbekannt - sie wird ignoriert");
});

test("a name with a placeholder in it stays a name", () => {
    const raw = { rows: ["{subject} and {text}"] };
    const [issue] = normalize(raw, data).issues;
    const { pre, subject, post } = item(issue, raw, LABELS.en);
    assert.deepEqual([pre, subject, post], ["", "{subject} and {text}", ": the data has no field of this name - it is left out of Rows"]);
    const named = { values: [{ field: "Units", agg: "sum", label: "{subject}", format: "{text}" }] };
    assert.equal(line(normalize(named, data).issues[0], named, LABELS.en), "{subject}: the number format “{text}” is unknown - the usual format is used");
});

test("two lines about different entries with the same name say which one; two about one entry do not", () => {
    const raw = { values: [{ field: "Units", agg: "sum", format: "money" }, { field: "Units", agg: "sum", conditional: { type: "dataBar", color: "blue" } }], sort: [{ field: "Planet" }, { field: "Planet" }] };
    const notes = normalize(raw, data).issues.map((issue) => ({ issue, raw }));
    const subjects = (labels, lang) => unusedItems(notes, unusedTexts({ mod: { en }, lang }, labels), ctxOf(labels)).map((i) => i.subject);
    assert.deepEqual(subjects(LABELS.en, null), ["Sum of Units (no. 1 in Values)", "Sum of Units (no. 2 in Values)", "Planet (no. 1 in Sorting)", "Planet (no. 2 in Sorting)"]);
    assert.deepEqual(subjects(LABELS.de, de)[1], "Summe von Units (Nr. 2, Werte)");
    const one = { values: [{ field: "Units", agg: "sum", format: "money", label: 7 }] };
    const both = normalize(one, data).issues.map((issue) => ({ issue, raw: one }));
    assert.deepEqual(unusedItems(both, unusedTexts({ mod: { en }, lang: null }, LABELS.en), ctxOf(LABELS.en)).map((i) => i.subject), ["Sum of Units", "Sum of Units"]);
});

test("the loader gives the language's texts with the English module, once per language", async () => {
    assert.equal(unusedNow("de"), null);
    const first = await loadUnused("de");
    assert.equal(first.lang, de);
    assert.equal(typeof first.mod.unusedItem, "function");
    assert.equal(unusedNow("de"), first);
    assert.equal(await loadUnused("de"), first);
    // a language without texts of its own: English alone
    assert.equal((await loadUnused("fr")).lang, null);
});

test("a line of the warning goes once the part of the view it names is changed by hand, and comes back with Undo (#82)", () => {
    const raw = {
        rows: ["Region", "Nope"],
        values: [{ field: "Bogus", agg: "sum" }, { field: "Units", agg: "sum", conditional: { type: "colorScale", colors: ["red"] } }],
        chart: { legend: "left" }
    };
    const { view: loaded, issues } = normalize(raw, data);
    const note = (path) => ({ issue: issues.find((i) => i.path.startsWith(path)), raw });
    const scale = note("values[1].conditional");
    const legend = note("chart.legend");
    const field = note("rows[1]");
    assert.ok(scale.issue && legend.issue && field.issue, JSON.stringify(issues.map((i) => i.path)));
    // the value is found by its field and aggregator: the first value was dropped, it is values[0] now
    assert.equal(partOf("values[1].conditional.colors", raw, loaded), JSON.stringify(loaded.values[0]));
    const same = JSON.parse(JSON.stringify(loaded));
    for (const n of [scale, legend, field]) {
        assert.equal(stillApplies(n, loaded, same), true);
    }
    // a change elsewhere (rows and columns swapped) keeps the value's and the chart's lines
    const swapped = { ...same, rows: [], cols: same.rows };
    assert.equal(stillApplies(scale, loaded, swapped), true);
    assert.equal(stillApplies(legend, loaded, swapped), true);
    assert.equal(stillApplies(field, loaded, swapped), false, "Rows changed");
    // the value removed, or its colour scale set by hand: its line goes; the legend's stays
    const removed = { ...same, values: [] };
    assert.equal(stillApplies(scale, loaded, removed), false);
    assert.equal(stillApplies(legend, loaded, removed), true);
    const scaled = { ...same, values: [{ ...same.values[0], conditional: { type: "colorScale", colors: ["#ff0000", "#00ff00"] } }] };
    assert.equal(stillApplies(scale, loaded, scaled), false);
    // a legend of the user's choice: the legend's line goes
    assert.equal(stillApplies(legend, loaded, { ...same, chart: { ...same.chart, legend: "bottom" } }), false);
    // a line in words names its zone, or nothing; without a view loaded every line stays
    assert.equal(stillApplies({ text: "trimmed", path: "values" }, loaded, removed), false);
    assert.equal(stillApplies({ text: "trimmed" }, loaded, removed), true);
    assert.equal(stillApplies(scale, null, removed), true);
    // a view that could not be read at all: the line stays while the view is the one shown then
    assert.equal(partOf("", "x", same), JSON.stringify(same));
});

test("a key inside a section is named by itself, and an item in another case names the data's item", () => {
    const raw = { rows: ["Region"], values: [{ field: "Units", agg: "sum", lable: "x" }], filters: [{ field: "Region", type: "include", items: ["north"] }] };
    const issues = normalize(raw, data).issues;
    const lines = issues.map((issue) => line(issue, raw, LABELS.en));
    assert.deepEqual(lines, [
        "“lable”: this setting is unknown here - it is ignored",
        "Region: the data has no item “north”, but “North” - the filter keeps the item as written"
    ]);
});

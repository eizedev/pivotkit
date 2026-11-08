// A view's unused parts in plain words (unused-texts.js): a text for every issue code of
// pivotkit-core in every language, the line each issue of normalize() becomes, and the loader.
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

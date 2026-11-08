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
import { en, unusedItem } from "../src/unused-texts.js";
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
    assert.equal(line({ path: "", message: "x" }, null, LABELS.en), "The view: this part could not be used - it is left out");
    assert.equal(line({ path: "label", message: "unknown key", code: "unknownKey" }, {}, LABELS.en), "“label”: this setting is unknown here - it is ignored");
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

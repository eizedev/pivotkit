// The report's own words per language (REPORT_LABELS): pivotkit-react's report shows them, and
// pivotkit-report (the CLI) writes them for the locale's language unless labels are given.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LABELS, REPORT_LABELS, ROW_COUNT_TEXTS, computePivot, encode, pluralForm, reportLabels, toGrid } from "../src/index.js";

test("reportLabels: German for a German locale, English for any other", () => {
    assert.equal(reportLabels("de-DE"), REPORT_LABELS.de);
    assert.equal(reportLabels("de"), REPORT_LABELS.de);
    assert.equal(reportLabels("fr-FR"), REPORT_LABELS.en);
    assert.equal(reportLabels(undefined), REPORT_LABELS.en);
    assert.equal(REPORT_LABELS.de.grandTotal, "Gesamtergebnis");
    // frozen to the last table: a report shares them
    for (const lang of ["en", "de"]) {
        assert.ok(Object.isFrozen(REPORT_LABELS[lang]) && Object.isFrozen(REPORT_LABELS[lang].aggregators) && Object.isFrozen(REPORT_LABELS[lang].showAs), lang);
    }
    // every text of DEFAULT_LABELS has its word in each language
    for (const lang of ["en", "de"]) {
        for (const key of Object.keys(DEFAULT_LABELS)) assert.ok(key in REPORT_LABELS[lang], `${lang}.${key}`);
        for (const key of Object.keys(DEFAULT_LABELS.aggregators)) assert.equal(typeof REPORT_LABELS[lang].aggregators[key], "string", `${lang}.aggregators.${key}`);
        for (const key of Object.keys(DEFAULT_LABELS.showAs)) assert.equal(typeof REPORT_LABELS[lang].showAs[key], "string", `${lang}.showAs.${key}`);
    }
});

test("toGrid with the German report labels: German totals and value names", () => {
    const result = computePivot(encode([{ R: "a", U: 1 }, { R: "b", U: 2 }]), { rows: ["R"], values: [{ field: "U", agg: "sum" }] }, { locale: "de-DE" });
    const grid = toGrid(result, { labels: reportLabels("de-DE") });
    const texts = grid.rows.flat().filter(Boolean).map((c) => c.text);
    assert.ok(texts.includes("Summe von U"));
    assert.ok(texts.includes("Gesamtergebnis"));
});

test("pluralForm: the language's form, English rules for a language Intl has none for, never the runtime's; no forms give nothing", () => {
    const rows = ROW_COUNT_TEXTS.en.rowsCount;
    assert.equal(pluralForm(rows, 1, "en"), "{count} row");
    assert.equal(pluralForm(rows, 2, "en"), "{count} rows");
    assert.equal(pluralForm(ROW_COUNT_TEXTS.de.rowsCount, 1, "de"), "{count} Zeile");
    // French counts 0 as "one"; a form it lacks falls back to "other"
    assert.equal(pluralForm({ one: "un", other: "plusieurs" }, 0, "fr"), "un");
    assert.equal(pluralForm({ other: "{count} things" }, 1, "en"), "{count} things");
    // "xx" is a well-formed tag Intl has no rules for: English rules, so 1 is "one" and 0 is "other"
    assert.equal(pluralForm({ one: "one", other: "other" }, 1, "xx"), "one");
    assert.equal(pluralForm({ one: "one", other: "other" }, 0, "xx"), "other");
    // a tag Intl does not take: "other"
    assert.equal(pluralForm({ one: "one", other: "other" }, 1, "not a tag"), "other");
    // no forms, or forms without texts
    assert.equal(pluralForm(null, 1, "en"), "");
    assert.equal(pluralForm(undefined, 1, "en"), "");
    assert.equal(pluralForm(/** @type {any} */ ({ one: 1, other: 2 }), 1, "en"), "");
});

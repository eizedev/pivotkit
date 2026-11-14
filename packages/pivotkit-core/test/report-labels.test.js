// The report's own words per language (REPORT_LABELS): pivotkit-react's report shows them, and
// pivotkit-report (the CLI) writes them for the locale's language unless labels are given.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LABELS, REPORT_LABELS, computePivot, encode, reportLabels, toGrid } from "../src/index.js";

test("reportLabels: German for a German locale, English for any other", () => {
    assert.equal(reportLabels("de-DE"), REPORT_LABELS.de);
    assert.equal(reportLabels("de"), REPORT_LABELS.de);
    assert.equal(reportLabels("fr-FR"), REPORT_LABELS.en);
    assert.equal(reportLabels(undefined), REPORT_LABELS.en);
    assert.equal(REPORT_LABELS.de.grandTotal, "Gesamtergebnis");
    // every text of DEFAULT_LABELS has its word in each language
    for (const lang of ["en", "de"]) {
        for (const key of Object.keys(DEFAULT_LABELS)) assert.ok(key in REPORT_LABELS[lang], `${lang}.${key}`);
        for (const key of Object.keys(DEFAULT_LABELS.aggregators)) assert.equal(typeof REPORT_LABELS[lang].aggregators[key], "string", `${lang}.aggregators.${key}`);
    }
});

test("toGrid with the German report labels: German totals and value names", () => {
    const result = computePivot(encode([{ R: "a", U: 1 }, { R: "b", U: 2 }]), { rows: ["R"], values: [{ field: "U", agg: "sum" }] }, { locale: "de-DE" });
    const grid = toGrid(result, { labels: reportLabels("de-DE") });
    const texts = grid.rows.flat().filter(Boolean).map((c) => c.text);
    assert.ok(texts.includes("Summe von U"));
    assert.ok(texts.includes("Gesamtergebnis"));
});

// The chart's text alternative (chart-summary.js): type, values, counts and extremes, the reference
// lines and each series' high and low points, in English and German.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toSeries } from "pivotkit-core";
import { extremePoints, referenceLines } from "pivotkit-core/chart";
import { chartSummary } from "../../src/chart-summary.js";
import { linesSummary, pointsSummary } from "../../src/chart-tooltip.js";
import { LABELS } from "../../src/labels.js";
// the German first-load texts: pivotkit-react adds them as it loads (deferred.js)
import "../../src/deferred.js";
import { MONTH, MONTHLY, linePivot } from "./fixtures.js";

const en = LABELS.en;

test("the chart's text alternative names type, values, counts and extremes", () => {
    const rows = [{ R: "North", P: "A", V: 5 }, { R: "South", P: "A", V: 9 }, { R: "South", P: "B", V: 1 }];
    const r = computePivot(encode(rows), { rows: ["R"], cols: ["P"], values: [{ field: "V", agg: "sum" }] });
    const s = toSeries(r);
    const text = chartSummary(s, { type: "bar", rows: ["R"], valueNames: ["Sum of V"], labels: en, locale: "en-US" });
    assert.equal(text, "Bars: Sum of V by R. 2 categories, 2 series. Highest 9 at South / A; lowest 1 at South / B. Switch to Table to read every value.");
    const de = chartSummary(s, { type: "line", rows: ["R"], valueNames: ["Summe von V"], labels: LABELS.de, locale: "de-DE" });
    assert.match(de, /^Linien: Summe von V nach R\. 2 Kategorien, 2 Reihen\./);
});

test("the chart's text alternative names the reference lines with their values", () => {
    const r = linePivot({ type: "line", referenceLines: { average: true, trend: true, target: 35 } });
    const s = toSeries(r);
    const linesText = linesSummary(referenceLines(r, { series: s }), s.series.map((x) => x.name), en);
    const text = chartSummary(s, { type: "line", rows: ["Month"], valueNames: ["Sum of Revenue"], labels: en, locale: "en-US", linesText });
    assert.match(text, /Reference lines: Average \(A\) 25; Average \(B\) 5; Trend \(A\) from 10 to 40; Trend \(B\) from 5\.6 to 4\.4; Target 35\. Switch to Table/);
    const de = linePivot({ type: "line", referenceLines: { average: true, trend: false, target: 35 } }, "de-DE");
    const deLines = linesSummary(referenceLines(de, { words: LABELS.de.core.referenceLines }), ["A", "B"], LABELS.de);
    const deText = chartSummary(toSeries(de), { type: "line", rows: ["Monat"], valueNames: ["Summe von Revenue"], labels: LABELS.de, locale: "de-DE", linesText: deLines });
    assert.match(deText, /Bezugslinien: Durchschnitt \(A\) 25; Durchschnitt \(B\) 5; Ziel 35\./);
    // no lines: no sentence, the text stays as it was
    assert.equal(linesSummary([], ["A"], en), "");
    assert.doesNotMatch(chartSummary(s, { type: "line", rows: ["Month"], valueNames: ["Sum of Revenue"], labels: en, locale: "en-US" }), /Reference/);
});

test("the chart's text alternative names each series' high and low points (#574)", () => {
    const ON = { average: false, trend: false, target: null, extremes: true };
    const r = linePivot({ type: "line", referenceLines: ON });
    const s = toSeries(r);
    assert.equal(pointsSummary(extremePoints(r, { series: s }), s, en), "Highest 40 at Apr 2026 / A; lowest 10 at Jan 2026 / A. Highest 7 at Mar 2026 / B; lowest 3 at Apr 2026 / B.");
    // a stack: its total's
    const stack = linePivot({ type: "bar", stacked: true, referenceLines: ON });
    const ss = toSeries(stack);
    assert.equal(pointsSummary(extremePoints(stack, { series: ss }), ss, en), "Highest 43 at Apr 2026 / Total; lowest 15 at Jan 2026 / Total.");
    // German words from the labels
    const de = linePivot({ type: "line", referenceLines: ON }, "de-DE");
    const ds = toSeries(de);
    assert.match(pointsSummary(extremePoints(de, { series: ds }), ds, LABELS.de), /^Höchster Wert 40 bei .* \/ A; niedrigster 10 bei .* \/ A\./);
    // one series: the summary's own highest and lowest already say it
    const one = computePivot(encode(MONTHLY), { derived: [MONTH], rows: ["Month"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", referenceLines: ON } });
    const os = toSeries(one);
    assert.equal(pointsSummary(extremePoints(one, { series: os }), os, en), "");
    assert.equal(pointsSummary([], s, en), "");
});

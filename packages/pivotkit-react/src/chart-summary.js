/*
 * What a chart shows, in words: the text alternative of the chart canvas for screen readers. A pure
 * function of pivotkit-core's chart series, tested without a DOM. (When a chart is hard to read, a
 * tip says so: tips.js.)
 */

import { formatter } from "pivotkit-core";
import { fill, plural } from "./labels.js";

/**
 * A host's chartCounts written the way it was before the plural forms, with the nouns after the
 * placeholders ("{categories} Kategorien, {series} Reihen."): its placeholders take the bare numbers.
 */
const OLD_COUNTS = /\{(categories|series)\}\s*\p{L}/u;

/** "4 categories, 1 series." in the labels' language and plural forms. */
function counts(s, labels, locale) {
    const categories = s.categoryCount ?? s.categories.length;
    const series = s.series.length;
    if (OLD_COUNTS.test(labels.chartCounts)) {
        return fill(labels.chartCounts, { categories: categories.toLocaleString(locale), series: series.toLocaleString(locale) });
    }
    return fill(labels.chartCounts, {
        categories: plural(labels.chartCategories, categories, { lang: labels.lang, locale }),
        series: plural(labels.chartSeries, series, { lang: labels.lang, locale })
    });
}

/**
 * "Bars: Sum of Revenue by Region. 4 categories, 3 series. Highest 1,234 at North / A; lowest ..."
 * @param {ReturnType<typeof import("pivotkit-core").toSeries>} s
 * @param {{ type: string, rows: string[], valueNames: string[], labels: import("./labels.js").UiLabels, locale: string }} options
 */
export function chartSummary(s, { type, rows, valueNames, labels, locale }) {
    const parts = [
        fill(labels.chartSummary, { type: labels.chartTypes[type] ?? type, values: valueNames.join(", "), categories: rows.length ? rows.join(" / ") : labels.categories }),
        counts(s, labels, locale)
    ];
    /** @type {{ v: number, si: number, ci: number } | null} */
    let max = null;
    /** @type {{ v: number, si: number, ci: number } | null} */
    let min = null;
    s.series.forEach((series, si) => {
        series.data.forEach((v, ci) => {
            if (typeof v !== "number") {
                return;
            }
            if (!max || v > max.v) {
                max = { v, si, ci };
            }
            if (!min || v < min.v) {
                min = { v, si, ci };
            }
        });
    });
    if (max && min) {
        const where = (p) => (s.series.length > 1 && s.series[p.si].name ? `${s.categories[p.ci]} / ${s.series[p.si].name}` : s.categories[p.ci]);
        const text = (p) => formatter(s.series[p.si].format, { locale })(p.v);
        parts.push(fill(labels.chartExtremes, { max: text(max), maxAt: where(max), min: text(min), minAt: where(min) }));
    }
    parts.push(labels.chartTableHint);
    return parts.join(" ");
}

/*
 * What a chart shows, in words: the text alternative of the chart canvas for screen readers, and the
 * hints the chart shows when it is hard to read (too many series, dates on the wrong axis, too many
 * categories). Pure functions of pivotkit-core's chart series, tested without a DOM.
 */

import { formatter } from "pivotkit-core";
import { CHART_TYPES, MANY_SERIES } from "./chart-types.js";
import { fill } from "./labels.js";

/**
 * "Bars: Sum of Revenue by Region. 4 categories, 3 series. Highest 1,234 at North / A; lowest ..."
 * @param {ReturnType<typeof import("pivotkit-core").toSeries>} s
 * @param {{ type: string, rows: string[], valueNames: string[], labels: import("./labels.js").UiLabels, locale: string }} options
 */
export function chartSummary(s, { type, rows, valueNames, labels, locale }) {
    const parts = [
        fill(labels.chartSummary, { type: labels.chartTypes[type] ?? type, values: valueNames.join(", "), categories: rows.length ? rows.join(" / ") : labels.categories }),
        fill(labels.chartCounts, { categories: (s.categoryCount ?? s.categories.length).toLocaleString(locale), series: s.series.length.toLocaleString(locale) })
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

/**
 * The hints a chart needs, in the order they are shown: each with its text and whether swapping rows
 * and columns helps.
 * @param {ReturnType<typeof import("pivotkit-core").toSeries>} s
 * @param {{ type: string, datesOnColumnsOnly: boolean, labels: import("./labels.js").UiLabels, locale: string }} options
 * @returns {Array<{ id: string, text: string, swap: boolean }>}
 */
export function chartHints(s, { type, datesOnColumnsOnly, labels, locale }) {
    const out = [];
    const entry = CHART_TYPES[type];
    if (entry && entry.axis && (type === "line" || type === "area") && datesOnColumnsOnly) {
        out.push({ id: "dates", text: labels.chartDatesOnColumns, swap: true });
    } else if (entry && entry.axis && s.series.length > MANY_SERIES) {
        out.push({ id: "series", text: fill(labels.chartManySeries, { count: s.series.length.toLocaleString(locale) }), swap: true });
    }
    if (s.categoryCount > s.categories.length) {
        out.push({ id: "capped", text: fill(labels.chartCapped, { shown: s.categories.length.toLocaleString(locale), total: s.categoryCount.toLocaleString(locale) }), swap: false });
    }
    return out;
}

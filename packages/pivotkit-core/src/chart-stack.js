/*
 * Bars and areas stacked to 100 % (`chart.stackPercent`) and the legend entries a view hides
 * (`chart.hidden`), for toEChartsOption (chart.js). Only a drawn chart needs this module.
 */

// whether a chart is drawn stacked to 100 %: chart-plan.js's, which the reference lines' rules share
export { stacksToPercent } from "./chart-plan.js";

/**
 * Each series' data as shares of its category's stack, in percent: `{ value: share, raw: value }`, null
 * where the series has no value. A stack is the series not hidden; its size is its parts' sizes
 * added up, so a part below zero takes its share below the axis. A category whose parts add up to
 * nothing gets no bar.
 * @param {Array<{ name: string, data: Array<number | null> }>} series
 * @param {ReadonlySet<string>} hidden  the series names left out of the stack
 * @returns {{ data: Array<Array<{ value: number, raw: number } | null>>, negative: boolean }}
 */
export function percentShares(series, hidden) {
    const shown = series.filter((s) => !hidden.has(s.name));
    const length = series.reduce((n, s) => Math.max(n, s.data.length), 0);
    const sizes = Array.from({ length }, (_, i) => shown.reduce((sum, s) => sum + Math.abs(s.data[i] ?? 0), 0));
    let negative = false;
    const data = series.map((s) =>
        s.data.map((v, i) => {
            if (v === null || sizes[i] === 0) {
                return null;
            }
            negative ||= v < 0;
            return { value: (v / sizes[i]) * 100, raw: v };
        })
    );
    return { data, negative };
}

/**
 * The legend's `selected` for the hidden entries (each one false), or null when none is hidden. The
 * names come from a view: Object.fromEntries makes each one an own property, "__proto__" too.
 * @param {readonly string[] | undefined} hidden
 */
export function legendSelected(hidden) {
    return Array.isArray(hidden) && hidden.length ? Object.fromEntries(hidden.map((name) => [name, false])) : null;
}

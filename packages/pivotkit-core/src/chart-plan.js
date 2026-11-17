/*
 * What a chart draws for a view, the same on the screen (pivotkit-react), in an SVG and in a printed
 * report (pivotkit-report): a type the user chose is drawn as it is; "auto" (the default) draws lines
 * when a date is on Rows, lines with rows and columns swapped for the chart alone when a date is on
 * Columns only (so the dates run along the axis and the table keeps its layout), else bars. And the
 * colours of a chart from the --pk-* tokens of a report's theme, and which reference lines it can
 * draw. Pure and small: the first load of a report needs it.
 */

import { AGGREGATORS } from "./aggregators.js";
import { autoChartType } from "./chart-series.js";
import { pxOf } from "./defaults.js";
import { TIMELINE_UNITS } from "./derive.js";
import { SHOW_AS } from "./show-as.js";

/**
 * The chart settings to draw a view with.
 * @param {{ rows: string[], cols: string[], derived: any[], chart: { type: string, stacked?: boolean, horizontal?: boolean } }} view  a normalized view
 * @param {import("./encode.js").Encoded} encoded
 * @returns {{ auto: boolean, swap: boolean, chart: { type: string, stacked: boolean, horizontal: boolean } }}
 *   `auto`: the view's type was "auto"; `swap`: draw from the pivot of `swapAxes(view)`
 */
export function chartPlan(view, encoded) {
    if (view.chart.type !== "auto") {
        return { auto: false, swap: false, chart: { type: view.chart.type, stacked: Boolean(view.chart.stacked), horizontal: Boolean(view.chart.horizontal) } };
    }
    const own = autoChartType(/** @type {any} */ (view), encoded);
    const swap = own === "bar" && view.cols.length > 0 && autoChartType(/** @type {any} */ ({ ...view, rows: view.cols }), encoded) === "line";
    return { auto: true, swap, chart: { type: own === "line" || swap ? "line" : "bar", stacked: false, horizontal: false } };
}

/**
 * Whether a value's results add up across a category's series, so a stack of them has a total: an
 * additive aggregator (sum, count), shown as itself or as a show-as type that adds up (SHOW_AS
 * addsUp; one that walks an axis only along the rows, the chart's categories).
 * @param {{ agg?: string, showAs?: { type: string, axis?: string } | null } | undefined} value  the view's value
 */
export function valueAddsUp(value) {
    if (!value || typeof value.agg !== "string" || !Object.hasOwn(AGGREGATORS, value.agg) || !AGGREGATORS[value.agg].additive) {
        return false;
    }
    const showAs = value.showAs;
    if (!showAs) {
        return true;
    }
    const def = Object.hasOwn(SHOW_AS, showAs.type) ? SHOW_AS[showAs.type] : null;
    return Boolean(def && def.addsUp && (!def.alongAxis || showAs.axis === "rows"));
}

/**
 * Whether a view's categories are points in time in their own order: every row field a date or a
 * grouping of one along the time line, none sorted by a value or by hand.
 * @param {{ rows: string[], derived: any[], sort: any[] }} view  a normalized view
 * @param {import("./encode.js").Encoded} encoded
 */
function timeLine(view, encoded) {
    const key = (name) => String(name).toLowerCase();
    const isTime = (name) => {
        const d = view.derived.find((x) => key(x.name) === key(name));
        return d ? TIMELINE_UNITS.includes(d.by) && encoded.column(d.field)?.type === "date" : encoded.column(name)?.type === "date";
    };
    const ordered = (name) => !view.sort.some((s) => key(s.field) === key(name) && s.by !== "label");
    return view.rows.length > 0 && view.rows.every((name) => isTime(name) && ordered(name));
}

/**
 * Which reference lines (chart.referenceLines) a chart can draw for a view, the one rule for the
 * chart, its menu and its file:
 * - Pie, donut and heatmap have no value axis: no lines.
 * - Bars, lines and areas side by side: an average and a trend per series, over its plotted points.
 * - Stacked: the lines of the stack's total, the sum of its drawn parts, and only when every value
 *   adds up (valueAddsUp). A stack of averages has a height that means nothing: no line at all.
 * - A trend only where the categories are points in time in their own order: every row field a date
 *   or a grouping along the time line, none sorted by a value or by hand.
 * A setting that is off here stays in the view: it draws again when the chart can.
 * @param {{ rows: string[], derived: any[], sort: any[], values: any[] }} view  a normalized view
 * @param {{ type: string, stacked?: boolean }} chart  what is drawn: chartPlan's chart, never "auto"
 * @param {import("./encode.js").Encoded} encoded
 * @returns {{ average: boolean, trend: boolean, target: boolean }}
 */
export function referenceLineRules(view, chart, encoded) {
    const counted = (chart.type === "bar" || chart.type === "line" || chart.type === "area") && (!chart.stacked || view.values.every(valueAddsUp));
    return { average: counted, trend: counted && timeLine(view, encoded), target: counted };
}

/** "Show values as" types that name an axis, and their counterpart on the other one. */
const SWAPPED_SHOW_AS = Object.freeze({ percentOfRowTotal: "percentOfColumnTotal", percentOfColumnTotal: "percentOfRowTotal", percentOfParentRow: "percentOfParentColumn", percentOfParentColumn: "percentOfParentRow" });

/**
 * A copy of a view with Rows and Columns swapped: the collapsed groups go with their axis, and a
 * "show values as" that names an axis names the other one, so every number stays what it was.
 * @template {{ rows: string[], cols: string[], collapsed: { rows: any[], cols: any[] }, values: any[] }} V
 * @param {V} view  a normalized view
 * @returns {V}
 */
export function swapAxes(view) {
    /** @type {V} */
    const next = JSON.parse(JSON.stringify(view));
    [next.rows, next.cols] = [next.cols, next.rows];
    next.collapsed = { rows: next.collapsed.cols, cols: next.collapsed.rows };
    for (const v of next.values) {
        if (v.showAs && v.showAs.axis) {
            v.showAs = { ...v.showAs, axis: v.showAs.axis === "rows" ? "cols" : "rows" };
        }
        if (v.showAs && Object.hasOwn(SWAPPED_SHOW_AS, v.showAs.type)) {
            v.showAs = { ...v.showAs, type: SWAPPED_SHOW_AS[v.showAs.type] };
        }
    }
    return next;
}

/** Number of categorical chart colours (--pk-chart-1 ... --pk-chart-8). */
export const CHART_COLORS = 8;

/**
 * The theme of toEChartsOption and toXlsx from the --pk-* tokens of a report: the computed style of a
 * report's root, or any object with getPropertyValue (a map of tokens, as pivotkit-report passes).
 * A token missing, or not what the chart can read (a weight as a keyword, a size not in px), keeps
 * DEFAULT_THEME's value. pivotkit-react resolves the sizes to px first (chart-decorate.js, chartStyle).
 * @param {{ getPropertyValue(name: string): string }} style
 * @returns {import("./chart.js").ChartTheme}
 */
export function chartThemeFrom(style) {
    const v = (name) => style.getPropertyValue(name).trim();
    const colors = [];
    for (let i = 1; i <= CHART_COLORS; i++) {
        const c = v(`--pk-chart-${i}`);
        if (c) {
            colors.push(c);
        }
    }
    /** @type {import("./chart.js").ChartTheme} */
    const theme = {
        colors,
        textColor: v("--pk-muted") || undefined,
        axisColor: v("--pk-border") || undefined,
        gridColor: v("--pk-grid") || v("--pk-border") || undefined,
        fontFamily: v("font-family") || undefined,
        backgroundColor: "transparent",
        referenceColor: v("--pk-chart-reference") || undefined
    };
    // a number for ECharts (1 to 1000, as in CSS); a host's keyword (bold) or an empty token keeps DEFAULT_THEME's
    const strong = Number(v("--pk-weight-strong"));
    if (strong >= 1 && strong <= 1000) {
        theme.strongWeight = strong;
    }
    const title = pxOf(v("--pk-chart-title-size"));
    if (title !== null && title >= 1) {
        theme.titleSize = title;
    }
    const text = pxOf(v("--pk-chart-text-size"));
    if (text !== null && text >= 1) {
        theme.textSize = text;
    }
    const low = v("--pk-heat-low");
    const high = v("--pk-heat-high");
    if (low && high) {
        theme.heatmapColors = [low, high];
    }
    // the colours of a workbook's colour scale and data bars whose view names none (toXlsx), as CSS
    // writes them: a caller that writes a workbook makes them #rrggbb first
    const [scaleLow, scaleMid, scaleHigh, bar] = ["--pk-scale-low", "--pk-scale-mid", "--pk-scale-high", "--pk-chart-1"].map(v);
    if (scaleLow && scaleHigh) {
        theme.colorScale = scaleMid ? [scaleLow, scaleMid, scaleHigh] : [scaleLow, scaleHigh];
    }
    if (bar) {
        theme.dataBar = bar;
    }
    return theme;
}

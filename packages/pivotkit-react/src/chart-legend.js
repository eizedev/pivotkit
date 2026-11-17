/*
 * The chart's legend and zoom slider between draws: a click on a legend entry is reported (the view
 * keeps it, chart.hidden), and the slider's window is kept while the categories stay; a window of
 * another size is drawn again, so the axis lays its names out for it. A redraw replaces the whole
 * ECharts option (notMerge), so what ECharts held itself is passed again. And the series the chart's
 * text alternative counts. Only a drawn chart needs this: it loads with ECharts (echarts.js), so the
 * first load does not carry it.
 */

import { autoChartType } from "pivotkit-core";

/** How long the zoom slider rests before a window of another size lays its labels out again, in ms. */
export const RELAYOUT_WAIT = 250;

/**
 * @typedef {{ names: readonly string[], start: number, end: number }} ZoomWindow
 *   the categories the window was moved over, and its first and last one by index
 */

/**
 * The window kept from the last draw, for pivotkit-core's decorateOption (`zoomAt`): only while the
 * same categories are drawn in the same order; other categories start where decorateOption starts them.
 * @param {ZoomWindow | null} kept
 * @param {readonly string[]} names  the categories drawn now
 * @returns {{ start: number, end: number } | undefined}
 */
export function keptWindow(kept, names) {
    if (!kept || kept.names.length !== names.length || kept.names.some((n, i) => n !== names[i])) {
        return undefined;
    }
    return { start: kept.start, end: kept.end };
}

/**
 * Follows a click on the legend and the zoom slider of an ECharts instance.
 * @param {any} instance
 * @param {{ onLegend: (change: { name: string, shown: boolean }) => void, onZoom: (start: number, end: number) => void }} on
 *   onLegend: an entry is shown or hidden now; onZoom: the slider's window, first and last category by index
 */
export function followChart(instance, { onLegend, onZoom }) {
    instance.on("legendselectchanged", (/** @type {any} */ e) => onLegend({ name: e.name, shown: Boolean(e.selected?.[e.name]) }));
    instance.on("datazoom", () => {
        const z = instance.getOption().dataZoom?.[0];
        if (z && typeof z.startValue === "number" && typeof z.endValue === "number") {
            onZoom(z.startValue, z.endValue);
        }
    });
}

/**
 * @typedef {{ start: number, end: number, count: number, beside: boolean, offset: number, size: number,
 *   move: (start: number, end: number) => void }} ZoomControl  the slider's window, where it is, and how to move it
 */

/**
 * Follows the legend and the zoom slider of a chart (followChart) and keeps the slider's window.
 * @param {any} instance  the chart's ECharts instance
 * @param {{ categories: () => readonly string[] | undefined, onLegend: (change: { name: string, shown: boolean }) => void, redraw: () => void,
 *   onWindow: (control: ZoomControl | null) => void }} on
 *   categories: the categories drawn now; redraw: draws the chart again (a window of another size);
 *   onWindow: the slider's window and place as they change (zoomKeyProps draws its keyboard control
 *   from it), null without a slider
 */
export function chartKeeper(instance, { categories, onLegend, redraw, onWindow }) {
    /** @type {ZoomWindow | null} */
    let kept = null;
    let span = -1;
    /** @type {ZoomControl | null} */
    let control = null;
    const move = (/** @type {number} */ start, /** @type {number} */ end) => instance.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, startValue: start, endValue: end });
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let wait;
    followChart(instance, {
        onLegend,
        onZoom: (start, end) => {
            const names = categories();
            if (!names) {
                return;
            }
            kept = { names, start, end };
            if (control && (control.start !== start || control.end !== end)) {
                control = { ...control, start, end };
                onWindow(control);
            }
            if (end - start !== span) {
                clearTimeout(wait);
                wait = setTimeout(redraw, RELAYOUT_WAIT);
            }
        }
    });
    return {
        /**
         * decorateOption's zoom settings: the view's chart.zoom, the window kept, the latest categories
         * first over dates (a date on Rows), a finger's slider on a touch screen
         * @param {import("pivotkit-core").PivotResult} result
         * @param {readonly string[]} names
         * @param {Document} doc
         */
        zoomOf: (result, names, doc) => ({
            zoom: result.view.chart.zoom,
            zoomAt: keptWindow(kept, names),
            timeline: autoChartType(result.view, result.encoded) === "line",
            touch: Boolean(doc.defaultView?.matchMedia?.("(pointer: coarse)").matches)
        }),
        /**
         * The slider drawn: its window's size, to tell a move from a new size, and its keyboard control.
         * @param {any[] | undefined} dataZoom  decorateOption's
         */
        drawn: (dataZoom) => {
            const z = dataZoom?.[0];
            span = z ? z.endValue - z.startValue : -1;
            const beside = z?.orient === "vertical";
            const next = z ? { start: z.startValue, end: z.endValue, count: categories()?.length ?? z.endValue + 1, beside, offset: beside ? z.right : z.bottom, size: beside ? z.width : z.height, move } : null;
            // the same window at the same place: the control stays as it is (no render of the chart)
            const same = next && control && ["start", "end", "count", "beside", "offset", "size"].every((k) => next[/** @type {keyof ZoomControl} */ (k)] === control?.[/** @type {keyof ZoomControl} */ (k)]);
            if (!same && (next || control)) {
                control = next;
                onWindow(control);
            }
        },
        dispose: () => clearTimeout(wait)
    };
}

/**
 * What the chart's text alternative counts (chart-summary.js): the series shown, without the legend
 * entries hidden (series, or for a pie and a donut categories), and whether it is a 100 % stack (its
 * parts carry their value as `raw`, pivotkit-core's chart.js).
 * @param {ReturnType<typeof import("pivotkit-core").toSeries>} s
 * @param {any} option  toEChartsOption's
 * @param {readonly string[] | undefined} hidden  the view's chart.hidden
 * @param {boolean} slices  a pie or a donut
 */
export function shownOf(s, option, hidden, slices) {
    // a 100 % stack's parts are { value: share, raw: value } (pivotkit-core's chart.js)
    const shares = (option.series ?? []).some((/** @type {any} */ x) => Array.isArray(x.data) && x.data.some((/** @type {any} */ d) => d !== null && typeof d === "object" && typeof d.raw === "number"));
    return { series: shownOnly(s, hidden ?? [], slices), shares };
}

/**
 * The chart data as it is shown: without the legend entries hidden (chart.hidden), series or, for a
 * pie and a donut, categories.
 * @param {ReturnType<typeof import("pivotkit-core").toSeries>} s
 * @param {readonly string[]} hidden
 * @param {boolean} slices
 */
export function shownOnly(s, hidden, slices) {
    const out = new Set(hidden);
    if (!out.size) {
        return s;
    }
    if (!slices) {
        return { ...s, series: s.series.filter((x) => !out.has(x.name)) };
    }
    const keep = s.categories.map((name, i) => (out.has(name) ? -1 : i)).filter((i) => i >= 0);
    return {
        ...s,
        categories: keep.map((i) => s.categories[i]),
        categoryCount: (s.categoryCount ?? s.categories.length) - (s.categories.length - keep.length),
        series: s.series.map((x) => ({ ...x, data: keep.map((i) => x.data[i]) }))
    };
}

/** Keys that move the window forward (right, or down the categories of horizontal bars) and back. */
export const FORWARD = new Set(["ArrowRight", "ArrowDown"]);
export const BACK = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * The window after a key, or null for a key that does not change it:
 * - an arrow moves it by one category; Page Up and Page Down by its own size
 * - Shift with an arrow makes it one category larger (forward) or smaller (back), at least two
 * - Home and End move it to the first and the last categories
 * @param {{ start: number, end: number }} at  the first and last category shown, by index
 * @param {number} count  the categories
 * @param {string} key
 * @param {boolean} shift
 * @returns {{ start: number, end: number } | null}
 */
export function nextWindow({ start, end }, count, key, shift) {
    const span = end - start;
    const last = count - 1;
    /** @type {{ start: number, end: number } | null} */
    let next = null;
    if (shift && FORWARD.has(key)) {
        next = { start, end: Math.min(last, end + 1) };
    } else if (shift && BACK.has(key)) {
        next = { start, end: Math.max(start + 1, end - 1) };
    } else {
        const by = FORWARD.has(key) ? 1 : BACK.has(key) ? -1 : key === "PageDown" ? span + 1 : key === "PageUp" ? -(span + 1) : key === "Home" ? -count : key === "End" ? count : 0;
        if (by) {
            const from = Math.min(Math.max(0, start + by), last - span);
            next = { start: from, end: from + span };
        }
    }
    return next && (next.start !== start || next.end !== end) ? next : null;
}

/**
 * The zoom slider by keyboard (#575): ECharts draws its slider on the canvas, which takes no focus.
 * An element of our own lies over the slider's row: a focusable ARIA slider that moves and resizes
 * the window with the keys (nextWindow), says which categories it shows, and draws the focus ring. It
 * takes no pointer input (styles.css), so the mouse and a finger still reach ECharts' slider below.
 * These are its props; the chart draws it as a plain element, so this chunk needs no React.
 * Its value is the window's first category: from 1 to the last place the window can start
 * (`count - span`). A vertical slider (horizontal bars) runs as the axis does, the first category at
 * the top, so Up shows earlier categories and lowers the value, as the order on the screen reads.
 * @param {ZoomControl} control
 * @param {{ chartZoom: string, chartZoomWindow: string }} labels
 * @param {(text: string, values: Record<string, string>) => string} fill  labels.js's
 * @param {string} [locale]
 */
export function zoomKeyProps({ start, end, count, beside, offset, size, move }, labels, fill, locale) {
    const n = (/** @type {number} */ x) => x.toLocaleString(locale);
    return {
        // its place, through the CSSOM, which a strict Content-Security-Policy allows
        // the pair of the other orientation is cleared: the same element may have been the other one
        ref: (/** @type {HTMLElement | null} */ el) => {
            const set = (/** @type {Record<string, string>} */ props) => Object.entries(props).forEach(([k, v]) => el?.style.setProperty(k, v));
            // over the slider's row (beside the plot for horizontal bars); the mouse passes through to ECharts' slider
            set({ position: "absolute", "pointer-events": "none" });
            set(beside ? { top: "0", bottom: "0", right: `${offset}px`, width: `${size}px`, left: "auto", height: "auto" } : { left: "0", right: "0", bottom: `${offset}px`, height: `${size}px`, top: "auto", width: "auto" });
        },
        role: "slider",
        tabIndex: 0,
        className: "pk-zoom-keys",
        "aria-label": labels.chartZoom,
        "aria-orientation": /** @type {"vertical" | "horizontal"} */ (beside ? "vertical" : "horizontal"),
        "aria-valuemin": 1,
        "aria-valuemax": count - (end - start),
        "aria-valuenow": start + 1,
        "aria-valuetext": fill(labels.chartZoomWindow, { from: n(start + 1), to: n(end + 1), count: n(count) }),
        "data-testid": "chart-zoom-keys",
        onKeyDown: (/** @type {KeyboardEvent} */ e) => {
            if (e.altKey || e.ctrlKey || e.metaKey) {
                return;
            }
            const next = nextWindow({ start, end }, count, e.key, e.shiftKey);
            if (next || FORWARD.has(e.key) || BACK.has(e.key) || ["Home", "End", "PageUp", "PageDown"].includes(e.key)) {
                // at an end the key still belongs to the slider: the page does not scroll
                e.preventDefault();
            }
            if (next) {
                move(next.start, next.end);
            }
        }
    };
}

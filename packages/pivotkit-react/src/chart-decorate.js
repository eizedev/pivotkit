/*
 * The report's marks on pivotkit-core's ECharts option: pivotkit-core's decorateOption (the theme's
 * colours from the --pk-* tokens, rounded bars, the axis labels laid out for the chart's size; the
 * same look as an SVG or a printed report of pivotkit-report) with the tooltip built as DOM nodes
 * (chart-tooltip.js, so a strict Content-Security-Policy allows it), and the tokens the chart reads as
 * px resolved (chartStyle; an HTML report and an SVG take them from here too, export-run.js). Only a
 * drawn chart needs it: it loads with ECharts (echarts.js).
 */

import { DEFAULT_THEME } from "pivotkit-core";
import { decorateOption } from "pivotkit-core/chart";
import { tooltipFormatter, valueAddsUp } from "./chart-tooltip.js";

/** The tooltip's room: a line of text is this many times the text size high. */
const TOOLTIP_LINE = 1.5;
/** The tooltip's padding, top and bottom together, in px (ECharts' default 10 px each side, and some air). */
const TOOLTIP_PADDING = 24;
/** Lines besides the series: the title, the total and the "+N more" line. */
const TOOLTIP_OTHER_LINES = 3;

/**
 * @param {any} option
 * @param {{ getPropertyValue(name: string): string }} style  the report's tokens (chartStyle)
 * @param {number} [height]  the chart's height in px, for the room around a pie
 * @param {Document} [doc]  the chart's document, for the tooltip's nodes
 * @param {number} [width]  the chart's width in px, for the column names of a heatmap and the category axis
 * @param {{ categoryNames?: string[], axisLabels?: string, parseColor?: (color: string) => unknown, tooltip?: { mode?: string, hover?: { current: { seriesIndex: number, dataIndex: number } | null }, totalLabel?: string, moreLabel?: string, moreInTotalLabel?: string, values?: Array<{ agg?: string, showAs?: { type: string, axis?: string } | null } | undefined> } }} [extra]
 *   the categories' whole names (the tooltip's title when the axis writes them shorter), the view's
 *   chart.axisLabels; tooltip: the view's chart.tooltip, the chart's hover state (chart.jsx writes the
 *   element under the pointer into `current`, the formatter reads it), the name of a stack's total,
 *   the lines that say how many series were cut, and each series' value (whether it adds up);
 *   parseColor: ECharts' colour parser, for a heatmap's colours (screenColor)
 * @returns {any}  the option; `axisEvery` (not ECharts') is n when the category axis writes every n-th label
 */
export function decorate(option, style, height = 480, doc = undefined, width = 800, extra = {}) {
    const { tooltip = {}, parseColor, ...rest } = extra;
    // each series' type and stack, by index: the tooltip's totals and the gap between stacked bars
    const series = (option.series || []).map((/** @type {any} */ s, /** @type {number} */ i) => ({ type: s.type, stack: s.stack, additive: tooltip.values ? valueAddsUp(tooltip.values[i]) : undefined }));
    const hover = tooltip.hover;
    // the lines that fit the chart's height, with the title, the total and the tooltip's padding
    const line = Math.round((typeof option.textStyle?.fontSize === "number" ? option.textStyle.fontSize : DEFAULT_THEME.textSize) * TOOLTIP_LINE);
    const maxLines = Math.max(2, Math.floor((height - TOOLTIP_PADDING) / line) - TOOLTIP_OTHER_LINES);
    const options = { series, mode: tooltip.mode, totalLabel: tooltip.totalLabel, moreLabel: tooltip.moreLabel, moreInTotalLabel: tooltip.moreInTotalLabel, maxLines, hoverOf: () => hover?.current ?? null };
    const readColor = doc && parseColor ? screenColor(doc, parseColor) : undefined;
    const drawn = decorateOption(option, style, { height, width, ...rest, readColor, tooltipFormatter: doc ? (context) => tooltipFormatter(doc, { ...context, ...options }) : undefined });
    // on the screen the tooltip stays inside the chart
    return doc ? { ...drawn, tooltip: { ...drawn.tooltip, confine: true } } : drawn;
}

/**
 * A heatmap colour as ECharts can mix it (pivotkit-core's decorateOption, readColor): a colour ECharts'
 * parser reads stays as it is; any other the browser draws (oklch(), rgb() with spaces) is read back
 * from one pixel of a canvas as #rrggbb, so the screen shows the host's colour; null for a text that
 * is no colour, or one the canvas does not take. The pixel is sRGB without alpha: a P3 colour is
 * clipped and a transparent one drawn opaque.
 * @param {Document} doc
 * @param {(color: string) => unknown} parse  ECharts' colour parser
 * @returns {(color: string) => string | null}
 */
export function screenColor(doc, parse) {
    /** @type {CanvasRenderingContext2D | null | undefined} */
    let ctx;
    return (text) => {
        if (parse(text.trim())) {
            return text;
        }
        if (typeof CSS === "undefined" || !CSS.supports("color", text)) {
            return null;
        }
        if (ctx === undefined) {
            const canvas = doc.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            ctx = canvas.getContext("2d", { willReadFrequently: true });
        }
        if (!ctx) {
            return null;
        }
        // a value the canvas does not take (an unresolved var(), light-dark()) leaves fillStyle as it
        // was: a transparent sentinel tells it, so it never reads back as some other colour
        ctx.fillStyle = "transparent";
        const sentinel = String(ctx.fillStyle);
        ctx.fillStyle = text;
        if (String(ctx.fillStyle) === sentinel) {
            return null;
        }
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        return `#${[...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    };
}

/**
 * The tokens the chart reads as lengths in px (chartThemeFrom, decorateOption): the title's and the
 * other text's size, the marks' corners. A computed custom property keeps the calc(), max() and em it
 * was written with, so the report resolves them first.
 */
export const LENGTH_TOKENS = Object.freeze(["--pk-chart-title-size", "--pk-chart-text-size", "--pk-radius-chart"]);

/**
 * Tokens that are lengths, in px as the report resolves them (em of its font): a probe inside the root
 * takes each one as its margin. A token not set, or not a length CSS takes (a keyword: its margin would
 * be 0), is left out, so the chart keeps its default.
 * @param {HTMLElement} root  the report's root
 * @param {readonly string[]} [names]
 * @returns {Record<string, string>}  "16px" per token
 */
export function tokenLengths(root, names = LENGTH_TOKENS) {
    const view = root.ownerDocument.defaultView;
    const style = view?.getComputedStyle(root);
    const lengthy = (/** @type {string} */ value) => Boolean(value) && (typeof CSS === "undefined" || CSS.supports("margin-left", value));
    const set = style ? names.filter((name) => lengthy(style.getPropertyValue(name).trim())) : [];
    if (!view || !set.length) {
        return {};
    }
    const probe = root.ownerDocument.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.setProperty("position", "absolute");
    probe.style.setProperty("visibility", "hidden");
    root.append(probe);
    try {
        return Object.fromEntries(
            set
                .map((name) => {
                    probe.style.setProperty("margin-left", `var(${name})`);
                    return [name, view.getComputedStyle(probe).marginLeft];
                })
                .filter(([, value]) => /px$/.test(value))
        );
    } finally {
        probe.remove();
    }
}

/**
 * The report's computed style with its length tokens in px: what chartThemeFrom and pivotkit-core's
 * decorateOption read.
 * @param {HTMLElement} root
 * @returns {{ getPropertyValue(name: string): string }}
 */
export function chartStyle(root) {
    const style = getComputedStyle(root);
    const lengths = tokenLengths(root);
    return { getPropertyValue: (name) => lengths[name] ?? style.getPropertyValue(name) };
}

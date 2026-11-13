/*
 * The report's marks on pivotkit-core's ECharts option: pivotkit-core's decorateOption (the theme's
 * colours from the --pk-* tokens, rounded bars, the axis labels laid out for the chart's size; the
 * same look as an SVG or a printed report of pivotkit-report) with the tooltip built as DOM nodes
 * (chart-tooltip.js, so a strict Content-Security-Policy allows it), and the tokens the chart reads as
 * px resolved (chartStyle; an HTML report and an SVG take them from here too, export-run.js). Only a
 * drawn chart needs it: it loads with ECharts (echarts.js).
 */

import { decorateOption } from "pivotkit-core/chart";
import { tooltipFormatter } from "./chart-tooltip.js";

/**
 * @param {any} option
 * @param {{ getPropertyValue(name: string): string }} style  the report's tokens (chartStyle)
 * @param {number} [height]  the chart's height in px, for the room around a pie
 * @param {Document} [doc]  the chart's document, for the tooltip's nodes
 * @param {number} [width]  the chart's width in px, for the column names of a heatmap and the category axis
 * @param {{ categoryNames?: string[], axisLabels?: string }} [extra]  the categories' whole names (the
 *   tooltip's title when the axis writes them shorter) and the view's chart.axisLabels
 * @returns {any}  the option; `axisEvery` (not ECharts') is n when the category axis writes every n-th label
 */
export function decorate(option, style, height = 480, doc = undefined, width = 800, extra = {}) {
    return decorateOption(option, style, { height, width, ...extra, tooltipFormatter: doc ? (context) => tooltipFormatter(doc, context) : undefined });
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

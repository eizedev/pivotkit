/*
 * The report's marks on pivotkit-core's ECharts option: pivotkit-core's decorateOption (the theme's
 * colours from the --pk-* tokens, rounded bars, the axis labels laid out for the chart's size; the
 * same look as an SVG or a printed report of pivotkit-report) with the tooltip built as DOM nodes
 * (chart-tooltip.js, so a strict Content-Security-Policy allows it). Only a drawn chart needs it: it
 * loads with ECharts (echarts.js).
 */

import { decorateOption } from "pivotkit-core/chart";
import { tooltipFormatter } from "./chart-tooltip.js";

/**
 * @param {any} option
 * @param {CSSStyleDeclaration} style  the report's computed style (the --pk-* tokens)
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

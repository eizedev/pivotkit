/*
 * The Export menu's HTML report, chart as SVG and print: pivotkit-report's render() with ECharts' SVG
 * renderer registered next to the report's own chart parts (echarts.js, loaded by the caller). A chunk
 * of its own, loaded on the first of these exports (export-run.js), so neither the first load nor the
 * menus carry pivotkit-report.
 */

import { use as register } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { LIGHT_TOKENS, SHAPE_TOKENS, SIZE_TOKENS, WEIGHT_TOKENS, render } from "pivotkit-report";

register([SVGRenderer]);

export { render };

/**
 * The tokens of an HTML report and an SVG, as the report's light theme resolves them (export-run.js):
 * pivotkit-report's colours, font weights and corners, and a host's middle colour of a colour scale.
 * The chart's lengths in px come from the chart's module (LENGTH_TOKENS).
 */
export const REPORT_TOKENS = Object.freeze([...Object.keys(WEIGHT_TOKENS), ...Object.keys(SHAPE_TOKENS), ...Object.keys(LIGHT_TOKENS), "--pk-scale-mid"]);

/**
 * The HTML report's font sizes, in px as the report resolves them (export-run.js): its text and
 * secondary text, so the file's text is the size the screen's is, and a host's title and print sizes
 * where it sets them (pivotkit-report's own defaults else).
 */
export const REPORT_LENGTHS = Object.freeze(Object.keys(SIZE_TOKENS));

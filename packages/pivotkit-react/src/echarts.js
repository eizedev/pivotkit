/*
 * The parts of Apache ECharts the chart draws with, imported by name: bar, line, pie and heatmap, the
 * components they use and the canvas renderer. A bundler keeps only these (a namespace import of
 * "echarts/charts" would keep every chart type). This module is the only importer of echarts and is
 * loaded on the first chart (chart.jsx), so a report that never shows a chart does not load it; the
 * build keeps it a file of its own (dist/echarts.js). pivotkit-core's ECharts option (toEChartsOption),
 * the check and merge of the host's chartOptions (chart-options.js) and the report's marks on the
 * option (chart-decorate.js) come with it: only a chart needs them.
 */

// renamed: a call of `use` reads as a React hook to the linter
import { color, init, use as register } from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

register([BarChart, LineChart, PieChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, VisualMapComponent, CanvasRenderer]);

// color: ECharts' own colour parser (color.parse). What it gives nothing for, ECharts cannot mix: a
// heatmap's colours on the screen (chart-decorate.js) and in pivotkit-report's SVG, which gets this module
export { color, init };
export { toEChartsOption } from "pivotkit-core/chart";
export { cleanChartOptions, mergeChartOptions } from "./chart-options.js";
export { colorMapFor } from "./chart-colors.js";
export { LENGTH_TOKENS, chartStyle, decorate, screenColor, tokenLengths } from "./chart-decorate.js";

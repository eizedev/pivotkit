/*
 * The parts of Apache ECharts the chart draws with, imported by name: bar, line, pie and heatmap, the
 * components they use and the canvas renderer. A bundler keeps only these (a namespace import of
 * "echarts/charts" would keep every chart type). This module is the only importer of echarts and is
 * loaded on the first chart (chart.jsx), so a report that never shows a chart does not load it; the
 * build keeps it a file of its own (dist/echarts.js).
 */

// renamed: a call of `use` reads as a React hook to the linter
import { init, use as register } from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

register([BarChart, LineChart, PieChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, CanvasRenderer]);

export { init };

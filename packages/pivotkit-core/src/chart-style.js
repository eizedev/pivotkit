/*
 * A report's marks on the ECharts option of toEChartsOption: the theme's colours (the --pk-* tokens),
 * rounded bars, the tooltip in the theme and the axis labels laid out for the chart's size
 * (chart-layout.js). The same look on the screen (pivotkit-react, which adds its DOM tooltip), in an
 * SVG and in a printed report (pivotkit-report). The entry point "pivotkit-core/chart": only a drawn
 * chart needs it, so a report's first load does not. It holds toEChartsOption too, for the same
 * reason: a bundle that loads the chart from here keeps the option's code out of its first load.
 */

import { DEFAULT_THEME, HEATMAP_GRID_BOTTOM, pxOf } from "./defaults.js";
import { BOTTOM_LEGEND_ROOM, CATEGORY_LABEL_WIDTH, RIGHT_LEGEND_MIN_WIDTH, categoryLabelLayout, categoryLabelWidth, columnLabelLayout, groupLabelsFit, heatmapCellLabels, pieLabelRoom, ringLabelsFit, rowLabelInterval } from "./chart-layout.js";
import { barExtent, pieLabelFit, pieLabelTexts, valueAxisSplit, valueLabelRoom } from "./chart-fit.js";
import { AXIS_LABEL_MARGIN, groupLabelLine, groupLabelOffset, heatmapFrame } from "./chart-measure.js";
import { ZOOM_SLIDER, longestNames, zoomSlider, zoomWindow } from "./chart-zoom.js";

export * from "./chart-layout.js";
export { toEChartsOption } from "./chart.js";

/** A copy of an object without the given keys. */
const without = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/**
 * A heatmap's colours as ECharts can mix them. ECharts works out each cell's colour from the scale's
 * ends itself, and its parser reads hex, rgb(), hsl() and some names only: any other colour (oklch(),
 * rgb() with spaces) turns the cells black. `readColor` gives a colour ECharts reads (the colour as
 * it is, or the same colour another way), or null; an end it gives none for takes DEFAULT_THEME's.
 * @param {string[]} colors  low to high
 * @param {(color: string) => string | null} readColor
 */
function heatmapColors(colors, readColor) {
    const fallback = DEFAULT_THEME.colorScale;
    return colors.map((c, i) => readColor(String(c)) ?? fallback[i === 0 ? 0 : fallback.length - 1]);
}

/**
 * Mark styles on top of the core's option: rounded bar ends, 2 px lines, tooltips in the theme, built
 * as DOM nodes (chart-tooltip.js) so a strict Content-Security-Policy allows them.
 * @param {any} option  toEChartsOption()'s
 * @param {{ getPropertyValue(name: string): string }} style  the --pk-* tokens: a report's computed
 *   style, or a map of tokens wrapped (pivotkit-report)
 * @param {{ height?: number, width?: number, categoryNames?: string[], axisLabels?: string,
 *   tooltipFormatter?: (context: { valueFormatter?: (v: unknown) => string, shareFormatter?: (v: number) => string, xNames?: string[], yNames?: string[], categoryNames?: string[] }) => unknown,
 *   readColor?: (color: string) => string | null, zoom?: string }} [size]
 *   height and width: the chart's size in px (the room around a pie, a heatmap's column names, the
 *   category axis); categoryNames: the categories' whole names (the tooltip's title when the axis
 *   writes them shorter); axisLabels: the view's chart.axisLabels; tooltipFormatter: builds the
 *   tooltip's formatter (pivotkit-react's DOM tooltip), left out for a chart without one (an SVG);
 *   readColor: a heatmap colour as one ECharts can mix, or null (see heatmapColors); zoom: the view's
 *   chart.zoom, for a chart on a screen (chart-zoom.js); without it every category is drawn
 * @returns {any}  the option; `axisEvery` (not ECharts') is n when the category axis writes every n-th label
 */
export function decorateOption(option, style, { height = 480, width = 800, categoryNames, axisLabels, tooltipFormatter, readColor, zoom } = {}) {
    const extra = { categoryNames, axisLabels };
    const first = (a) => (Array.isArray(a) ? a[0] : a);
    const v = (name) => style.getPropertyValue(name).trim();
    // the size the core wrote the texts at (the theme's textSize, --pk-chart-text-size): the layout
    // below measures with it
    const fontSize = typeof option.textStyle?.fontSize === "number" ? option.textStyle.fontSize : DEFAULT_THEME.textSize;
    // a legend on the right of a narrow chart goes to the bottom (RIGHT_LEGEND_MIN_WIDTH): the room the
    // core keeps for it on the right is given back, the room of a bottom legend taken
    const rightLegend = option.legend?.orient === "vertical" && typeof option.legend.right === "number";
    const legendDown = rightLegend && width < RIGHT_LEGEND_MIN_WIDTH;
    if (legendDown) {
        option = {
            ...option,
            legend: { ...without(option.legend, ["orient", "right", "top"]), bottom: 0 },
            series: (option.series || []).map((s) => (s.type === "pie" ? { ...without(s, ["right"]), bottom: (typeof s.bottom === "number" ? s.bottom : 0) + BOTTOM_LEGEND_ROOM } : s)),
            ...(option.grid ? { grid: { ...without(option.grid, ["right"]), bottom: BOTTOM_LEGEND_ROOM + 8 } } : {})
        };
    }
    // without the stylesheet the tokens are empty and ECharts keeps its own colours
    const surface = v("--pk-surface") || undefined;
    // the marks' corners (--pk-radius-chart in px; pivotkit-react resolves it), a heatmap's cells three
    // quarters of it; the tooltip's, a DOM node in the report, as CSS (--pk-radius-card)
    const r = pxOf(v("--pk-radius-chart")) ?? DEFAULT_THEME.markRadius;
    const cell = Math.round(r * 0.75 * 100) / 100;
    const tooltip = {
        ...option.tooltip,
        backgroundColor: v("--pk-surface-raised") || surface,
        borderColor: v("--pk-border") || undefined,
        textStyle: { color: v("--pk-text") || undefined, fontFamily: style.getPropertyValue("font-family") || undefined, fontSize },
        extraCssText: `box-shadow: ${v("--pk-shadow") || "none"}; border-radius: ${v("--pk-radius-card") || `${DEFAULT_THEME.cardRadius}px`};`,
        ...(tooltipFormatter ? { formatter: tooltipFormatter({ valueFormatter: option.tooltip?.valueFormatter, shareFormatter: option.tooltip?.shareFormatter, xNames: first(option.xAxis)?.data, yNames: first(option.yAxis)?.data, categoryNames: extra.categoryNames }) } : {})
    };
    // the room of a heatmap that is not cells: its grid's margins and the column names as written
    const cellFrame = (option.series || []).some((s) => s.type === "heatmap") ? heatmapFrame({ top: option.grid?.top, bottom: option.grid?.bottom, names: option.xAxis?.data ?? [], width, fontSize }) : undefined;
    // a bar lights up alone, as the tooltip names it alone; a line lights up as a whole
    const series = (option.series || []).map((s) => {
        if (s.type === "bar") {
            const horizontal = first(option.yAxis)?.type === "category";
            const corners = horizontal ? [0, r, r, 0] : [r, r, 0, 0];
            return { ...s, barMaxWidth: 48, itemStyle: { borderRadius: s.stack ? 0 : corners, borderColor: s.stack ? surface : undefined, borderWidth: s.stack ? 1 : 0 }, emphasis: { focus: "self" } };
        }
        if (s.type === "line") {
            return { ...s, lineStyle: { width: 2 }, symbolSize: 7, smooth: Boolean(s.smooth), areaStyle: s.areaStyle ? { opacity: 0.18 } : undefined, emphasis: { focus: "series" } };
        }
        if (s.type === "pie") {
            // the pie's box: below the legend (the core's top), with room for the labels above and below
            const room = pieLabelRoom(height);
            const top = (typeof s.top === "number" ? s.top : 0) + room;
            const bottom = (typeof s.bottom === "number" ? s.bottom : 0) + room;
            // numbers inside a ring too thin for them (a low or narrow chart) would spill over its edges
            // onto the background: they are written outside, on a line to their slice, instead
            let label = s.label;
            // ECharts needs an explicit outside guide line on the first draw: an
            // undefined labelLine replaces its defaults and leaves the labels unplaced.
            let line = s.labelLine ?? { show: true };
            const box = { width: width - (typeof s.right === "number" ? s.right : 0), height: height - top - bottom };
            if (label?.position === "inside" && label.show !== false && Array.isArray(s.radius)) {
                if (!ringLabelsFit(s.radius, box, typeof label.formatter === "function" ? pieLabelTexts(s) : [], fontSize)) {
                    label = without(label, ["position"]);
                    line = { show: true };
                }
            }
            // labels outside: room beside the pie, on lines where they are long, left out where a side has no room (pieLabelFit)
            const fit = pieLabelFit({ ...s, label, labelLine: line }, box, { fontSize, legend: Boolean(option.legend) && option.legend.show !== false });
            label = fit.label ?? label;
            return { ...s, top, bottom, ...fit, labelLine: fit.labelLine ?? line, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: r }, label: { ...label, color: label?.position === "inside" ? undefined : v("--pk-text") || undefined } };
        }
        if (s.type === "heatmap") {
            // numbers only in cells large enough for them (heatmapCellLabels); the tooltip has every one
            const texts = typeof s.label?.formatter === "function" ? s.data.map((/** @type {any} */ d) => s.label.formatter({ value: d })) : [];
            const fits = heatmapCellLabels(option.xAxis?.data?.length ?? 1, option.yAxis?.data?.length ?? 1, width, height, texts, fontSize, cellFrame);
            return { ...s, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: cell }, label: { ...s.label, show: Boolean(s.label?.show) && fits, color: v("--pk-text") || undefined } };
        }
        return s;
    });
    const legend = option.legend ? { ...option.legend, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { ...option.legend.textStyle, color: v("--pk-text") || undefined } } : undefined;
    const grid = option.grid ? { left: 12, right: 24, bottom: option.visualMap ? HEATMAP_GRID_BOTTOM : 12, containLabel: true, ...option.grid } : undefined;
    // the values past the end of horizontal bars keep their room on the right (valueLabelRoom)
    if (grid) grid.right += valueLabelRoom(series, fontSize);
    // a heatmap names every column: slanted where they would overlap (columnLabelLayout)
    const heatmap = series.some((s) => s.type === "heatmap") && option.xAxis?.axisLabel;
    const xAxis = heatmap ? { ...option.xAxis, axisLabel: { ...option.xAxis.axisLabel, ...columnLabelLayout(option.xAxis.data ?? [], width, fontSize) } } : option.xAxis;
    // and its rows: every name where a line fits each row, else every n-th (rowLabelInterval)
    const yAxis = heatmap && option.yAxis ? { ...option.yAxis, axisLabel: { ...option.yAxis.axisLabel, interval: rowLabelInterval(option.yAxis.data?.length ?? 0, height, fontSize, cellFrame) } } : option.yAxis;
    // a long title ends in "…" within the chart's width (the PNG is drawn from the same option)
    const title = option.title ? { title: { ...option.title, textStyle: { ...option.title.textStyle, width: Math.max(40, width - 32), overflow: "truncate" } } } : {};
    // bars, lines and areas: the category axis writes every label that fits (categoryLabelLayout), the
    // group labels sit below (or left of) those labels
    let axes = { xAxis, yAxis };
    let axisEvery = 1;
    /** @type {object | null} the zoom slider (chart-zoom.js) */
    let slider = null;
    const along = !heatmap && series.some((s) => s.type === "bar" || s.type === "line") ? (first(option.yAxis)?.type === "category" ? "yAxis" : first(option.xAxis)?.type === "category" ? "xAxis" : null) : null;
    if (along) {
        let list = Array.isArray(axes[along]) ? axes[along] : [axes[along]];
        // "auto" group labels need room: below it the axis writes the whole names instead
        const group = list[1]?.groups ? list[1] : null;
        if (group && group.groupsAuto && !groupLabelsFit(list[0].data?.length ?? 0, group.groupSize ?? 1, { width, height, horizontal: along === "yAxis" })) {
            list = [{ ...list[0], data: extra.categoryNames ?? list[0].data }];
        }
        const names = list[0].data ?? [];
        // the height that is neither plot nor category labels: the grid's margins and a line of group labels
        const reserved = (typeof grid?.top === "number" ? grid.top : 0) + (typeof grid?.bottom === "number" ? grid.bottom : 0) + (list[1]?.groups ? groupLabelLine(fontSize) : 0);
        const box = { width, height, horizontal: along === "yAxis", mode: extra.axisLabels, fontSize, reserved };
        let layout = categoryLabelLayout(names, box);
        // a zoom slider shows a window of the categories: their labels are laid out for the window
        const shown = zoomWindow(zoom, names.length, layout.every);
        if (shown) {
            // the slider takes its room from the height the labels may take
            const room = { ...box, reserved: reserved + (along === "yAxis" ? 0 : ZOOM_SLIDER.size + ZOOM_SLIDER.gap) };
            layout = categoryLabelLayout(shown < names.length ? longestNames(names, shown) : names, room);
        }
        axisEvery = layout.every;
        const longest = Math.min(layout.width, categoryLabelWidth(names, fontSize));
        const offset = groupLabelOffset({ beside: along === "yAxis", slanted: Boolean(layout.rotate), longest, fontSize });
        const main = { ...list[0], axisLabel: { ...list[0].axisLabel, rotate: layout.rotate, interval: layout.interval, width: layout.width, overflow: layout.overflow } };
        // a group's name is cut to the room of its smallest group, so two names never run into each other
        const slot = (along === "yAxis" ? Math.max(0, height - 60) : Math.max(0, width - 80)) / Math.max(1, names.length);
        const groupWidth = along === "yAxis" ? CATEGORY_LABEL_WIDTH : Math.max(24, Math.round(slot * (list[1]?.groupSize ?? 1)) - 8);
        const rest = list.slice(1).map((a) => (a.groups ? { ...a, offset, axisTick: { ...a.axisTick, length: offset }, axisLabel: { ...a.axisLabel, width: groupWidth, overflow: "truncate" } } : a));
        axes = { ...axes, [along]: rest.length ? [main, ...rest] : main };
        if (shown && grid) {
            const beside = along === "yAxis";
            // beyond a legend on that side; the plot gives the slider its room
            const offset = beside ? (rightLegend && !legendDown && typeof option.grid?.right === "number" ? option.grid.right - 4 : 4) : option.legend && option.legend.bottom === 0 ? BOTTOM_LEGEND_ROOM : 4;
            const color = (name) => (readColor ? (readColor(v(name)) ?? undefined) : v(name) || undefined);
            slider = zoomSlider({ beside, axes: 1 + rest.length, shown, offset, fontSize, colors: { line: color("--pk-border"), fill: color("--pk-accent-soft"), handle: color("--pk-accent"), text: color("--pk-muted") } });
            grid[beside ? "right" : "bottom"] += ZOOM_SLIDER.size + ZOOM_SLIDER.gap;
        }
        // horizontal bars: fewer ticks where the value axis's labels would run into each other
        const value = along === "yAxis" && !Array.isArray(axes.xAxis) && axes.xAxis?.type === "value" ? axes.xAxis : null;
        if (value && grid && typeof value.axisLabel?.formatter === "function") {
            const beside = rest.length ? offset + CATEGORY_LABEL_WIDTH : longest + AXIS_LABEL_MARGIN;
            const plotWidth = width - grid.left - grid.right - beside;
            const splitNumber = valueAxisSplit(barExtent(series), { plotWidth, fontSize, format: value.axisLabel.formatter });
            if (splitNumber) axes = { ...axes, xAxis: { ...value, splitNumber } };
        }
    }
    const visualMap = readColor && Array.isArray(option.visualMap?.inRange?.color) ? { visualMap: { ...option.visualMap, inRange: { ...option.visualMap.inRange, color: heatmapColors(option.visualMap.inRange.color, readColor) } } } : {};
    return { ...option, ...title, ...visualMap, tooltip, series, ...(axes.xAxis ? { xAxis: axes.xAxis } : {}), ...(axes.yAxis ? { yAxis: axes.yAxis } : {}), ...(legend ? { legend } : {}), ...(grid ? { grid } : {}), ...(slider ? { dataZoom: [slider] } : {}), animationDuration: style.getPropertyValue("--pk-duration").trim() === "0ms" ? 0 : 400, axisEvery };
}

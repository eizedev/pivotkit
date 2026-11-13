/*
 * A report's marks on the ECharts option of toEChartsOption: the theme's colours (the --pk-* tokens),
 * rounded bars, the tooltip in the theme and the axis labels laid out for the chart's size
 * (chart-layout.js). The same look on the screen (pivotkit-react, which adds its DOM tooltip), in an
 * SVG and in a printed report (pivotkit-report). The entry point "pivotkit-core/chart": only a drawn
 * chart needs it, so a report's first load does not.
 */

import { BOTTOM_LEGEND_ROOM, CATEGORY_LABEL_WIDTH, RIGHT_LEGEND_MIN_WIDTH, categoryLabelLayout, columnLabelLayout, groupLabelsFit, heatmapCellLabels, pieLabelRoom, ringLabelsFit, rowLabelInterval } from "./chart-layout.js";

export * from "./chart-layout.js";

/** A copy of an object without the given keys. */
const without = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/**
 * Mark styles on top of the core's option: rounded bar ends, 2 px lines, tooltips in the theme, built
 * as DOM nodes (chart-tooltip.js) so a strict Content-Security-Policy allows them.
 * @param {any} option  toEChartsOption()'s
 * @param {{ getPropertyValue(name: string): string }} style  the --pk-* tokens: a report's computed
 *   style, or a map of tokens wrapped (pivotkit-report)
 * @param {{ height?: number, width?: number, categoryNames?: string[], axisLabels?: string,
 *   tooltipFormatter?: (context: { valueFormatter?: (v: unknown) => string, xNames?: string[], yNames?: string[], categoryNames?: string[] }) => unknown }} [size]
 *   height and width: the chart's size in px (the room around a pie, a heatmap's column names, the
 *   category axis); categoryNames: the categories' whole names (the tooltip's title when the axis
 *   writes them shorter); axisLabels: the view's chart.axisLabels; tooltipFormatter: builds the
 *   tooltip's formatter (pivotkit-react's DOM tooltip), left out for a chart without one (an SVG)
 * @returns {any}  the option; `axisEvery` (not ECharts') is n when the category axis writes every n-th label
 */
export function decorateOption(option, style, { height = 480, width = 800, categoryNames, axisLabels, tooltipFormatter } = {}) {
    const extra = { categoryNames, axisLabels };
    const first = (a) => (Array.isArray(a) ? a[0] : a);
    const v = (name) => style.getPropertyValue(name).trim();
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
    const tooltip = {
        ...option.tooltip,
        backgroundColor: v("--pk-surface-raised") || surface,
        borderColor: v("--pk-border") || undefined,
        textStyle: { color: v("--pk-text") || undefined, fontFamily: style.getPropertyValue("font-family") || undefined },
        extraCssText: `box-shadow: ${v("--pk-shadow") || "none"}; border-radius: 8px;`,
        ...(tooltipFormatter ? { formatter: tooltipFormatter({ valueFormatter: option.tooltip?.valueFormatter, xNames: first(option.xAxis)?.data, yNames: first(option.yAxis)?.data, categoryNames: extra.categoryNames }) } : {})
    };
    const series = (option.series || []).map((s) => {
        if (s.type === "bar") {
            const horizontal = first(option.yAxis)?.type === "category";
            const r = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
            return { ...s, barMaxWidth: 48, itemStyle: { borderRadius: s.stack ? 0 : r, borderColor: s.stack ? surface : undefined, borderWidth: s.stack ? 1 : 0 }, emphasis: { focus: "series" } };
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
            let line = s.labelLine;
            if (label?.position === "inside" && label.show !== false && Array.isArray(s.radius)) {
                const box = { width: width - (typeof s.right === "number" ? s.right : 0), height: height - top - bottom };
                const total = (s.data || []).reduce((sum, d) => sum + (typeof d.value === "number" ? d.value : 0), 0);
                const texts = typeof label.formatter === "function" ? (s.data || []).map((d) => label.formatter({ name: d.name, value: d.value, percent: total ? (d.value / total) * 100 : 0 })) : [];
                if (!ringLabelsFit(s.radius, box, texts)) {
                    label = without(label, ["position"]);
                    line = { show: true };
                }
            }
            return { ...s, top, bottom, labelLine: line, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 4 }, label: { ...label, color: label?.position === "inside" ? undefined : v("--pk-text") || undefined } };
        }
        if (s.type === "heatmap") {
            // numbers only in cells large enough for them (heatmapCellLabels); the tooltip has every one
            const texts = typeof s.label?.formatter === "function" ? s.data.map((/** @type {any} */ d) => s.label.formatter({ value: d })) : [];
            const fits = heatmapCellLabels(option.xAxis?.data?.length ?? 1, option.yAxis?.data?.length ?? 1, width, height, texts);
            return { ...s, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 3 }, label: { ...s.label, show: Boolean(s.label?.show) && fits, color: v("--pk-text") || undefined } };
        }
        return s;
    });
    const legend = option.legend ? { ...option.legend, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { ...option.legend.textStyle, color: v("--pk-text") || undefined } } : undefined;
    const grid = option.grid ? { left: 12, right: 24, bottom: option.visualMap ? 64 : 12, containLabel: true, ...option.grid } : undefined;
    // a heatmap names every column: slanted where they would overlap (columnLabelLayout)
    const heatmap = series.some((s) => s.type === "heatmap") && option.xAxis?.axisLabel;
    const xAxis = heatmap ? { ...option.xAxis, axisLabel: { ...option.xAxis.axisLabel, ...columnLabelLayout(option.xAxis.data ?? [], width) } } : option.xAxis;
    // and its rows: every name where a line fits each row, else every n-th (rowLabelInterval)
    const yAxis = heatmap && option.yAxis ? { ...option.yAxis, axisLabel: { ...option.yAxis.axisLabel, interval: rowLabelInterval(option.yAxis.data?.length ?? 0, height) } } : option.yAxis;
    // a long title ends in "…" within the chart's width (the PNG is drawn from the same option)
    const title = option.title ? { title: { ...option.title, textStyle: { ...option.title.textStyle, width: Math.max(40, width - 32), overflow: "truncate" } } } : {};
    // bars, lines and areas: the category axis writes every label that fits (categoryLabelLayout), the
    // group labels sit below (or left of) those labels
    let axes = { xAxis, yAxis };
    let axisEvery = 1;
    const along = !heatmap && series.some((s) => s.type === "bar" || s.type === "line") ? (first(option.yAxis)?.type === "category" ? "yAxis" : first(option.xAxis)?.type === "category" ? "xAxis" : null) : null;
    if (along) {
        let list = Array.isArray(axes[along]) ? axes[along] : [axes[along]];
        // "auto" group labels need room: below it the axis writes the whole names instead
        const group = list[1]?.groups ? list[1] : null;
        if (group && group.groupsAuto && !groupLabelsFit(list[0].data?.length ?? 0, group.groupSize ?? 1, { width, height, horizontal: along === "yAxis" })) {
            list = [{ ...list[0], data: extra.categoryNames ?? list[0].data }];
        }
        const names = list[0].data ?? [];
        const layout = categoryLabelLayout(names, { width, height, horizontal: along === "yAxis", mode: extra.axisLabels });
        axisEvery = layout.every;
        const longest = Math.min(CATEGORY_LABEL_WIDTH, Math.max(0, ...names.map((t) => String(t).length)) * 12 * 0.55);
        const offset = along === "yAxis" ? Math.round(longest) + 16 : layout.rotate ? Math.round(longest * 0.71) + 14 : 24;
        const main = { ...list[0], axisLabel: { ...list[0].axisLabel, rotate: layout.rotate, interval: layout.interval, width: layout.width, overflow: layout.overflow } };
        // a group's name is cut to the room of its smallest group, so two names never run into each other
        const slot = (along === "yAxis" ? Math.max(0, height - 60) : Math.max(0, width - 80)) / Math.max(1, names.length);
        const groupWidth = along === "yAxis" ? CATEGORY_LABEL_WIDTH : Math.max(24, Math.round(slot * (list[1]?.groupSize ?? 1)) - 8);
        const rest = list.slice(1).map((a) => (a.groups ? { ...a, offset, axisTick: { ...a.axisTick, length: offset }, axisLabel: { ...a.axisLabel, width: groupWidth, overflow: "truncate" } } : a));
        axes = { ...axes, [along]: rest.length ? [main, ...rest] : main };
    }
    return { ...option, ...title, tooltip, series, ...(axes.xAxis ? { xAxis: axes.xAxis } : {}), ...(axes.yAxis ? { yAxis: axes.yAxis } : {}), ...(legend ? { legend } : {}), ...(grid ? { grid } : {}), animationDuration: style.getPropertyValue("--pk-duration").trim() === "0ms" ? 0 : 400, axisEvery };
}

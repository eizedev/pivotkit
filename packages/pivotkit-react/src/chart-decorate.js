/*
 * The report's marks on pivotkit-core's ECharts option: the theme's colours (the --pk-* tokens),
 * rounded bars, tooltips built as DOM nodes (chart-tooltip.js, so a strict Content-Security-Policy
 * allows them) and the axis labels laid out for the chart's size (chart-types.js). Only a drawn chart
 * needs it: it loads with ECharts (echarts.js).
 */

import { tooltipFormatter } from "./chart-tooltip.js";
import { CATEGORY_LABEL_WIDTH, categoryLabelLayout, columnLabelLayout, groupLabelsFit, heatmapCellLabels, pieLabelRoom, rowLabelInterval } from "./chart-types.js";

/**
 * Mark styles on top of the core's option: rounded bar ends, 2 px lines, tooltips in the theme, built
 * as DOM nodes (chart-tooltip.js) so a strict Content-Security-Policy allows them.
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
    const first = (a) => (Array.isArray(a) ? a[0] : a);
    const v = (name) => style.getPropertyValue(name).trim();
    // without the stylesheet the tokens are empty and ECharts keeps its own colours
    const surface = v("--pk-surface") || undefined;
    const tooltip = {
        ...option.tooltip,
        backgroundColor: v("--pk-surface-raised") || surface,
        borderColor: v("--pk-border") || undefined,
        textStyle: { color: v("--pk-text") || undefined, fontFamily: style.getPropertyValue("font-family") || undefined },
        extraCssText: `box-shadow: ${v("--pk-shadow") || "none"}; border-radius: 8px;`,
        ...(doc ? { formatter: tooltipFormatter(doc, { valueFormatter: option.tooltip?.valueFormatter, xNames: first(option.xAxis)?.data, yNames: first(option.yAxis)?.data, categoryNames: extra.categoryNames }) } : {})
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
            return { ...s, top, bottom, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 4 }, label: { ...s.label, color: s.label?.position === "inside" ? undefined : v("--pk-text") || undefined } };
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

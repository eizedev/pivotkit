/*
 * The chart's tooltip as DOM nodes instead of ECharts' HTML string. ECharts writes its default tooltip
 * with innerHTML and inline `style` attributes, which a Content-Security-Policy without
 * `style-src 'unsafe-inline'` blocks (style-src-attr). Nodes built here carry their styles through the
 * CSSOM (`element.style`), which such a policy allows, and every text from the data goes in as
 * `textContent`, so it is never read as markup. tooltipContent() is pure (tested with node --test);
 * tooltipFormatter() builds the nodes in the chart's document.
 */

import { referenceLineChecks, referenceLines } from "pivotkit-core/chart";
import { valueAddsUp } from "pivotkit-core";

// whether a value adds up, so a stack of it has a total: the rule of the stack's reference lines too
export { valueAddsUp };

/**
 * @typedef {object} TooltipLine
 * @property {string | null} color  the series' or slice's colour, null when it is not a plain colour
 * @property {string} name
 * @property {string} value
 * @property {boolean} [hovered]  the element under the pointer, among other lines
 * @property {string} [share]  a part's share of its 100 % stack
 */

/**
 * @typedef {object} TooltipReference  a reference line of the chart (pivotkit-core's referenceLines)
 * @property {string} name  "Average", "Average (A)" when the chart has more than one series
 * @property {number | null} series  the series it belongs to; null for a target or a stack's total
 * @property {string | null} color  for a line of no series; a series' line takes its series' colour
 * @property {(dataIndex: number) => string | null} value  its value at a category, null where it has none
 */

/**
 * @typedef {object} TooltipOptions
 * @property {(v: unknown) => string} [valueFormatter]  the core's
 * @property {(v: number) => string} [shareFormatter]  the core's, on a 100 % stack: a share as the locale writes it
 * @property {string[]} [xNames]  a heatmap's column names
 * @property {string[]} [yNames]  a heatmap's row names
 * @property {string[]} [categoryNames]  each category's whole name, for an axis that writes them shorter
 * @property {string} [mode]  chart.tooltip: "auto" (the element under the pointer wins) or "axis"
 *   (every series at the category)
 * @property {Array<{ type?: string, stack?: string, additive?: boolean }>} [series]  each series' type,
 *   stack and whether its values add up (additive false: an average, a median; no total then)
 * @property {{ seriesIndex: number, dataIndex: number } | null} [hover]  the element under the pointer
 * @property {string} [totalLabel]  the name of a stack's total
 * @property {number} [maxLines]  the most series lines that fit; more are cut, with `moreLabel`
 * @property {string} [moreLabel]  "+{count} more": the line that says how many were cut
 * @property {string} [moreInTotalLabel]  the same line when a total is shown: the cut ones are in it
 * @property {TooltipReference[]} [references]  the chart's reference lines (tooltipReferences)
 */

/**
 * A reference line's name: a series' line with the series' name when there is more than one series
 * ("Average (A)").
 * @param {ReturnType<typeof import("pivotkit-core/chart").referenceLines>[number]} line
 * @param {string[]} seriesNames
 */
const lineName = (line, seriesNames) => (line.series !== null && seriesNames.length > 1 ? `${line.name} (${seriesNames[line.series]})` : line.name);

/**
 * The reference lines in the chart's text alternative (chart-summary.js), named as the tooltip names
 * them: "Reference lines: Average 25; Trend from 10 to 40; Target 35." Empty without lines.
 * @param {ReturnType<typeof import("pivotkit-core/chart").referenceLines>} lines  pivotkit-core's referenceLines
 * @param {string[]} seriesNames  the chart's series, by index
 * @param {{ chartLines: string, chartTrendSpan: string }} labels
 */
export function linesSummary(lines, seriesNames, labels) {
    // the placeholders filled as the tooltip's "+{count} more" (a function: a "$" in a currency is no
    // pattern); labels.js's fill would split the first load's labels into a chunk of their own
    const value = (/** @type {(typeof lines)[number]} */ l) => (l.kind === "trend" ? labels.chartTrendSpan.replace("{from}", () => l.format(/** @type {number} */ (l.from))).replace("{to}", () => l.format(/** @type {number} */ (l.to))) : l.format(/** @type {number} */ (l.value)));
    return lines.length ? labels.chartLines.replace("{lines}", () => lines.map((l) => `${lineName(l, seriesNames)} ${value(l)}`).join("; ")) : "";
}

/**
 * A drawn chart's reference lines (chart.jsx): the lines as numbers for the tooltip, their sentence
 * for the text alternative (linesSummary) and which ones the chart can draw, with the first series'
 * format (pivotkit-core's referenceLineChecks), for the Display menu.
 * @param {import("pivotkit-core").PivotResult} result
 * @param {{ series: ReturnType<typeof import("pivotkit-core").toSeries>, chart?: { type: string, stacked: boolean, horizontal: boolean } | null, labels: any, locale: string }} options
 * @returns {{ lines: ReturnType<typeof referenceLines>, text: string, checks: ReturnType<typeof referenceLineChecks> & { format?: string } }}
 */
export function chartLines(result, { series, chart, labels, locale }) {
    const drawn = chart ? { chart } : {};
    const lines = referenceLines(result, { series, words: labels.core.referenceLines, locale, ...drawn });
    return {
        lines,
        text: linesSummary(lines, series.series.map((x) => x.name), labels),
        // the format of the first series the legend shows
        checks: { ...referenceLineChecks(result, { series, ...drawn }), format: series.series.find((x) => !(/** @type {any} */ (result.view.chart).hidden ?? []).includes(x.name))?.format }
    };
}

/**
 * The reference lines as the tooltip names them: a series' line by its name and the series' name
 * when there is more than one series ("Average (A)"); a trend's value at a category between its
 * first and last, an average's and a target's everywhere.
 * @param {ReturnType<typeof import("pivotkit-core/chart").referenceLines>} lines  pivotkit-core's referenceLines
 * @param {string[]} seriesNames  the chart's series, by index
 * @param {string | null} color  the colour of a line of no series (--pk-chart-reference)
 * @returns {TooltipReference[]}
 */
export function tooltipReferences(lines, seriesNames, color) {
    return lines.map((line) => ({
        name: lineName(line, seriesNames),
        series: line.series,
        color: line.series === null ? color : null,
        value: (i) => {
            if (line.kind !== "trend") {
                return line.format(/** @type {number} */ (line.value));
            }
            return i >= /** @type {number} */ (line.first) && i <= /** @type {number} */ (line.last) && line.at ? line.format(line.at(i)) : null;
        }
    }));
}

/** A number to show: ECharts hands null (or "-") for a series without a value at the category. */
const hasValue = (v) => typeof v === "number" && Number.isFinite(v);

/** Whether a part is a 100 % stack's: it draws its share and keeps its value as `raw` (pivotkit-core). */
const isShare = (p) => p.data !== null && typeof p.data === "object" && typeof p.data.raw === "number";
/** A part's own value. */
const rawOf = (p) => (isShare(p) ? p.data.raw : p.value);

/**
 * The items of a bar, line or area tooltip (trigger "axis": one item per series at the category):
 * - "auto" with an element under the pointer: that element alone
 * - "auto" between stacked bars: none, the total says it (every item when there is no total)
 * - else every item, the hovered one first and marked
 * A series without a value at the category is left out. A stack adds the sum of its parts as its
 * total, unless a part's values do not add up (an average, a median).
 * @param {any[]} params
 * @param {Required<Pick<TooltipOptions, "valueFormatter" | "mode" | "series" | "totalLabel">> & { hover: TooltipOptions["hover"] }} options
 */
function axisItems(params, { valueFormatter, mode, series, hover, totalLabel }) {
    const items = params.filter(Boolean);
    const stackOf = (p) => series[p.seriesIndex]?.stack;
    const hit = hover ? items.find((p) => p.seriesIndex === hover.seriesIndex && p.dataIndex === hover.dataIndex) : undefined;
    const auto = mode !== "axis";
    const stack = (hit ? [hit] : items).map(stackOf).find(Boolean);
    const parts = stack ? items.filter((p) => stackOf(p) === stack) : [];
    const sums = parts.length > 0 && parts.every((p) => series[p.seriesIndex]?.additive !== false);
    const counted = sums ? parts.filter((p) => hasValue(p.value)) : [];
    const gap = auto && !hit && counted.length > 0 && items.length > 1 && items.every((p) => series[p.seriesIndex]?.type === "bar" && stackOf(p));
    const shown = auto && hit ? [hit] : gap ? [] : hit ? [hit, ...items.filter((p) => p !== hit)] : items;
    const lines = shown.filter((p) => hasValue(p.value));
    return {
        lines: lines.map((p) => ({ p, hovered: p === hit && lines.length > 1 })),
        total: counted.length ? { name: totalLabel, value: valueFormatter(counted.reduce((sum, p) => sum + rawOf(p), 0)) } : null
    };
}

/**
 * The reference lines a tooltip of bars, lines and areas names at the category of `params`: with an
 * element under the pointer ("auto"), its series' lines and the lines of no series; else every line.
 * A series' line takes the colour its series is drawn in.
 * @param {any[]} params
 * @param {TooltipReference[]} references
 * @param {string} mode
 * @param {TooltipOptions["hover"]} hover
 * @returns {TooltipLine[]}
 */
function referenceItems(params, references, mode, hover) {
    const at = params.find(Boolean);
    if (!at || !references.length) {
        return [];
    }
    const hit = mode !== "axis" && hover ? params.find((p) => p && p.seriesIndex === hover.seriesIndex && p.dataIndex === hover.dataIndex) : undefined;
    const colorOf = (/** @type {number} */ i) => params.find((p) => p && p.seriesIndex === i)?.color;
    return references.flatMap((r) => {
        const value = r.value(at.dataIndex);
        if (value === null || (hit && r.series !== null && r.series !== hit.seriesIndex)) {
            return [];
        }
        const color = r.series === null ? r.color : colorOf(r.series);
        return [{ color: typeof color === "string" ? color : null, name: r.name, value }];
    });
}

/**
 * What a tooltip shows for ECharts' formatter parameters: a title, one line per series or slice and,
 * for a stack, its total; on bars, lines and areas the reference lines at the category.
 * @param {any} params  one item (trigger "item") or a list (trigger "axis")
 * @param {TooltipOptions} [options]
 * @returns {{ title: string, lines: TooltipLine[], more?: string, total?: { name: string, value: string }, references?: TooltipLine[] }}
 */
export function tooltipContent(params, { valueFormatter = (v) => String(v ?? ""), shareFormatter, xNames = [], yNames = [], categoryNames = [], mode = "auto", series = [], hover = null, totalLabel = "Total", maxLines = Infinity, moreLabel = "+{count}", moreInTotalLabel = moreLabel, references = [] } = {}) {
    const color = (p) => (typeof p.color === "string" ? p.color : null);
    const text = (v) => (v === null || v === undefined ? "" : String(v));
    if (Array.isArray(params)) {
        const first = params[0];
        const { lines, total } = axisItems(params, { valueFormatter, mode, series, hover, totalLabel });
        // more lines than fit: the first ones, and a line that says how many more
        const cut = lines.length > maxLines ? lines.length - Math.max(1, maxLines - 1) : 0;
        const kept = cut ? lines.slice(0, lines.length - cut) : lines;
        const refs = referenceItems(params, references, mode, hover);
        return {
            title: first ? text(categoryNames[first.dataIndex] ?? first.axisValueLabel ?? first.name) : "",
            lines: kept.map(({ p, hovered }) => ({ color: color(p), name: text(p.seriesName), value: valueFormatter(rawOf(p)), ...(shareFormatter && isShare(p) ? { share: shareFormatter(p.value) } : {}), ...(hovered ? { hovered } : {}) })),
            ...(cut ? { more: (total ? moreInTotalLabel : moreLabel).replace("{count}", String(cut)) } : {}),
            ...(total ? { total } : {}),
            ...(refs.length ? { references: refs } : {})
        };
    }
    if (params && params.seriesType === "heatmap" && Array.isArray(params.value)) {
        const [x, y, v] = params.value;
        return {
            title: text(params.seriesName),
            lines: [{ color: color(params), name: [yNames[y], xNames[x]].filter((n) => n !== undefined).map(text).join(", "), value: valueFormatter(v) }]
        };
    }
    return {
        title: text(params?.seriesName),
        lines: params ? [{ color: color(params), name: text(params.name), value: valueFormatter(params.value) }] : []
    };
}

/**
 * A tooltip formatter for ECharts that returns DOM nodes (see the top of this module).
 * @param {Document} doc  the chart's document
 * @param {TooltipOptions & { hoverOf?: () => TooltipOptions["hover"] }} options  hoverOf: the element
 *   under the pointer when ECharts asks (the chart's hover state), instead of a fixed `hover`
 * @returns {(params: any) => HTMLElement}
 */
export function tooltipFormatter(doc, { hoverOf, ...options }) {
    /** One line: a round marker in the series' colour, the name, the value in the strong weight. */
    const row = (/** @type {{ color?: string | null, name: string, value: string, share?: string, hovered?: boolean }} */ line) => {
        const el = doc.createElement("div");
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.gap = "8px";
        const marker = doc.createElement("span");
        marker.style.display = "inline-block";
        marker.style.width = "10px";
        marker.style.height = "10px";
        marker.style.borderRadius = "50%";
        marker.style.flex = "none";
        if (line.color) {
            marker.style.backgroundColor = line.color;
        }
        const name = doc.createElement("span");
        name.textContent = line.name;
        name.style.flex = "1";
        // a long series name ends in "…"; the table and the legend have it whole
        name.style.maxWidth = "var(--pk-tooltip-name-w)";
        name.style.overflow = "hidden";
        name.style.textOverflow = "ellipsis";
        name.style.whiteSpace = "nowrap";
        if (line.hovered) {
            name.style.fontWeight = "var(--pk-weight-strong)";
        }
        const value = doc.createElement("span");
        value.textContent = line.value;
        value.style.fontWeight = "var(--pk-weight-strong)";
        value.style.marginLeft = "12px";
        el.append(marker, name, value);
        if (line.share) {
            // a 100 % stack's part: its share after its value, in the muted colour
            const share = doc.createElement("span");
            share.textContent = line.share;
            share.style.color = "var(--pk-muted)";
            share.style.marginLeft = "8px";
            el.append(share);
        }
        return el;
    };
    return (params) => {
        const { title, lines, more, total, references } = tooltipContent(params, hoverOf ? { ...options, hover: hoverOf() } : options);
        const box = doc.createElement("div");
        if (title) {
            const head = doc.createElement("div");
            head.textContent = title;
            head.style.fontWeight = "var(--pk-weight-strong)";
            head.style.marginBottom = "2px";
            box.append(head);
        }
        for (const line of lines) {
            box.append(row(line));
        }
        if (more) {
            const rest = doc.createElement("div");
            rest.textContent = more;
            rest.style.color = "var(--pk-muted)";
            box.append(rest);
        }
        /** A line below a rule: the total, the first reference line. */
        const ruled = (/** @type {HTMLElement} */ el) => {
            el.style.borderTop = "1px solid var(--pk-border)";
            el.style.marginTop = "4px";
            el.style.paddingTop = "4px";
            return el;
        };
        if (total) {
            // the stack's total under a rule, all of it in the strong weight; its marker keeps the column.
            // Its size is the tooltip's, as every line's: the chart's text size, resolved in px
            const sum = ruled(row(total));
            sum.style.fontWeight = "var(--pk-weight-strong)";
            box.append(sum);
        }
        // the reference lines under a rule of their own
        (references ?? []).forEach((line, i) => box.append(i === 0 ? ruled(row(line)) : row(line)));
        return box;
    };
}

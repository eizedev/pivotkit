/*
 * The chart's tooltip as DOM nodes instead of ECharts' HTML string. ECharts writes its default tooltip
 * with innerHTML and inline `style` attributes, which a Content-Security-Policy without
 * `style-src 'unsafe-inline'` blocks (style-src-attr). Nodes built here carry their styles through the
 * CSSOM (`element.style`), which such a policy allows, and every text from the data goes in as
 * `textContent`, so it is never read as markup. tooltipContent() is pure (tested with node --test);
 * tooltipFormatter() builds the nodes in the chart's document.
 */

import { valueAddsUp } from "./adds-up.js";

export { valueAddsUp };

/**
 * @typedef {object} TooltipLine
 * @property {string | null} color  the series' or slice's colour, null when it is not a plain colour
 * @property {string} name
 * @property {string} value
 * @property {boolean} [hovered]  the element under the pointer, among other lines
 * @property {string} [share]  its share: of the total (chart.tooltipShare), or of its 100 % stack
 */

/**
 * @typedef {object} TooltipOptions
 * @property {(v: unknown) => string} [valueFormatter]  the core's
 * @property {(v: number) => string} [shareFormatter]  the core's: a share in percent as the locale writes it
 * @property {boolean} [share]  chart.tooltipShare: each line with its share of the total
 * @property {number[]} [seriesTotals]  each series' total over the categories: the share of a chart with one series
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
 */

/** A number to show: ECharts hands null (or "-") for a series without a value at the category. */
const hasValue = (v) => typeof v === "number" && Number.isFinite(v);

/** Whether a part is a 100 % stack's: it draws its share and keeps its value as `raw` (pivotkit-core). */
const isShare = (p) => p.data !== null && typeof p.data === "object" && typeof p.data.raw === "number";
/** A part's own value. */
const rawOf = (p) => (isShare(p) ? p.data.raw : p.value);

/**
 * The share of each item, in percent, by item; empty where a share means nothing: a value that does
 * not add up, a part below zero, a total of nothing. The basis follows the chart's series: a chart of
 * one series shares its own total over the categories (`seriesTotals`); a chart of several shares the
 * category's total, and a category with one part left (the others empty or hidden) has no share.
 * @param {any[]} items  ECharts' parameters at the category (the series shown)
 * @param {{ series: TooltipOptions["series"], seriesTotals?: number[] }} options
 * @returns {Map<any, number>}
 */
function sharesOf(items, { series = [], seriesTotals = [] }) {
    // each part's own value: a 100 % stack draws its share and keeps the value (rawOf)
    const parts = items.filter((p) => hasValue(p.value));
    if (!parts.length || parts.some((p) => rawOf(p) < 0 || series[p.seriesIndex]?.additive !== true)) {
        return new Map();
    }
    if (series.length > 1 && parts.length < 2) {
        return new Map();
    }
    const total = series.length > 1 ? parts.reduce((sum, p) => sum + rawOf(p), 0) : seriesTotals[parts[0].seriesIndex];
    return typeof total === "number" && total > 0 ? new Map(parts.map((p) => [p, (rawOf(p) / total) * 100])) : new Map();
}

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
 * What a tooltip shows for ECharts' formatter parameters: a title, one line per series or slice and,
 * for a stack, its total.
 * @param {any} params  one item (trigger "item") or a list (trigger "axis")
 * @param {TooltipOptions} [options]
 * @returns {{ title: string, lines: TooltipLine[], more?: string, total?: { name: string, value: string } }}
 */
export function tooltipContent(params, { valueFormatter = (v) => String(v ?? ""), shareFormatter, share = false, seriesTotals, xNames = [], yNames = [], categoryNames = [], mode = "auto", series = [], hover = null, totalLabel = "Total", maxLines = Infinity, moreLabel = "+{count}", moreInTotalLabel = moreLabel } = {}) {
    const color = (p) => (typeof p.color === "string" ? p.color : null);
    const text = (v) => (v === null || v === undefined ? "" : String(v));
    if (Array.isArray(params)) {
        const first = params[0];
        const { lines, total } = axisItems(params, { valueFormatter, mode, series, hover, totalLabel });
        const shares = share && shareFormatter ? sharesOf(params.filter(Boolean), { series, seriesTotals }) : new Map();
        // more lines than fit: the first ones, and a line that says how many more
        const cut = lines.length > maxLines ? lines.length - Math.max(1, maxLines - 1) : 0;
        const kept = cut ? lines.slice(0, lines.length - cut) : lines;
        return {
            title: first ? text(categoryNames[first.dataIndex] ?? first.axisValueLabel ?? first.name) : "",
            // a share of the total (chart.tooltipShare), else a 100 % stack's part its share of the stack as drawn
            lines: kept.map(({ p, hovered }) => {
                const part = shares.get(p) ?? (shareFormatter && isShare(p) ? p.value : undefined);
                return { color: color(p), name: text(p.seriesName), value: valueFormatter(rawOf(p)), ...(part !== undefined && shareFormatter ? { share: shareFormatter(part) } : {}), ...(hovered ? { hovered } : {}) };
            }),
            ...(cut ? { more: (total ? moreInTotalLabel : moreLabel).replace("{count}", String(cut)) } : {}),
            ...(total ? { total } : {})
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
        // a slice's share: ECharts' percent of the slices shown
        // a slice's share only where its values add up, as a stack's (an average has none)
        lines: params ? [{ color: color(params), name: text(params.name), value: valueFormatter(params.value), ...(share && shareFormatter && hasValue(params.percent) && series[params.seriesIndex ?? 0]?.additive === true ? { share: shareFormatter(params.percent) } : {}) }] : []
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
            // its share after the value, in the muted colour
            const share = doc.createElement("span");
            share.textContent = line.share;
            share.style.color = "var(--pk-muted)";
            share.style.marginLeft = "8px";
            el.append(share);
        }
        return el;
    };
    return (params) => {
        const { title, lines, more, total } = tooltipContent(params, hoverOf ? { ...options, hover: hoverOf() } : options);
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
        if (total) {
            // the stack's total under a rule, all of it in the strong weight; its marker keeps the column.
            // Its size is the tooltip's, as every line's: the chart's text size, resolved in px
            const sum = row(total);
            sum.style.borderTop = "1px solid var(--pk-border)";
            sum.style.marginTop = "4px";
            sum.style.paddingTop = "4px";
            sum.style.fontWeight = "var(--pk-weight-strong)";
            box.append(sum);
        }
        return box;
    };
}

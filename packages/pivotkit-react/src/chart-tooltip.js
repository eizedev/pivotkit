/*
 * The chart's tooltip as DOM nodes instead of ECharts' HTML string. ECharts writes its default tooltip
 * with innerHTML and inline `style` attributes, which a Content-Security-Policy without
 * `style-src 'unsafe-inline'` blocks (style-src-attr). Nodes built here carry their styles through the
 * CSSOM (`element.style`), which such a policy allows, and every text from the data goes in as
 * `textContent`, so it is never read as markup. tooltipContent() is pure (tested with node --test);
 * tooltipFormatter() builds the nodes in the chart's document.
 */

/**
 * @typedef {object} TooltipLine
 * @property {string | null} color  the series' or slice's colour, null when it is not a plain colour
 * @property {string} name
 * @property {string} value
 * @property {boolean} [hovered]  the element under the pointer, among other lines
 */

/**
 * @typedef {object} TooltipOptions
 * @property {(v: unknown) => string} [valueFormatter]  the core's
 * @property {string[]} [xNames]  a heatmap's column names
 * @property {string[]} [yNames]  a heatmap's row names
 * @property {string[]} [categoryNames]  each category's whole name, for an axis that writes them shorter
 * @property {string} [mode]  chart.tooltip: "auto" (the element under the pointer wins) or "axis"
 *   (every series at the category)
 * @property {Array<{ type?: string, stack?: string }>} [series]  each series' type and stack, by index
 * @property {{ seriesIndex: number, dataIndex: number } | null} [hover]  the element under the pointer
 * @property {string} [totalLabel]  the name of a stack's total
 */

/** A number to show: ECharts hands null (or "-") for a series without a value at the category. */
const hasValue = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * The items of a bar, line or area tooltip (trigger "axis": one item per series at the category):
 * - "auto" with an element under the pointer: that element alone
 * - "auto" between stacked bars: none (the total says it)
 * - else every item; the hovered one marked when it is among others
 * A series without a value at the category is left out. A stack adds a "total" of every item in it.
 * @param {any[]} params
 * @param {Required<Pick<TooltipOptions, "valueFormatter" | "mode" | "series" | "totalLabel">> & { hover: TooltipOptions["hover"] }} options
 */
function axisItems(params, { valueFormatter, mode, series, hover, totalLabel }) {
    const items = params.filter(Boolean);
    const stackOf = (p) => series[p.seriesIndex]?.stack;
    const hit = hover ? items.find((p) => p.seriesIndex === hover.seriesIndex && p.dataIndex === hover.dataIndex) : undefined;
    const auto = mode !== "axis";
    const shown = auto && hit ? [hit] : auto && items.length > 1 && items.every((p) => series[p.seriesIndex]?.type === "bar" && stackOf(p)) ? [] : items;
    const lines = shown.filter((p) => hasValue(p.value));
    const stack = (shown.length ? shown : items).map(stackOf).find(Boolean);
    const parts = stack ? items.filter((p) => stackOf(p) === stack && hasValue(p.value)) : [];
    return {
        lines: lines.map((p) => ({ p, hovered: p === hit && lines.length > 1 })),
        total: parts.length ? { name: totalLabel, value: valueFormatter(parts.reduce((sum, p) => sum + p.value, 0)) } : null
    };
}

/**
 * What a tooltip shows for ECharts' formatter parameters: a title, one line per series or slice and,
 * for a stack, its total.
 * @param {any} params  one item (trigger "item") or a list (trigger "axis")
 * @param {TooltipOptions} [options]
 * @returns {{ title: string, lines: TooltipLine[], total?: { name: string, value: string } }}
 */
export function tooltipContent(params, { valueFormatter = (v) => String(v ?? ""), xNames = [], yNames = [], categoryNames = [], mode = "auto", series = [], hover = null, totalLabel = "Total" } = {}) {
    const color = (p) => (typeof p.color === "string" ? p.color : null);
    const text = (v) => (v === null || v === undefined ? "" : String(v));
    if (Array.isArray(params)) {
        const first = params[0];
        const { lines, total } = axisItems(params, { valueFormatter, mode, series, hover, totalLabel });
        return {
            title: first ? text(categoryNames[first.dataIndex] ?? first.axisValueLabel ?? first.name) : "",
            lines: lines.map(({ p, hovered }) => ({ color: color(p), name: text(p.seriesName), value: valueFormatter(p.value), ...(hovered ? { hovered } : {}) })),
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
    const row = (/** @type {{ color?: string | null, name: string, value: string, hovered?: boolean }} */ line) => {
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
        if (line.hovered) {
            name.style.fontWeight = "var(--pk-weight-strong)";
        }
        const value = doc.createElement("span");
        value.textContent = line.value;
        value.style.fontWeight = "var(--pk-weight-strong)";
        value.style.marginLeft = "12px";
        el.append(marker, name, value);
        return el;
    };
    return (params) => {
        const { title, lines, total } = tooltipContent(params, hoverOf ? { ...options, hover: hoverOf() } : options);
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
        if (total) {
            // the stack's total under a rule, all of it in the strong weight; its marker keeps the column
            const sum = row(total);
            sum.style.borderTop = "1px solid var(--pk-border)";
            sum.style.marginTop = "4px";
            sum.style.paddingTop = "4px";
            sum.style.fontWeight = "var(--pk-weight-strong)";
            sum.style.fontSize = "var(--pk-chart-text-size)";
            box.append(sum);
        }
        return box;
    };
}

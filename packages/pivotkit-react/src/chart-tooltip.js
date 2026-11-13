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
 */

/**
 * What a tooltip shows for ECharts' formatter parameters: a title and one line per series or slice.
 * @param {any} params  one item (trigger "item") or a list (trigger "axis")
 * @param {{ valueFormatter?: (v: unknown) => string, xNames?: string[], yNames?: string[], categoryNames?: string[] }} [options]
 *   valueFormatter: the core's; xNames, yNames: the categories of a heatmap's axes; categoryNames: the
 *   whole name of each category, for an axis that writes them shorter (cut, or without their group)
 * @returns {{ title: string, lines: TooltipLine[] }}
 */
export function tooltipContent(params, { valueFormatter = (v) => String(v ?? ""), xNames = [], yNames = [], categoryNames = [] } = {}) {
    const color = (p) => (typeof p.color === "string" ? p.color : null);
    const text = (v) => (v === null || v === undefined ? "" : String(v));
    if (Array.isArray(params)) {
        const first = params[0];
        return {
            title: first ? text(categoryNames[first.dataIndex] ?? first.axisValueLabel ?? first.name) : "",
            lines: params.map((p) => ({ color: color(p), name: text(p.seriesName), value: valueFormatter(p.value) }))
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
 * @param {Parameters<typeof tooltipContent>[1]} options
 * @returns {(params: any) => HTMLElement}
 */
export function tooltipFormatter(doc, options) {
    return (params) => {
        const { title, lines } = tooltipContent(params, options);
        const box = doc.createElement("div");
        if (title) {
            const head = doc.createElement("div");
            head.textContent = title;
            head.style.fontWeight = "var(--pk-weight-strong)";
            head.style.marginBottom = "2px";
            box.append(head);
        }
        for (const line of lines) {
            const row = doc.createElement("div");
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "8px";
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
            const value = doc.createElement("span");
            value.textContent = line.value;
            value.style.fontWeight = "var(--pk-weight-strong)";
            value.style.marginLeft = "12px";
            row.append(marker, name, value);
            box.append(row);
        }
        return box;
    };
}

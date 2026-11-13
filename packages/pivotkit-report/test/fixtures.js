// Made-up sales rows the report tests share: dates over two years (relative filters and date groupings
// have something to keep and to drop), a one-letter field (Q), a blank region, and hostile text.
import * as echarts from "echarts";

export { echarts };

export const SALES = [
    { Region: "North", Product: "A", Units: 3, Price: 10, Date: "2025-03-05", Q: 1 },
    { Region: "North", Product: "A", Units: 5, Price: 12, Date: "2025-11-20", Q: 2 },
    { Region: "North", Product: "B", Units: 2, Price: 20, Date: "2026-02-03", Q: 1 },
    { Region: "South", Product: "A", Units: 7, Price: 10, Date: "2026-02-14", Q: 3 },
    { Region: "South", Product: "B", Units: 1, Price: 25, Date: "2026-03-01", Q: 3 },
    { Region: "South", Product: "B", Units: 4, Price: 30, Date: "2026-09-09", Q: 2 },
    { Region: "West", Product: "A", Units: 4, Price: 11, Date: "2026-10-30", Q: 1 },
    { Region: null, Product: "A", Units: 6, Price: 9, Date: "2024-12-31", Q: 2 }
];

/** Text a cell, a field name or a title could hold to break out of its place in a report. */
export const HOSTILE = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "{{title}}", "]]><svg onload=alert(1)>", "\u001b]8;;http://x\u0007ESC"];

/** Rows whose region names and one field name are hostile. */
export const HOSTILE_ROWS = HOSTILE.map((name, i) => ({ Region: name, [HOSTILE[1]]: i + 1, Units: i + 1 }));

/** A fixed "now", locale and time zone: the same output on every run. */
export const FIXED = Object.freeze({ now: "2026-11-13T10:00:00Z", locale: "en-US", timeZone: "UTC" });

/** The texts of an SVG's <text> elements, entities read. */
export function svgTexts(svg) {
    const decode = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => decode(m[1]));
}

/** The start tags of an HTML or SVG text with their attribute names, outside any text. */
export function startTags(markup) {
    return [...markup.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g)].map((m) => ({
        name: m[1].toLowerCase(),
        attributes: [...m[2].replace(/=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, "").matchAll(/\s+([^\s=>/]+)/g)].map((a) => a[1].toLowerCase())
    }));
}

/** The text of the cells of an HTML table's body rows, entities read. */
export function bodyCells(html) {
    const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
    const decode = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    return [...body.matchAll(/<tr>(.*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((c) => decode(c[1])));
}

/** The view of the golden files: a date grouping on Columns, a relative filter, a data bar, a share of a total. */
export const GOLDEN_VIEW = {
    rows: ["Region", "Product"],
    cols: ["Year"],
    derived: [{ name: "Year", field: "Date", by: "year" }],
    values: [{ field: "Units", agg: "sum", conditional: { type: "dataBar" } }, { field: "Price", agg: "average", showAs: { type: "percentOfColumnTotal" } }],
    filters: [{ field: "Date", type: "relative", unit: "year", count: 2, includeCurrent: true }]
};

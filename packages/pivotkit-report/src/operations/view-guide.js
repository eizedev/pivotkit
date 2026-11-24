/*
 * How to write a view, for a model or a person: the view guide and example views built from a data
 * set's fields.
 */

import { CATALOG, isIdentifierName } from "pivotkit-core";

/**
 * Two or three views built from a data set's own fields, for a model or a person to start from: a
 * measure is a number field that is no identifier.
 * @param {Array<{ name: string, type: string }>} fields
 */
export function exampleViews(fields) {
    const text = fields.filter((f) => f.type === "string");
    const number = fields.filter((f) => f.type === "number" && !isIdentifierName(f.name));
    const date = fields.filter((f) => f.type === "date");
    const out = [];
    const value = number[0] ? { field: number[0].name, agg: "sum" } : { agg: "count" };
    if (text[0]) {
        out.push({ title: `${value.field ? `Sum of ${value.field}` : "Count of rows"} by ${text[0].name}`, view: { version: 2, rows: [text[0].name], values: [value] } });
    }
    if (text[0] && date[0]) {
        out.push({ title: `By ${text[0].name} and quarter of ${date[0].name}`, view: { version: 2, rows: [text[0].name], cols: ["Quarter"], derived: [{ name: "Quarter", field: date[0].name, by: "yearQuarter" }], values: [value] } });
    }
    if (text[0] && number[0]) {
        out.push({ title: `Top 5 ${text[0].name} by ${number[0].name}`, view: { version: 2, rows: [text[0].name], values: [value], filters: [{ field: text[0].name, type: "top", count: 5, by: value }], sort: [{ field: text[0].name, by: "value", order: "desc", value }] } });
    }
    return out;
}

/** The view guide: the format of a view in short, its vocabulary from pivotkit-core's CATALOG, and examples. */
export const VIEW_GUIDE = Object.freeze({
    text: [
        "A view is a JSON object; every key is optional. Use only field names that describe_source lists, spelled exactly.",
        'rows, cols: field names (outer first), e.g. ["Region"]. values: [{ "field": "Sales", "agg": "sum" }] (agg "count" needs no field).',
        'derived: groupings of a date or number field, each { "name": "Quarter", "field": "OrderDate", "by": "yearQuarter" }; use its name in rows or cols. Time-line units (one period of one year): year, yearQuarter, yearMonth, yearWeek, day; repeating units (every year together): quarter, month, week, weekday, hour; "bin" with "size" for numbers.',
        'filters: { "field", "type", ... }. in: "items": [...]; text: "op" (equals, contains, beginsWith, endsWith), "value"; compare: "op" (=, >, >=, <, <=, between), "value", "value2"; relative (dates): "direction" (last, next, this, before), "count", "unit" (hour, day, week, month, quarter, year), "anchor" (today, latest: the newest date in the data, first); top: "count", "by": { "field", "agg" }, "bottom": true for the lowest; value: "op", "value", "by". Every filter takes "not": true; "blanks": "include" | "exclude" | "only".',
        'sort: [{ "field", "by": "label" | "value", "order": "asc" | "desc", "value": { "field", "agg" } }]. display: "table", "chart" or "both" (side by side); chart: { "type": "auto" | "bar" | "line" | "area" | "pie" | "donut" | "heatmap" }.',
        "Write the view, call validate_view, fix what its findings name (a suggestion is the name meant), then render_view."
    ].join("\n"),
    catalog: Object.freeze({
        aggregators: CATALOG.aggregators,
        deriveUnits: CATALOG.deriveUnits,
        filterTypes: CATALOG.filterTypes,
        filterFields: CATALOG.filterFields,
        textOps: CATALOG.textOps,
        compareOps: CATALOG.compareOps,
        relativeUnits: CATALOG.relativeUnits,
        relativeDirections: CATALOG.relativeDirections,
        relativeAnchors: CATALOG.relativeAnchors,
        filterBlanks: CATALOG.filterBlanks,
        showAs: CATALOG.showAs,
        formats: CATALOG.formats,
        chartTypes: CATALOG.chartTypes,
        displayModes: CATALOG.displayModes
    }),
    examples: Object.freeze([
        { title: "Sum of Sales by Region", view: { version: 2, rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] } },
        { title: "Sales by Region per quarter of OrderDate", view: { version: 2, rows: ["Region"], cols: ["Quarter"], derived: [{ name: "Quarter", field: "OrderDate", by: "yearQuarter" }], values: [{ field: "Sales", agg: "sum" }] } },
        { title: "Best product in the last month of the data", view: { version: 2, rows: ["Product"], values: [{ field: "Sales", agg: "sum" }], filters: [{ field: "OrderDate", type: "relative", direction: "last", count: 1, unit: "month", anchor: "latest", blanks: "exclude" }, { field: "Product", type: "top", count: 1, by: { field: "Sales", agg: "sum" } }] } },
        { title: "Count of orders per month, as a line chart", view: { version: 2, rows: ["Month"], derived: [{ name: "Month", field: "OrderDate", by: "yearMonth" }], values: [{ agg: "count" }], display: "chart", chart: { type: "line" } } },
        { title: "Share of each Region in the total", view: { version: 2, rows: ["Region"], values: [{ field: "Sales", agg: "sum", showAs: { type: "percentOfGrandTotal" } }] } }
    ])
});

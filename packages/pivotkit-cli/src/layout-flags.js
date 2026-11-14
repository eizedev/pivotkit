/*
 * The layout flags of `render` and `describe --suggest` as a layout (pivotkit-core's viewFromLayout):
 * --rows, --cols, --values, --group, --filter, --chart-type and --map. One value names one thing and
 * every flag may be given again (outer first), so a field name may hold commas, spaces, colons and
 * "=". Pure: --filter @file is read by the caller (`readFilterFile`).
 */

import { CATALOG, closest } from "pivotkit-core";
import { CliError, printable } from "./errors.js";

/** The flags that make a layout; any of them given turns render into the flags mode. */
export const LAYOUT_FLAGS = Object.freeze(["rows", "cols", "values", "group", "filter", "chart-type", "map"]);

/** What each grouping unit means, for the help and the error of a unit pivotkit does not know. */
export const UNIT_TEXTS = Object.freeze({
    year: "2025, 2026",
    yearQuarter: "Q1 2025, Q2 2025",
    yearMonth: "Jan 2025, Feb 2025",
    yearWeek: "2025-W01",
    day: "each day",
    quarter: "Q1 to Q4, every year together",
    month: "Jan to Dec, every year together",
    week: "W01 to W53, every year together",
    weekday: "Monday to Sunday",
    hour: "00:00 to 23:00",
    bin: "number ranges: <field>:bin:<size>"
});

/** A name in a message: quoted, cleaned, cut. */
const shown = (text) => JSON.stringify(printable(String(text).slice(0, 60)));

/**
 * --values: "<agg>:<field>", "<field>" or "count". The part before the first ":" is an aggregator
 * only when pivotkit knows that name (in any case); a field of the data named exactly as the whole
 * value wins ("sum:x" when the data has a field "sum:x").
 * @param {string} value
 * @param {Set<string>} fields  the data's field names, lower case
 */
export function parseValue(value, fields) {
    if (fields.has(value.toLowerCase())) {
        return { field: value };
    }
    const at = value.indexOf(":");
    if (at > 0) {
        const agg = CATALOG.aggregators.find((a) => a.toLowerCase() === value.slice(0, at).trim().toLowerCase());
        if (agg) {
            const field = value.slice(at + 1);
            return field === "" ? { agg } : { field, agg };
        }
    }
    if (value.toLowerCase() === "count") {
        return { agg: "count" };
    }
    // "summ:Revenue": a field of the data after the colon, an aggregator misspelt before it
    if (at > 0 && fields.has(value.slice(at + 1).toLowerCase())) {
        const near = closest(value.slice(0, at), [...CATALOG.aggregators]);
        throw new CliError("usage", "BAD_VALUE", `--values ${shown(value)}: ${shown(value.slice(0, at))} is no aggregator${near ? `; did you mean ${near}?` : ""} (the aggregators: ${CATALOG.aggregators.join(", ")})`);
    }
    return { field: value };
}

/**
 * --group: "<field>:<unit>" or "<field>:bin:<size>", the unit the last part (a field may hold colons).
 * @param {string} value
 */
export function parseGroup(value) {
    const at = value.lastIndexOf(":");
    const unit = at > 0 ? CATALOG.deriveUnits.find((u) => u.toLowerCase() === value.slice(at + 1).trim().toLowerCase()) : undefined;
    if (unit && unit !== "bin") {
        return { field: value.slice(0, at), by: unit };
    }
    const bin = /^(.+):bin:([^:]+)$/i.exec(value);
    if (bin) {
        const size = Number(bin[2]);
        if (!(size > 0) || !Number.isFinite(size)) {
            throw new CliError("usage", "BAD_VALUE", `--group ${shown(value)}: the size of the ranges is a number above 0, as in Revenue:bin:500`);
        }
        return { field: bin[1], by: "bin", size };
    }
    const list = Object.entries(UNIT_TEXTS).map(([u, t]) => `${u} (${t})`).join(", ");
    throw new CliError("usage", "BAD_VALUE", `--group ${shown(value)}: give <field>:<unit>, the unit one of ${list}`);
}

/**
 * --map: "Old=New", split at the "=" whose left part is a name the view uses, else at the first "=".
 * @param {string} value
 * @param {Set<string>} used  the names the view uses, lower case
 */
export function parseMap(value, used) {
    const cuts = [...value.matchAll(/=/g)].map((m) => m.index ?? 0).filter((i) => i > 0 && i < value.length - 1);
    if (!cuts.length) {
        throw new CliError("usage", "BAD_VALUE", `--map ${shown(value)}: give Old=New, the view's name and the data's (--map "Revenue=Turnover")`);
    }
    const at = cuts.find((i) => used.has(value.slice(0, i).toLowerCase())) ?? cuts[0];
    return [value.slice(0, at), value.slice(at + 1)];
}

/**
 * A --filter: a filter object as JSON text.
 * @param {string} text
 * @param {string} where  for the message ("--filter", "--filter @f.json")
 */
export function parseFilter(text, where) {
    let filter;
    try {
        filter = JSON.parse(text);
    } catch (e) {
        // where the JSON stops, never the text itself (it may be a file's content)
        const at = /position (\d+)/.exec(String(e.message))?.[1];
        throw new CliError("usage", "BAD_VALUE", `${where}: not JSON${at ? ` (at character ${Number(at) + 1})` : ""}; give one filter as in a view, e.g. {"field":"Region","type":"in","items":["North"]}`);
    }
    const list = Array.isArray(filter) ? filter : [filter];
    if (!list.length || list.some((f) => !f || typeof f !== "object" || Array.isArray(f))) {
        throw new CliError("usage", "BAD_VALUE", `${where}: a filter is a JSON object (or a list of them), e.g. {"field":"Region","type":"in","items":["North"]}`);
    }
    return list;
}

/**
 * The layout of the flags given (only the parts given), with `map` apart.
 * @param {Record<string, any>} values  parseArgs' values
 * @param {{ fields: string[], filters?: object[] }} known  the data's field names; the filters read already (--filter @file)
 * @returns {import("pivotkit-core").Layout}
 */
export function layoutOf(values, known) {
    const fields = new Set(known.fields.map((f) => f.toLowerCase()));
    /** @type {any} */
    const layout = {};
    if (values.rows) layout.rows = [...values.rows];
    if (values.cols) layout.cols = [...values.cols];
    if (values.values) layout.values = values.values.map((v) => parseValue(v, fields));
    if (values.group) layout.groups = values.group.map(parseGroup);
    if (known.filters?.length) layout.filters = known.filters;
    // checked against CATALOG.chartTypes by the option's choices (commands.js)
    if (values["chart-type"] !== undefined) layout.chart = values["chart-type"];
    return layout;
}

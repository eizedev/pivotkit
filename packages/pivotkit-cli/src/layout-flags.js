/*
 * The layout flags of `render` and `describe --suggest` as a layout (pivotkit-core's viewFromLayout):
 * --rows, --cols, --values, --group, --filter, --chart-type and --map. One value names one thing and
 * every flag may be given again (outer first), so a field name may hold commas, spaces, colons and
 * "=". Pure: --filter @file is read by the caller (`filtersOf` in layout-view.js).
 */

import { AGGREGATOR_ALIASES, CATALOG, closest } from "pivotkit-core";
import { DOCS } from "./commands.js";
import { CliError, printable } from "pivotkit-node/files";

/** The flags that make a layout; any of them but --map given turns render into the flags mode (--map also renames a view file's fields). */
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

/** Our aggregator for another tool's name of it ("avg": average), else null. */
function aliasOf(name) {
    const key = name.trim().toLowerCase();
    return Object.hasOwn(AGGREGATOR_ALIASES, key) ? AGGREGATOR_ALIASES[key] : null;
}

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
        const near = aliasOf(value.slice(0, at)) ?? closest(value.slice(0, at), [...CATALOG.aggregators]);
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

/** The filter of the examples in --filter's messages. */
const FILTER_EXAMPLE = '{"field":"Region","type":"in","items":["North"]}';

/** Whether a --filter value is JSON (it starts with "{" or "["); else it is the short form Field=Item. */
export const isJsonFilter = (text) => /^\s*[[{]/.test(text);

/**
 * The message for a short form with a comparison or a negation: the JSON filter it means, whole so
 * it works as written; a pointer to the reference when that filter is too long or not printable.
 * @param {string} rawField
 * @param {string} op  "!=", "<", "<=", ">" or ">="
 * @param {string} rawItem
 */
function meantFilter(rawField, op, rawItem) {
    // "Revenue >= 3": the spaces around the operator belong to neither part
    const field = rawField.trim();
    const item = rawItem.trim();
    // a decimal number only ("1e3", ".5"); "0x10" stays text
    const value = op !== "!=" && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(item) ? Number(item) : item;
    const json = JSON.stringify(op === "!=" ? { field, type: "in", items: [item], not: true } : { field, type: "compare", op, value });
    const meant = printable(json) === json ? `JSON: ${json}` : `JSON as a view writes it: see ${DOCS}reference/cli/#layout-flags`;
    return `the short form keeps one item: Field=Item. For this filter give ${meant}`;
}

/**
 * --filter's short form "Field=Item": a filter that keeps the rows of one item. It splits at the "="
 * whose left part is a field of the data, else at the first "=", so a name and an item may hold "=".
 * When two "=" follow names of fields (fields "a" and "a=b"), the first wins: "a=b=c" filters "a".
 * A comparison or a negation ("Units>=3", "Country!=Germany", "Country<>Germany") is refused with the
 * JSON filter it means.
 * @param {string} value
 * @param {Set<string>} fields  the data's field names, lower case; empty when the data is the server's
 * @returns {{ field: string, type: "in", items: string[] }}
 */
export function parseShortFilter(value, fields) {
    const refuse = (text) => new CliError("usage", "BAD_VALUE", `--filter ${shown(value)}: ${text}`);
    const cuts = [...value.matchAll(/=/g)].map((m) => m.index ?? 0);
    const at = cuts.find((i) => i > 0 && fields.has(value.slice(0, i).toLowerCase())) ?? cuts[0];
    const neither = () => refuse(`give Field=Item, as in --filter "Country=Germany", or a filter as JSON, e.g. ${FILTER_EXAMPLE}`);
    if (at === undefined) {
        // "<>" is "not equal" in SQL and Excel; a field and an item around the operator, or it is no operator form
        const sign = /^([^<>]+)(<>|<|>)([^<>].*)$/.exec(value);
        if (sign) {
            throw refuse(meantFilter(sign[1], sign[2] === "<>" ? "!=" : sign[2], sign[3]));
        }
        throw neither();
    }
    const field = value.slice(0, at);
    const item = value.slice(at + 1);
    const sign = /[!<>]$/.exec(field)?.[0];
    if (sign && !fields.has(field.toLowerCase())) {
        if (field.length === 1 || item === "") {
            throw neither();
        }
        throw refuse(meantFilter(field.slice(0, -1), `${sign}=`, item));
    }
    if (field === "") {
        throw refuse(`give the field before =, as in --filter "Country=Germany"`);
    }
    if (item === "") {
        throw refuse(`give the item after =, as in --filter "Country=Germany"; blanks take a JSON filter: {"field":"Country","type":"blank"}`);
    }
    return { field, type: "in", items: [item] };
}

/**
 * A --filter: a filter object as JSON text.
 * @param {string} text
 * @param {string} where  for the message ("--filter", "--filter @f.json")
 * @param {string} [hint]  added to the message of text that is not JSON
 */
export function parseFilter(text, where, hint = "") {
    let filter;
    try {
        filter = JSON.parse(text);
    } catch (e) {
        // where the JSON stops, never the text itself (it may be a file's content)
        const at = /position (\d+)/.exec(String(e.message))?.[1];
        throw new CliError("usage", "BAD_VALUE", `${where}: not JSON${at ? ` (at character ${Number(at) + 1})` : ""}; give one filter as in a view, e.g. ${FILTER_EXAMPLE}${hint ? `; ${hint}` : ""}`);
    }
    const list = Array.isArray(filter) ? filter : [filter];
    if (!list.length || list.some((f) => !f || typeof f !== "object" || Array.isArray(f))) {
        throw new CliError("usage", "BAD_VALUE", `${where}: a filter is a JSON object (or a list of them), e.g. ${FILTER_EXAMPLE}`);
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

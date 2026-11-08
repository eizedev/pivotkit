/*
 * Names the UI writes for things the core leaves unnamed: a value ("Sum of Revenue", "% of grand
 * total of Revenue") and the derived field of a grouping ("Created by month"), in the labels' language;
 * what a click on a field of the field list does, and the zones folded into one line, in words.
 */

import { fieldLabel } from "pivotkit-core";
import { fill } from "./labels.js";

/** "Sum of Revenue", "% of grand total of Revenue", or the value's own name. */
export function valueLabel(spec, labels) {
    if (spec.label) {
        return spec.label;
    }
    const core = labels.core;
    let base;
    if (!spec.field) {
        base = core.countRows;
    } else {
        const agg = Object.hasOwn(core.aggregators, spec.agg) ? core.aggregators[spec.agg] : spec.agg;
        base = fill(core.valueName, { agg, field: fieldLabel(spec.field, core) });
    }
    if (!spec.showAs || !core.showAs || !core.showAsName) {
        return base;
    }
    const showAs = Object.hasOwn(core.showAs, spec.showAs.type) ? core.showAs[spec.showAs.type] : spec.showAs.type;
    return fill(core.showAsName, { showAs, value: spec.field && spec.agg === "sum" ? fieldLabel(spec.field, core) : base });
}

/**
 * The name of a measure a sort, a top N or a value condition goes by ({ field, agg }): the name of the
 * view's value for it ("Sum of Revenue", or the name the user gave it), without a "show as"
 * calculation, since the raw result is what is compared.
 * @param {any} view
 * @param {{ field: string | null, agg: string } | null | undefined} ref
 * @param {import("./labels.js").UiLabels} labels
 */
export function refLabel(view, ref, labels) {
    if (!ref) {
        return labels.core.countRows;
    }
    const sameField = (v) => (ref.field === null || v.field === null || v.field === undefined ? (v.field ?? null) === ref.field : v.field.toLowerCase() === ref.field.toLowerCase());
    const spec = (view.values ?? []).find((v) => v.agg === ref.agg && sameField(v));
    return valueLabel({ ...(spec ?? ref), showAs: null }, labels);
}

/**
 * A sort in words: "Z to A", "Largest Sum of Revenue first", "Custom order".
 * @param {any} view
 * @param {{ by: string, order: string, value?: { field: string | null, agg: string } }} sort
 * @param {import("./labels.js").UiLabels} labels
 */
export function sortText(view, sort, labels) {
    const desc = sort.order === "desc";
    if (sort.by === "value") {
        return fill(desc ? labels.sortValueDesc : labels.sortValueAsc, { value: refLabel(view, sort.value, labels) });
    }
    if (sort.by === "custom") {
        return desc ? labels.sortCustomDesc : labels.sortCustom;
    }
    return desc ? labels.sortLabelDesc : labels.sortLabelAsc;
}

/** The signs of the comparisons in a value condition's short text; between has words. */
const OP_SIGNS = Object.freeze({ "=": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤" });

/**
 * A value condition in short: "Sum of Revenue > 1,000", "Sum of Revenue between 5 and 8".
 * @param {any} view
 * @param {{ by?: { field: string | null, agg: string }, op: string, value: number, value2?: number }} f  a `value` filter
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 */
export function valueConditionText(view, f, labels, locale) {
    const number = (x) => (typeof x === "number" ? x.toLocaleString(locale, { maximumFractionDigits: 6 }) : "");
    const value = refLabel(view, f.by ?? (view.values?.[0] ? { field: view.values[0].field ?? null, agg: view.values[0].agg } : null), labels);
    if (f.op === "between" || f.op === "notBetween") {
        // the engine compares with the smaller number first; so does the text
        const [from, to] = typeof f.value2 === "number" && f.value2 < f.value ? [f.value2, f.value] : [f.value, f.value2];
        return fill(labels.valueConditions[f.op], { value, from: number(from), to: number(to) });
    }
    return fill(labels.valueConditions.compare, { value, op: Object.hasOwn(OP_SIGNS, f.op) ? OP_SIGNS[f.op] : f.op, number: number(f.value) });
}

/** The name of a derived field for a grouping, in the labels' language: "Date by month", "Amount (by 100)". */
export function groupingName(source, unit, labels, size) {
    const inName = labels.unitInName && Object.hasOwn(labels.unitInName, unit) ? labels.unitInName[unit] : labels.units[unit];
    return unit === "bin" ? fill(labels.binsName, { field: source, size }) : fill(labels.derivedName, { field: source, unit: inName ?? unit });
}


/** The zone a click on a field of the field list puts it in: numbers to Values, the rest to Rows. */
export const quickZone = (type) => (type === "number" ? "values" : "rows");

/**
 * What a click (or Enter) on a field of the field list does, from its type and the zones it is in:
 * "add" it to its quick zone, "move" it there from Columns or Filters (a field is on one axis only),
 * or nothing when it is in that zone already, as in Excel's field list: a number in Values is not
 * added a second time by a click, only by "Add to Values again" in its menu. `name` is the button's
 * accessible name (the field and where it is), `description` the action in words.
 * @param {string} field
 * @param {string} type
 * @param {string[]} zones  the zones the field is in
 * @param {import("./labels.js").UiLabels} labels
 * @returns {{ zone: string, kind: "add" | "move" | null, name: string, description: string }}
 */
export function fieldAction(field, type, zones, labels) {
    const zone = quickZone(type);
    const kind = zones.includes(zone) ? null : zone !== "values" && zones.some((z) => z === "cols" || z === "filters") ? "move" : "add";
    const name = zones.length ? `${field}, ${fill(labels.inZone, { zone: zones.map((z) => labels.zones[z] ?? z).join(", ") })}` : field;
    const description = kind === null ? "" : fill(kind === "move" ? labels.moveTo : labels.addTo, { zone: labels.zones[zone] });
    return { zone, kind, name, description };
}

/** The order of the zones in the one-line summary of the compact layout. */
const SUMMARY_ORDER = Object.freeze(["rows", "cols", "values", "filters"]);

/**
 * The zones in one line, for the compact layout: "Rows: Team · Columns: Priority · Values: Count of
 * Ticket"; zones without a field are left out.
 * @param {Record<string, Array<{ text: string }>>} entries  the chips of each zone (zoneEntries)
 * @param {import("./labels.js").UiLabels} labels
 * @returns {Array<{ zone: string, title: string, fields: string }>}  empty when no field is placed
 */
export function layoutSummary(entries, labels) {
    return SUMMARY_ORDER.filter((zone) => entries[zone] && entries[zone].length).map((zone) => ({ zone, title: labels.zones[zone], fields: entries[zone].map((e) => e.text).join(", ") }));
}

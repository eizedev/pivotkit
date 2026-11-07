/*
 * Names the UI writes for things the core leaves unnamed: a value ("Sum of Revenue", "% of grand
 * total of Revenue") and the derived field of a grouping ("Created (Month)"), in the labels' language;
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

/** The name of a derived field for a grouping, in the labels' language. */
export function groupingName(source, unit, labels, size) {
    return unit === "bin" ? fill(labels.binsName, { field: source, size }) : fill(labels.derivedName, { field: source, unit: labels.units[unit] ?? unit });
}


/** The zone a click on a field of the field list puts it in: numbers to Values, the rest to Rows. */
export const quickZone = (type) => (type === "number" ? "values" : "rows");

/**
 * What a click on a field of the field list does, from its type and the zones it is in: "add" it to
 * its quick zone (a number is added to Values once more each time), "move" it there from Columns or
 * Filters (a field is on one axis only), or nothing when it is on that axis already. `name` is the
 * button's accessible name (the field and where it is), `description` the action in words.
 * @param {string} field
 * @param {string} type
 * @param {string[]} zones  the zones the field is in
 * @param {import("./labels.js").UiLabels} labels
 * @returns {{ zone: string, kind: "add" | "move" | null, name: string, description: string }}
 */
export function fieldAction(field, type, zones, labels) {
    const zone = quickZone(type);
    const kind = zone === "values" ? "add" : zones.includes(zone) ? null : zones.some((z) => z === "cols" || z === "filters") ? "move" : "add";
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

/**
 * What the filter of a field keeps, for its menu: "Filter: 15 of 45", "Filter: contains “abc”",
 * "Filter: by value"; null without a filter.
 * @param {any} view
 * @param {string} field
 * @param {{ summary: { shown: number, total: number } | null } | null | undefined} state  the chip's state (zones.jsx)
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 */
export function filterText(view, field, state, labels, locale) {
    const same = (f) => typeof f.field === "string" && f.field.toLowerCase() === field.toLowerCase();
    const parts = [];
    if (state && state.summary) {
        parts.push(fill(labels.filterSummary, { shown: state.summary.shown.toLocaleString(locale), total: state.summary.total.toLocaleString(locale) }));
    }
    for (const f of view.filters.filter(same)) {
        if (f.type === "label") {
            const op = Object.hasOwn(labels.labelOps, f.op) ? labels.labelOps[f.op] : f.op;
            parts.push(`${op} “${f.value}”`);
        } else if (f.type === "value") {
            parts.push(labels.filterByValue);
        }
    }
    return parts.length ? fill(labels.filterIs, { filter: parts.join(", ") }) : null;
}

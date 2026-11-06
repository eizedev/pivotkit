/*
 * Names the UI writes for things the core leaves unnamed: a value ("Sum of Revenue", "% of grand
 * total of Revenue") and the derived field of a grouping ("Created (Month)"), in the labels' language.
 */

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
        base = fill(core.valueName, { agg, field: spec.field });
    }
    if (!spec.showAs || !core.showAs || !core.showAsName) {
        return base;
    }
    const showAs = Object.hasOwn(core.showAs, spec.showAs.type) ? core.showAs[spec.showAs.type] : spec.showAs.type;
    return fill(core.showAsName, { showAs, value: spec.field && spec.agg === "sum" ? spec.field : base });
}

/** The name of a derived field for a grouping, in the labels' language. */
export function groupingName(source, unit, labels, size) {
    return unit === "bin" ? fill(labels.binsName, { field: source, size }) : fill(labels.derivedName, { field: source, unit: labels.units[unit] ?? unit });
}


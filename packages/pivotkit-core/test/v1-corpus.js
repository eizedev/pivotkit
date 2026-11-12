// Views of view format version 1 with every filter type and operator, and the data they run on. Their
// results were recorded once by `node scripts/make-v1-golden.js` with the pivotkit-core that wrote
// version 1 (0.4.0) into v1-golden.json; v1-golden.test.js checks that every later version keeps
// them: the rows each view keeps, and the links of LINK_CASES decoded to the same view.
import { SALES } from "./fixtures.js";

/** Dates with blanks in every column, names with a no-break space (U+00A0) and odd case. */
export const DATED = Object.freeze([
    { Name: "Alpha Server", Created: "2024-11-30", Score: 3, Active: true, Note: "ok" },
    { Name: "alpha\u00A0server", Created: "2025-01-15", Score: 10, Active: false, Note: null },
    { Name: "Beta", Created: "2025-06-30", Score: null, Active: null, Note: "late" },
    { Name: "beta two", Created: "2025-12-31", Score: 7, Active: true, Note: "ok" },
    { Name: null, Created: null, Score: 1, Active: true, Note: "ok" },
    { Name: "Gamma  Ray", Created: "2026-02-01", Score: 15, Active: false, Note: null },
    { Name: "(blank)", Created: "2026-03-10", Score: 4, Active: null, Note: "ok" },
    { Name: "ACTIVE DIRECTORY", Created: "2026-03-11", Score: 9, Active: true, Note: "late" }
]);

export const DATA_SETS = Object.freeze({ sales: SALES, dated: DATED });

/** `now` of every case: relative ranges count back from it. */
export const NOW = "2026-03-15T12:00:00Z";

const units = { field: "Units", agg: "sum" };
const LABEL_OPS = ["equals", "notEquals", "contains", "notContains", "beginsWith", "endsWith"];
const VALUE_OPS = ["=", "!=", ">", ">=", "<", "<=", "between", "notBetween"];

/**
 * @type {Array<{ name: string, data: keyof typeof DATA_SETS, view: Record<string, unknown> }>}
 */
export const V1_CASES = [];
const add = (name, data, view) => V1_CASES.push({ name, data, view: { version: 1, ...view } });

// include and exclude, with and without a blank (null)
add("include", "sales", { filters: [{ field: "Region", type: "include", items: ["North", "West"] }] });
add("include with blank", "sales", { filters: [{ field: "Region", type: "include", items: ["North", null] }] });
add("include only blank", "sales", { filters: [{ field: "Region", type: "include", items: [null] }] });
add("include nothing", "sales", { filters: [{ field: "Region", type: "include", items: [] }] });
add("exclude", "sales", { filters: [{ field: "Region", type: "exclude", items: ["South"] }] });
add("exclude with blank", "sales", { filters: [{ field: "Region", type: "exclude", items: [null, "South"] }] });
add("exclude nothing", "sales", { filters: [{ field: "Region", type: "exclude", items: [] }] });
add("exclude numbers", "sales", { filters: [{ field: "Units", type: "exclude", items: [3, 5, null] }] });
add("include dates", "dated", { filters: [{ field: "Created", type: "include", items: ["2025-01-15", null] }] });
add("exclude booleans", "dated", { filters: [{ field: "Active", type: "exclude", items: [true] }] });
add("include case differs", "dated", { filters: [{ field: "Name", type: "include", items: ["beta"] }] });

// label: every operator, on text (with a no-break space, the text "(blank)"), numbers, dates and booleans
for (const op of LABEL_OPS) {
    add(`label ${op} text`, "dated", { filters: [{ field: "Name", type: "label", op, value: "alpha server" }] });
    add(`label ${op} blank text`, "dated", { filters: [{ field: "Name", type: "label", op, value: "(blank)" }] });
    add(`label ${op} part`, "dated", { filters: [{ field: "Name", type: "label", op, value: "a" }] });
    add(`label ${op} number`, "sales", { filters: [{ field: "Units", type: "label", op, value: "1" }] });
    add(`label ${op} boolean`, "dated", { filters: [{ field: "Active", type: "label", op, value: "TRUE" }] });
}
add("label contains date", "dated", { filters: [{ field: "Created", type: "label", op: "contains", value: "2025" }] });
add("label beginsWith blank word", "dated", { filters: [{ field: "Note", type: "label", op: "beginsWith", value: "(bl" }] });
add("label on a grouping", "sales", { derived: [{ name: "Year", field: "Date", by: "year" }], filters: [{ field: "Year", type: "label", op: "equals", value: "2026" }] });

// compare: every operator on numbers and dates, groupings by their key and by a day
for (const op of VALUE_OPS) {
    add(`compare ${op} number`, "sales", { filters: [{ field: "Price", type: "compare", op, value: 11, value2: 20 }] });
    add(`compare ${op} blank numbers`, "dated", { filters: [{ field: "Score", type: "compare", op, value: 4, value2: 9 }] });
    add(`compare ${op} date`, "dated", { filters: [{ field: "Created", type: "compare", op, value: "2025-06-30", value2: "2026-02-01" }] });
}
add("compare grouping key", "sales", { derived: [{ name: "Month", field: "Date", by: "yearMonth" }], filters: [{ field: "Month", type: "compare", op: ">=", value: 202602 }] });
add("compare grouping by day", "sales", { derived: [{ name: "Year", field: "Date", by: "year" }], filters: [{ field: "Year", type: "compare", op: "between", value: "2026-01-01", value2: "2026-02-28" }] });
add("compare grouping notBetween days", "dated", { derived: [{ name: "Year", field: "Created", by: "year" }], filters: [{ field: "Year", type: "compare", op: "notBetween", value: "2025-01-01", value2: "2025-12-31" }] });

// relative: units, counts, anchors, on a date and on a grouping of one
for (const unit of ["year", "month", "day"]) {
    for (const count of [1, 2, 6]) {
        add(`relative ${count} ${unit}`, "dated", { filters: [{ field: "Created", type: "relative", unit, count }] });
        add(`relative ${count} ${unit} latest`, "sales", { filters: [{ field: "Date", type: "relative", unit, count, anchor: "latest" }] });
    }
}
add("relative on a grouping", "dated", { derived: [{ name: "Month", field: "Created", by: "month" }], filters: [{ field: "Month", type: "relative", unit: "month", count: 3 }] });

// top and bottom N, ties (North: Ann 5 and Bob 5), by another measure, on an inner field
add("top 2", "sales", { rows: ["Region"], values: [units], filters: [{ field: "Region", type: "top", count: 2 }] });
add("bottom 1", "sales", { rows: ["Region"], values: [units], filters: [{ field: "Region", type: "top", count: 1, bottom: true }] });
add("top tie inner", "sales", { rows: ["Region", "Rep"], values: [units], filters: [{ field: "Rep", type: "top", count: 1 }] });
add("top by max price", "sales", { rows: ["Region"], values: [units], filters: [{ field: "Region", type: "top", count: 1, by: { field: "Price", agg: "max" } }] });
add("top off the axes", "sales", { values: [units], filters: [{ field: "Rep", type: "top", count: 2 }] });
add("top with blank measure", "dated", { rows: ["Note"], values: [{ field: "Score", agg: "sum" }], filters: [{ field: "Note", type: "top", count: 2 }] });

// value conditions, every operator
for (const op of VALUE_OPS) {
    add(`value ${op}`, "sales", { rows: ["Region"], values: [units], filters: [{ field: "Region", type: "value", op, value: 6, value2: 9 }] });
}
add("value by average with blanks", "dated", { rows: ["Note"], values: [{ field: "Score", agg: "average" }], filters: [{ field: "Note", type: "value", op: "!=", value: 7 }] });

// combinations
add("items then top", "sales", { rows: ["Region"], values: [units], filters: [{ field: "Region", type: "top", count: 2 }, { field: "Region", type: "exclude", items: ["North"] }] });
add("label and compare on one field", "sales", { filters: [{ field: "Rep", type: "label", op: "notContains", value: "n" }, { field: "Units", type: "compare", op: "!=", value: 7 }] });

/**
 * Link envelopes (format version 1) the golden file keeps as link texts encoded by pivotkit-core
 * 0.4.0: a later version must decode them to the same view.
 */
export const LINK_CASES = Object.freeze([
    { name: "bare", envelope: { format: "pivotkit-view", formatVersion: 1, view: { version: 1, rows: ["Region"], values: [units] } } },
    {
        name: "with source and filters",
        envelope: {
            format: "pivotkit-view",
            formatVersion: 1,
            source: { id: "sales" },
            name: "North and blanks",
            view: { version: 1, rows: ["Region"], values: [units], filters: [{ field: "Region", type: "exclude", items: ["South", null] }, { field: "Rep", type: "label", op: "notEquals", value: "ann" }] }
        }
    }
]);

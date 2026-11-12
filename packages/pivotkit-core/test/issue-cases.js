// One view per issue code of VIEW_ISSUE_CODES, against encode(SALES): issuesOf() gives what
// normalize() reports for it (computePivot() for "timeZoneMismatch"; "noMigration", which no view of
// this version can reach yet, from the migration pipeline with a step missing). Strict-only warnings
// come from validate(). view.test.js checks
// the codes; pivotkit-react's tests use the same cases for the texts that say them in plain words.
import { computePivot, normalize, validate } from "../src/index.js";
import { runMigrations } from "../src/view.js";

export const ISSUE_CASES = Object.freeze({
    notView: 42,
    notJson: "{",
    tooLarge: { chart: { title: "x".repeat(5_000_001) } },
    badVersion: { version: "one" },
    newerVersion: { version: 99 },
    noMigration: { version: 1 },
    unknownKey: { extra: true },
    notList: { rows: "Region" },
    tooMany: { values: Array.from({ length: 30 }, () => ({ agg: "count" })) },
    tooManyItems: { filters: [{ field: "Region", type: "include", items: Array.from({ length: 100_001 }, (_, i) => `R${i}`) }] },
    itemType: { filters: [{ field: "Units", type: "include", items: ["many"] }] },
    itemCase: { filters: [{ field: "Region", type: "include", items: ["north"] }] },
    unknownField: { rows: ["Planet"] },
    placedTwice: { rows: ["Region"], cols: ["region"] },
    groupingNoName: { derived: [{ field: "Date", by: "year" }] },
    groupingNameTaken: { derived: [{ name: "Region", field: "Date", by: "year" }] },
    groupingNoSource: { derived: [{ name: "Y", field: "When", by: "year" }] },
    groupingUnknown: { derived: [{ name: "Y", field: "Date", by: "decade" }] },
    binsNeedNumber: { derived: [{ name: "R", field: "Region", by: "bin", size: 5 }] },
    groupingNeedsDate: { derived: [{ name: "Y", field: "Units", by: "year" }] },
    binSize: { derived: [{ name: "B", field: "Units", by: "bin", size: 0 }] },
    notValueRef: { values: ["Units"] },
    unknownAggregator: { values: [{ field: "Units", agg: "total" }] },
    aggregatorNeedsField: { values: [{ agg: "sum" }] },
    aggregatorType: { values: [{ field: "Region", agg: "sum" }] },
    unknownFormat: { values: [{ field: "Units", agg: "sum", format: "money" }] },
    badLabel: { values: [{ field: "Units", agg: "sum", label: 7 }] },
    unknownShowAs: { values: [{ field: "Units", agg: "sum", showAs: { type: "share" } }] },
    showAsNotAdditive: { values: [{ field: "Units", agg: "average", showAs: { type: "runningTotal" } }] },
    showAsNotNumber: { values: [{ field: "Region", agg: "listUnique", showAs: { type: "percentOfGrandTotal" } }] },
    unknownConditional: { values: [{ field: "Units", agg: "sum", conditional: { type: "icons" } }] },
    conditionalNotNumber: { values: [{ field: "Region", agg: "listUnique", conditional: { type: "dataBar" } }] },
    colorScaleColors: { values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale", colors: ["red", "#fff"] } }] },
    dataBarColor: { values: [{ field: "Units", agg: "sum", conditional: { type: "dataBar", color: "blue" } }] },
    unknownFilterType: { version: 2, filters: [{ field: "Region", type: "like" }] },
    filterFieldType: { version: 2, filters: [{ field: "Region", type: "compare", op: ">", value: 1 }] },
    filterNoItems: { version: 2, filters: [{ field: "Region", type: "in" }] },
    filterTextOp: { version: 2, filters: [{ field: "Region", type: "text", op: "notContains", value: "N" }] },
    filterText: { version: 2, filters: [{ field: "Region", type: "text", op: "contains" }] },
    filterMatch: { version: 2, filters: [{ field: "Region", type: "text", op: "contains", value: "N", match: { case: "upper" } }] },
    filterNot: { version: 2, filters: [{ field: "Region", type: "in", items: ["North"], not: "yes" }] },
    filterBlanks: { version: 2, filters: [{ field: "Region", type: "in", items: ["North"], blanks: "keep" }] },
    blanksUnspecified: { version: 2, filters: [{ field: "Region", type: "in", items: ["North"] }] },
    filterEmpty: { version: 2, filters: [{ field: "Region", type: "in", items: [], blanks: "exclude" }] },
    filterNotNumber: { filters: [{ field: "Region", type: "top", count: 3, by: { field: "Region", agg: "listUnique" } }] },
    filterCount: { filters: [{ field: "Region", type: "top", count: 0 }] },
    filterValue: { filters: [{ field: "Region", type: "value", op: ">" }] },
    filterValue2: { filters: [{ field: "Region", type: "value", op: "between", value: 1 }] },
    filterCompareValue: { filters: [{ field: "Date", type: "compare", op: ">=", value: "last week" }] },
    filterRelativeUnit: { filters: [{ field: "Date", type: "relative", unit: "decade", count: 1 }] },
    filterRelativeCount: { filters: [{ field: "Date", type: "relative", unit: "year", count: 2.5 }] },
    filterRelativeAnchor: { filters: [{ field: "Date", type: "relative", unit: "year", count: 1, anchor: "yesterday" }] },
    sortNoItems: { sort: [{ field: "Region", by: "custom" }] },
    sortedTwice: { sort: [{ field: "Region" }, { field: "region", order: "desc" }] },
    badTotals: { totals: true },
    collapsedPath: { rows: ["Region"], collapsed: { rows: [["North"]] } },
    unknownSetting: { chart: { type: "radar" } },
    badTitle: { chart: { title: 7 } },
    unknownLocale: { formatting: { locale: "not a locale" } },
    unknownTimeZone: { formatting: { timeZone: "Mars/Olympus" } },
    timeZoneMismatch: { formatting: { timeZone: "Europe/Berlin" } }
});

/** The codes only validate() reports (a strict check). */
export const STRICT_CODES = Object.freeze(["blanksUnspecified", "filterEmpty"]);

/**
 * The issues of the case of `code` against `data`.
 * @param {string} code
 * @param {import("../src/index.js").Encoded} data
 */
export function issuesOf(code, data) {
    const view = ISSUE_CASES[code];
    if (code === "noMigration") {
        return runMigrations(view, {}, 2).issues;
    }
    if (STRICT_CODES.includes(code)) {
        return validate(view, data).warnings;
    }
    return code === "timeZoneMismatch" ? computePivot(data, view).issues : normalize(view, data).issues;
}

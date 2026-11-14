/*
 * Display labels of dimension values and the natural sort order of a column's dictionary.
 */

import { collator, dateTimeFormat } from "./intl.js";

/** @type {Intl.DateTimeFormatOptions} */
const DATE = { dateStyle: "medium", timeZone: "UTC" };
/** @type {Intl.DateTimeFormatOptions} */
const DATE_TIME = { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" };

/**
 * @typedef {object} Labels  texts of the grid and chart; {label}, {agg} and {field} are placeholders
 * @property {string} blank
 * @property {string} total
 * @property {string} grandTotal
 * @property {string} values
 * @property {string} valueName
 * @property {string} countRows
 * @property {string} true
 * @property {string} false
 * @property {Record<string, string>} aggregators
 * @property {string} [showAsName]  the name of a value shown as a calculation; {showAs} and {value}
 * @property {Record<string, string>} [showAs]  names of the "show values as" calculations
 * @property {Record<string, string>} [fields]  display names of fields by field name (matched
 *   case-insensitively): the corner headers, value names and exports show them; views keep the names
 */

/**
 * Default texts of the grid; every one can be replaced through toGrid's `labels` option.
 * @type {Readonly<Labels>}
 */
export const DEFAULT_LABELS = Object.freeze({
    blank: "(blank)",
    total: "{label} Total",
    grandTotal: "Grand Total",
    values: "Values",
    valueName: "{agg} of {field}",
    countRows: "Count",
    true: "true",
    false: "false",
    aggregators: Object.freeze({
        count: "Count",
        countUnique: "Count Unique",
        listUnique: "List Unique",
        sum: "Sum",
        average: "Average",
        median: "Median",
        min: "Min",
        max: "Max",
        stdev: "StdDev",
        stdevp: "StdDevP",
        var: "Var",
        varp: "VarP",
        first: "First",
        last: "Last"
    }),
    showAsName: "{showAs} of {value}",
    showAs: Object.freeze({
        percentOfGrandTotal: "% of grand total",
        percentOfRowTotal: "% of row total",
        percentOfColumnTotal: "% of column total",
        percentOfParentRow: "% of parent row",
        percentOfParentColumn: "% of parent column",
        differenceFromPrevious: "Difference from previous",
        percentDifferenceFromPrevious: "% difference from previous",
        runningTotal: "Running total",
        percentRunningTotal: "% running total",
        rankAscending: "Rank (smallest first)",
        rankDescending: "Rank (largest first)"
    })
});

/**
 * The texts of a report in a language, as pivotkit-react's report shows them and pivotkit-report
 * writes them: DEFAULT_LABELS with words for yes/no and the aggregators' longer names, and German.
 * Every text can still be replaced through toGrid's `labels` option.
 * @type {Readonly<Record<"en" | "de", Labels>>}
 */
export const REPORT_LABELS = Object.freeze({
    en: Object.freeze({
        ...DEFAULT_LABELS,
        // a yes/no field in the table, the filter list and the drill-down: words, not true/false
        true: "Yes",
        false: "No",
        aggregators: {
            count: "Count",
            countUnique: "Distinct count",
            listUnique: "List of distinct values",
            sum: "Sum",
            average: "Average",
            median: "Median",
            min: "Minimum",
            max: "Maximum",
            stdev: "Standard deviation (sample)",
            stdevp: "Standard deviation (population)",
            var: "Variance (sample)",
            varp: "Variance (population)",
            first: "First value",
            last: "Last value"
        }
    }),
    de: Object.freeze({
        ...DEFAULT_LABELS,
        blank: "(Leer)",
        total: "{label} gesamt",
        grandTotal: "Gesamtergebnis",
        values: "Werte",
        valueName: "{agg} von {field}",
        countRows: "Anzahl",
        true: "Ja",
        false: "Nein",
        aggregators: {
            count: "Anzahl",
            countUnique: "Anzahl verschiedener Werte",
            listUnique: "Liste verschiedener Werte",
            sum: "Summe",
            average: "Durchschnitt",
            median: "Median",
            min: "Minimum",
            max: "Maximum",
            stdev: "Standardabweichung (Stichprobe)",
            stdevp: "Standardabweichung (Grundgesamtheit)",
            var: "Varianz (Stichprobe)",
            varp: "Varianz (Grundgesamtheit)",
            first: "Erster Wert",
            last: "Letzter Wert"
        },
        showAsName: "{showAs} von {value}",
        showAs: {
            percentOfGrandTotal: "% des Gesamtergebnisses",
            percentOfRowTotal: "% der Zeilensumme",
            percentOfColumnTotal: "% der Spaltensumme",
            percentOfParentRow: "% der übergeordneten Zeile",
            percentOfParentColumn: "% der übergeordneten Spalte",
            differenceFromPrevious: "Differenz zum vorherigen",
            percentDifferenceFromPrevious: "% Differenz zum vorherigen",
            runningTotal: "Laufende Summe",
            percentRunningTotal: "% laufende Summe",
            rankAscending: "Rang (kleinster zuerst)",
            rankDescending: "Rang (größter zuerst)"
        }
    })
});

/**
 * The REPORT_LABELS of a locale's language ("de-DE": German), English for any other.
 * @param {string} [locale]
 * @returns {Labels}
 */
export function reportLabels(locale) {
    const lang = String(locale ?? "").split("-")[0].toLowerCase();
    return lang === "de" ? REPORT_LABELS.de : REPORT_LABELS.en;
}

/**
 * The display name of a field: its entry in `labels.fields` (matched case-insensitively, own entries
 * only), else the name itself. Display only; a view always holds the field's own name.
 * @param {string} field
 * @param {{ fields?: Record<string, string> }} [labels]
 * @returns {string}
 */
export function fieldLabel(field, labels) {
    const map = labels && labels.fields;
    if (!map || typeof map !== "object" || typeof field !== "string") {
        return field;
    }
    const usable = (k) => typeof map[k] === "string" && map[k].trim() !== "";
    if (Object.hasOwn(map, field) && usable(field)) {
        return map[field];
    }
    const lower = field.toLowerCase();
    const key = Object.keys(map).find((k) => k.toLowerCase() === lower && usable(k));
    return key === undefined ? field : map[key];
}

/**
 * The label of one dictionary value of a column.
 * @param {import("./encode.js").Column} column
 * @param {string | number | boolean | null} value  null for blank
 * @param {string} locale
 * @param {{ blank?: string, true?: string, false?: string }} [labels]
 */
export function labelOf(column, value, locale, labels = DEFAULT_LABELS) {
    if (value === null || value === undefined) {
        return labels.blank ?? DEFAULT_LABELS.blank;
    }
    if (column.labeler) {
        return column.labeler(value, locale);
    }
    switch (column.type) {
        case "date":
            return dateTimeFormat(locale, column.dateOnly ? DATE : DATE_TIME).format(new Date(Number(value)));
        case "boolean":
            return value ? (labels.true ?? "true") : (labels.false ?? "false");
        default:
            return String(value);
    }
}

/**
 * Compares two raw values: numbers (and dates, booleans) by value, text naturally. Blank sorts last.
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} locale
 */
export function naturalCompare(a, b, locale) {
    const aBlank = a === null || a === undefined;
    const bBlank = b === null || b === undefined;
    if (aBlank || bBlank) {
        return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
    }
    const aNum = typeof a === "number" || typeof a === "boolean";
    const bNum = typeof b === "number" || typeof b === "boolean";
    if (aNum && bNum) {
        return Number(a) - Number(b);
    }
    if (aNum !== bNum) {
        // numbers before text, as Excel sorts a mixed column
        return aNum ? -1 : 1;
    }
    return collator(locale).compare(String(a), String(b));
}

/**
 * Rank of every dictionary code of a column in natural order (0 = first), cached on the encoded data
 * (one bounded cache with the derived columns, see LIMITS.cacheEntries).
 * @param {import("./encode.js").Column} column
 * @param {string} locale
 * @param {ReturnType<typeof import("./util.js").createCache>} cache  encoded.cache
 * @returns {Int32Array}
 */
export function ranksOf(column, locale, cache) {
    return cache.getOrSet(`ranks:${column.id}:${locale}`, () => {
        const order = column.dict.map((_, i) => i);
        order.sort((x, y) => naturalCompare(column.dict[x], column.dict[y], locale) || x - y);
        const ranks = new Int32Array(order.length);
        order.forEach((code, rank) => {
            ranks[code] = rank;
        });
        return ranks;
    });
}

/** Replaces {name} placeholders; unknown names stay as they are. */
export function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(values, name) ? String(values[name]) : all));
}

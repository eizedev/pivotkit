/*
 * The words of describeView in English and German: whole phrases with {placeholders}, so each
 * language keeps its own word order. pivotkit-report's HTML report writes its filters and its
 * summary with the words of its language; the MCP server and the CLI keep English.
 */

import { GROUPING_NAMES, REPORT_LABELS } from "./labels.js";

/** @typedef {Readonly<{ yes: string, not: string }>} Phrase  a phrase, and the phrase with "not" */
/** @typedef {Readonly<{ one: string, other: string }>} Counted  a phrase by Intl.PluralRules category of {count} */
/**
 * @typedef {object} Ranges  the relative ranges: "last 3 years", "this year"
 * @property {Readonly<Record<string, Counted>>} last
 * @property {Readonly<Record<string, Counted>>} next
 * @property {Readonly<Record<string, Counted>>} before
 * @property {Readonly<Record<string, string>>} this
 */

/**
 * @typedef {object} DescribeLabels  the words of describeView; {placeholders} are filled once, with the view's names and values
 * @property {string} lang  the language whose plural rules pick a Counted form
 * @property {Readonly<Record<string, string>> | null} aggregators  an aggregator's name; null: its key ("sum")
 * @property {string} valueName  a value: "{agg} of {field}"
 * @property {string} valueOfRows  a value of no field: "{agg} of rows"
 * @property {string} firstValue  what a filter or sort goes by when it names no value
 * @property {string} countRows  what a view without values shows
 * @property {string} more  a list that is cut: "{items} and {count} more"
 * @property {string} noItems
 * @property {Readonly<Record<"exclude" | "include" | "only", string>>} blanks
 * @property {string} withBlanks  "{text} ({blanks})"
 * @property {Phrase} in  "{field} is one of {items}"
 * @property {Phrase} blank
 * @property {string} asShown  a text filter on labels: "{field} (as shown)"
 * @property {Readonly<Record<"equals" | "contains" | "beginsWith" | "endsWith", Phrase>>} text
 * @property {string} match  "{text}, case {case}, whitespace {whitespace}"
 * @property {Readonly<Record<string, string>>} cases
 * @property {Readonly<Record<string, string>>} whitespace
 * @property {Phrase} compare  "{field} is {op}"; {op} is one of `ops`
 * @property {Readonly<Record<string, string>>} ops  a comparison with {value} (and {value2})
 * @property {string} precision  "{text} (by {precision})"
 * @property {Readonly<Record<string, string>>} precisions
 * @property {Phrase} relative  "{field} is in the {range}"
 * @property {Ranges} ranges  a relative range by direction and unit
 * @property {string} how  "{text} ({how})": how a relative range is counted
 * @property {string} rolling
 * @property {string} currentExcluded
 * @property {string} fromAnchor  "from {anchor}"
 * @property {Readonly<Record<string, string>>} anchors  "latest" and "first"; a date anchor stays as it is
 * @property {string} top  "top {count} {field} by {by}"
 * @property {string} bottom
 * @property {string} tiesKept  "{text}, ties kept"
 * @property {Phrase} value  "{field} where {by} is {op}"
 * @property {Readonly<Record<string, string>> | null} units  a grouping's unit; null: its key ("yearMonth")
 * @property {string} derived  "{name}: {field} by {by}"
 * @property {string} bins  "{name}: {field} by {by} of {size}"
 * @property {string} sortLabel  "{field} by label, {order}"
 * @property {string} sortValue  "{field} by {by}, {order}"
 * @property {string} sortColumn  "{field} by {by} in the column {column}, {order}"
 * @property {string} sortCustom  "{field} in a custom order, {order}"
 * @property {Readonly<Record<"asc" | "desc", string>>} orders
 * @property {string} rows  "by {fields}"
 * @property {string} cols  "across {fields}"
 * @property {string} where  "where {filters}"
 * @property {string} and  between two filters
 * @property {string} chart  "as a {type}": {type} is one of `chartTypes`
 * @property {string} both  "as a table and a {type}"
 * @property {Readonly<Record<string, string>>} chartTypes  by CHART_TYPES; "auto" is a chart of no named type
 * @property {Counted} invalid  "(invalid: {count} errors, the parts they name are left out)"
 */

const DATE_UNITS = Object.freeze(["hour", "day", "week", "month", "quarter", "year"]);

/** The English ranges: "last 3 years", "this year". */
const enRanges = (word) => Object.freeze(Object.fromEntries(DATE_UNITS.map((u) => [u, Object.freeze({ one: `${word} {count} ${u}`, other: `${word} {count} ${u}s` })])));

/**
 * The German ranges, from each unit's grammar: the preposition with its article before "letzten"
 * ("im letzten Jahr"), the article after "vor" ("vor dem letzten Jahr"), the plural in the dative
 * and "this" as a whole phrase.
 */
const DE_UNITS = Object.freeze({
    hour: { at: "in der", before: "vor der", one: "Stunde", other: "Stunden", this: "in dieser Stunde" },
    day: { at: "am", before: "vor dem", one: "Tag", other: "Tagen", this: "am heutigen Tag" },
    week: { at: "in der", before: "vor der", one: "Woche", other: "Wochen", this: "in dieser Woche" },
    month: { at: "im", before: "vor dem", one: "Monat", other: "Monaten", this: "in diesem Monat" },
    quarter: { at: "im", before: "vor dem", one: "Quartal", other: "Quartalen", this: "in diesem Quartal" },
    year: { at: "im", before: "vor dem", one: "Jahr", other: "Jahren", this: "in diesem Jahr" }
});
const deRanges = (word, before) => Object.freeze(Object.fromEntries(DATE_UNITS.map((u) => {
    const g = DE_UNITS[u];
    return [u, Object.freeze({ one: `${before ? g.before : g.at} ${word} ${g.one}`, other: `${before ? "vor den" : "in den"} ${word} {count} ${g.other}` })];
})));

const phrase = (yes, not) => Object.freeze({ yes, not });

/**
 * The words of describeView, English and German. English names aggregators, units, precisions and
 * chart types by their keys, as a view does; German takes the aggregators' names from
 * REPORT_LABELS and the grouping units from GROUPING_NAMES.
 * @type {Readonly<Record<"en" | "de", Readonly<DescribeLabels>>>}
 */
export const DESCRIBE_LABELS = Object.freeze({
    en: Object.freeze({
        lang: "en",
        aggregators: null,
        valueName: "{agg} of {field}",
        valueOfRows: "{agg} of rows",
        firstValue: "the first value",
        countRows: "count of rows",
        more: "{items} and {count} more",
        noItems: "(no items)",
        blanks: Object.freeze({ exclude: "blanks dropped", include: "blanks kept", only: "only blanks" }),
        withBlanks: "{text} ({blanks})",
        in: phrase("{field} is one of {items}", "{field} is not one of {items}"),
        blank: phrase("{field} is blank", "{field} is not blank"),
        asShown: "{field} (as shown)",
        text: Object.freeze({
            equals: phrase("{field} equals {value}", "{field} does not equal {value}"),
            contains: phrase("{field} contains {value}", "{field} does not contain {value}"),
            beginsWith: phrase("{field} begins with {value}", "{field} does not begin with {value}"),
            endsWith: phrase("{field} ends with {value}", "{field} does not end with {value}")
        }),
        match: "{text}, case {case}, whitespace {whitespace}",
        cases: Object.freeze({ insensitive: "insensitive", sensitive: "sensitive" }),
        whitespace: Object.freeze({ collapse: "collapse", exact: "exact" }),
        compare: phrase("{field} is {op}", "{field} is not {op}"),
        ops: Object.freeze({ "=": "{value}", ">": "greater than {value}", ">=": "at least {value}", "<": "less than {value}", "<=": "at most {value}", between: "between {value} and {value2}" }),
        precision: "{text} (by {precision})",
        precisions: Object.freeze({ year: "year", quarter: "quarter", month: "month", day: "day", hour: "hour" }),
        relative: phrase("{field} is in the {range}", "{field} is not in the {range}"),
        ranges: Object.freeze({
            last: enRanges("last"),
            next: enRanges("next"),
            before: enRanges("before"),
            this: Object.freeze(Object.fromEntries(DATE_UNITS.map((u) => [u, `this ${u}`])))
        }),
        how: "{text} ({how})",
        rolling: "rolling",
        currentExcluded: "current excluded",
        fromAnchor: "from {anchor}",
        anchors: Object.freeze({ latest: "latest", first: "first" }),
        top: "top {count} {field} by {by}",
        bottom: "bottom {count} {field} by {by}",
        tiesKept: "{text}, ties kept",
        value: phrase("{field} where {by} is {op}", "{field} where {by} is not {op}"),
        units: null,
        derived: "{name}: {field} by {by}",
        bins: "{name}: {field} by {by} of {size}",
        sortLabel: "{field} by label, {order}",
        sortValue: "{field} by {by}, {order}",
        sortColumn: "{field} by {by} in the column {column}, {order}",
        sortCustom: "{field} in a custom order, {order}",
        orders: Object.freeze({ asc: "ascending", desc: "descending" }),
        rows: "by {fields}",
        cols: "across {fields}",
        where: "where {filters}",
        and: "; and ",
        chart: "as a {type}",
        both: "as a table and a {type}",
        chartTypes: Object.freeze({ auto: "chart", bar: "bar chart", line: "line chart", area: "area chart", pie: "pie chart", donut: "donut chart", heatmap: "heatmap chart", combo: "combo chart", treemap: "treemap chart" }),
        invalid: Object.freeze({ one: "(invalid: {count} error, the parts they name are left out)", other: "(invalid: {count} errors, the parts they name are left out)" })
    }),
    de: Object.freeze({
        lang: "de",
        aggregators: REPORT_LABELS.de.aggregators,
        valueName: REPORT_LABELS.de.valueName,
        valueOfRows: "{agg} der Zeilen",
        firstValue: "der erste Wert",
        countRows: "Anzahl der Zeilen",
        more: "{items} und {count} weitere",
        noItems: "(keine Einträge)",
        blanks: Object.freeze({ exclude: "ohne leere Werte", include: "mit leeren Werten", only: "nur leere Werte" }),
        withBlanks: "{text} ({blanks})",
        in: phrase("{field} ist einer der Werte {items}", "{field} ist keiner der Werte {items}"),
        blank: phrase("{field} ist leer", "{field} ist nicht leer"),
        asShown: "{field} (wie angezeigt)",
        text: Object.freeze({
            equals: phrase("{field} ist gleich {value}", "{field} ist nicht gleich {value}"),
            contains: phrase("{field} enthält {value}", "{field} enthält nicht {value}"),
            beginsWith: phrase("{field} beginnt mit {value}", "{field} beginnt nicht mit {value}"),
            endsWith: phrase("{field} endet auf {value}", "{field} endet nicht auf {value}")
        }),
        match: "{text}, {case}, {whitespace}",
        cases: Object.freeze({ insensitive: "Groß- und Kleinschreibung egal", sensitive: "Groß- und Kleinschreibung beachtet" }),
        whitespace: Object.freeze({ collapse: "Leerraum zusammengefasst", exact: "Leerraum genau" }),
        compare: phrase("{field} ist {op}", "{field} ist nicht {op}"),
        ops: Object.freeze({ "=": "{value}", ">": "größer als {value}", ">=": "mindestens {value}", "<": "kleiner als {value}", "<=": "höchstens {value}", between: "zwischen {value} und {value2}" }),
        precision: "{text} (nach {precision})",
        precisions: Object.freeze({ year: "Jahr", quarter: "Quartal", month: "Monat", day: "Tag", hour: "Stunde" }),
        relative: phrase("{field} liegt {range}", "{field} liegt nicht {range}"),
        ranges: Object.freeze({
            last: deRanges("letzten", false),
            next: deRanges("nächsten", false),
            before: deRanges("letzten", true),
            this: Object.freeze(Object.fromEntries(DATE_UNITS.map((u) => [u, DE_UNITS[u].this])))
        }),
        how: "{text} ({how})",
        rolling: "gleitend",
        currentExcluded: "ohne den laufenden Zeitraum",
        fromAnchor: "ab {anchor}",
        anchors: Object.freeze({ latest: "dem letzten Datensatz", first: "dem ersten Datensatz" }),
        top: "die obersten {count} von {field} nach {by}",
        bottom: "die untersten {count} von {field} nach {by}",
        tiesKept: "{text}, gleiche Werte behalten",
        value: phrase("{field}, bei denen {by} {op} ist", "{field}, bei denen {by} nicht {op} ist"),
        units: GROUPING_NAMES.de.units,
        derived: "{name}: {field} nach {by}",
        bins: "{name}: {field} nach {by} je {size}",
        sortLabel: "{field} nach Beschriftung, {order}",
        sortValue: "{field} nach {by}, {order}",
        sortColumn: "{field} nach {by} in der Spalte {column}, {order}",
        sortCustom: "{field} in eigener Reihenfolge, {order}",
        orders: Object.freeze({ asc: "aufsteigend", desc: "absteigend" }),
        rows: "nach {fields}",
        cols: "über {fields}",
        where: "(Filter: {filters})",
        and: "; ",
        chart: "als {type}",
        both: "als Tabelle und {type}",
        chartTypes: Object.freeze({ auto: "Diagramm", bar: "Balkendiagramm", line: "Liniendiagramm", area: "Flächendiagramm", pie: "Kreisdiagramm", donut: "Ringdiagramm", heatmap: "Heatmap", combo: "Balken- und Liniendiagramm", treemap: "Treemap" }),
        invalid: Object.freeze({ one: "(ungültig: {count} Fehler, die Teile, die er nennt, fehlen)", other: "(ungültig: {count} Fehler, die Teile, die sie nennen, fehlen)" })
    })
});

/**
 * The DESCRIBE_LABELS of a locale's language ("de-DE": German), English for any other.
 * @param {string} [locale]
 * @returns {Readonly<DescribeLabels>}
 */
export function describeLabels(locale) {
    return String(locale ?? "").split("-")[0].toLowerCase() === "de" ? DESCRIBE_LABELS.de : DESCRIBE_LABELS.en;
}

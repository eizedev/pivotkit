/*
 * The words of describeView in English and German: whole phrases with {placeholders}, so each
 * language keeps its own word order. pivotkit-report's HTML report writes its filters and its
 * summary with the words of its language; the MCP server and the CLI keep English.
 */

import { PivotkitError } from "./errors.js";
import { GROUPING_NAMES, REPORT_LABELS } from "./labels.js";
import { RELATIVE_UNITS } from "./relative.js";
import { isPlainObject } from "./util.js";

/** @typedef {Readonly<{ yes: string, not: string }>} Phrase  a phrase, and the phrase with "not" */
/** @typedef {Readonly<{ one: string, other: string }>} Counted  a phrase by Intl.PluralRules category of {count} */
/**
 * @typedef {Readonly<{ one: string, other: string, current?: string, adjacent?: string }>} RangeForms
 * a relative range of one unit, by the plural category of {count}; a language that has them names
 * the single whole unit in words of its own: `current` the current one ("today", the default of
 * count 1), `adjacent` the one before or after it (includeCurrent false: "yesterday", "tomorrow")
 */
/**
 * @typedef {object} Ranges  the relative ranges: "last 3 years", "this year"
 * @property {Readonly<Record<string, RangeForms>>} last
 * @property {Readonly<Record<string, RangeForms>>} next
 * @property {Readonly<Record<string, RangeForms>>} before
 * @property {Readonly<Record<string, string>>} this
 */

/**
 * @typedef {object} AnchoredRanges  one whole unit of a relative range counted from an anchor (the data's latest date, a date of its own)
 * @property {Readonly<Record<string, Readonly<{ current: string, adjacent: string }>>>} last
 * @property {Readonly<Record<string, Readonly<{ current: string, adjacent: string }>>>} next
 * @property {Readonly<Record<string, Readonly<{ current: string, adjacent: string }>>>} before
 * @property {Readonly<Record<string, string>>} this
 */

/**
 * @typedef {object} DescribeLabels  the words of describeView; {placeholders} are filled once, with the view's names and values
 * @property {string} lang  the language whose plural rules pick a Counted form
 * @property {string} quote  a text value: "\"{value}\"", German „{value}“
 * @property {string} true  a value true; German "Ja", as the report's table writes it
 * @property {string} false
 * @property {string} list  between the items of a list: ", ", German "; " (its numbers have a decimal comma)
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
 * @property {AnchoredRanges | null} anchoredRanges  one whole unit counted from an anchor that is not today
 *   ("am Tag davor" instead of "gestern"); null: `ranges` as they are
 * @property {string} how  "{text} ({how})": how a relative range is counted
 * @property {string} rolling
 * @property {string} currentExcluded
 * @property {string} fromAnchor  "from {anchor}"
 * @property {Readonly<Record<string, string>>} anchors  "latest" and "first"; a date anchor stays as it is
 * @property {string | Counted} top  "top {count} {field} by {by}"
 * @property {string | Counted} bottom
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
 * @property {string} and  between two filters: "; and ", German "; und " (a filter may hold commas and "und")
 * @property {string} separator  between the parts of the sentence after the values and the rows (columns, filters, chart)
 * @property {string} filterList  between two filters of a list of them alone (the HTML report's `{{filters}}`): "; ", German "; und "
 * @property {string} chart  "as a {type}": {type} is one of `chartTypes`
 * @property {string} both  "as a table and a {type}"
 * @property {Readonly<Record<string, string>>} chartTypes  by CHART_TYPES; "auto" is a chart of no named type
 * @property {Counted} invalid  "(invalid: {count} errors, the parts they name are left out)"
 */

/**
 * The labels a host passes: any key or table entry left out keeps the words under them, at every
 * depth: English for describeView's `labels`, the locale's for describeLabels(locale, own)
 * (`{ blanks: { exclude: "no blanks" } }`, `{ ranges: { last: { day: { other: "..." } } } }`).
 * @template T
 * @typedef {{ [K in keyof T]?: T[K] extends string | null ? T[K] : DescribeLabelsPart<T[K]> }} DescribeLabelsPart
 */
/** @typedef {DescribeLabelsPart<DescribeLabels>} DescribeLabelsInput */

/** The English ranges: "last 3 years", "this year". */
const enRanges = (word) => Object.freeze(Object.fromEntries(RELATIVE_UNITS.map((u) => [u, Object.freeze({ one: `${word} {count} ${u}`, other: `${word} {count} ${u}s` })])));

/**
 * The German ranges, whole phrases by unit. `one` is a rolling range of one unit (with whole units
 * the count of 1 is `current` or `adjacent`), `other` the plural in the dative.
 * `current` of "last" and "next" is the current unit, as "this" is.
 */
const DE_RANGES = Object.freeze({
    last: {
        hour: ["innerhalb der letzten Stunde", "in den letzten {count} Stunden", "in dieser Stunde", "in der vorigen Stunde"],
        day: ["innerhalb des letzten Tages", "in den letzten {count} Tagen", "heute", "gestern"],
        week: ["innerhalb der letzten Woche", "in den letzten {count} Wochen", "in dieser Woche", "in der Vorwoche"],
        month: ["innerhalb des letzten Monats", "in den letzten {count} Monaten", "in diesem Monat", "im Vormonat"],
        quarter: ["innerhalb des letzten Quartals", "in den letzten {count} Quartalen", "in diesem Quartal", "im Vorquartal"],
        year: ["innerhalb des letzten Jahres", "in den letzten {count} Jahren", "in diesem Jahr", "im Vorjahr"]
    },
    next: {
        hour: ["innerhalb der nächsten Stunde", "in den nächsten {count} Stunden", "in dieser Stunde", "in der kommenden Stunde"],
        day: ["innerhalb des nächsten Tages", "in den nächsten {count} Tagen", "heute", "morgen"],
        week: ["innerhalb der nächsten Woche", "in den nächsten {count} Wochen", "in dieser Woche", "in der kommenden Woche"],
        month: ["innerhalb des nächsten Monats", "in den nächsten {count} Monaten", "in diesem Monat", "im kommenden Monat"],
        quarter: ["innerhalb des nächsten Quartals", "in den nächsten {count} Quartalen", "in diesem Quartal", "im kommenden Quartal"],
        year: ["innerhalb des nächsten Jahres", "in den nächsten {count} Jahren", "in diesem Jahr", "im kommenden Jahr"]
    },
    before: {
        hour: ["früher als vor einer Stunde", "vor den letzten {count} Stunden", "vor dieser Stunde", "vor der vorigen Stunde"],
        day: ["früher als vor einem Tag", "vor den letzten {count} Tagen", "vor dem heutigen Tag", "vor dem gestrigen Tag"],
        week: ["früher als vor einer Woche", "vor den letzten {count} Wochen", "vor dieser Woche", "vor der Vorwoche"],
        month: ["früher als vor einem Monat", "vor den letzten {count} Monaten", "vor diesem Monat", "vor dem Vormonat"],
        quarter: ["früher als vor einem Quartal", "vor den letzten {count} Quartalen", "vor diesem Quartal", "vor dem Vorquartal"],
        year: ["früher als vor einem Jahr", "vor den letzten {count} Jahren", "vor diesem Jahr", "vor dem Vorjahr"]
    }
});
const deRanges = (direction) => Object.freeze(Object.fromEntries(RELATIVE_UNITS.map((u) => {
    const [one, other, current, adjacent] = DE_RANGES[direction][u];
    return [u, Object.freeze({ one, other, current, adjacent })];
})));

/**
 * One whole unit counted from an anchor that is not today, in German: "am selben Tag", "am Tag davor",
 * "am Tag danach", from each unit's preposition, article and noun.
 */
const DE_UNIT_WORDS = Object.freeze({
    hour: ["in der", "vor der", "Stunde", "in derselben", "vor derselben"],
    day: ["am", "vor dem", "Tag", "am selben", "vor demselben"],
    week: ["in der", "vor der", "Woche", "in derselben", "vor derselben"],
    month: ["im", "vor dem", "Monat", "im selben", "vor demselben"],
    quarter: ["im", "vor dem", "Quartal", "im selben", "vor demselben"],
    year: ["im", "vor dem", "Jahr", "im selben", "vor demselben"]
});
const deAnchored = (direction) => Object.freeze(Object.fromEntries(RELATIVE_UNITS.map((u) => {
    const [at, before, noun, same, beforeSame] = DE_UNIT_WORDS[u];
    const [current, adjacent] = direction === "before" ? [`${beforeSame} ${noun}`, `${before} ${noun} davor`] : [`${same} ${noun}`, `${at} ${noun} ${direction === "last" ? "davor" : "danach"}`];
    return [u, Object.freeze({ current, adjacent })];
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
        quote: '"{value}"',
        true: "true",
        false: "false",
        list: ", ",
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
            this: Object.freeze(Object.fromEntries(RELATIVE_UNITS.map((u) => [u, `this ${u}`])))
        }),
        anchoredRanges: null,
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
        separator: " ",
        filterList: "; ",
        chart: "as a {type}",
        both: "as a table and a {type}",
        chartTypes: Object.freeze({ auto: "chart", bar: "bar chart", line: "line chart", area: "area chart", pie: "pie chart", donut: "donut chart", heatmap: "heatmap chart", combo: "combo chart", treemap: "treemap chart" }),
        invalid: Object.freeze({ one: "(invalid: {count} error, the parts they name are left out)", other: "(invalid: {count} errors, the parts they name are left out)" })
    }),
    de: Object.freeze({
        lang: "de",
        quote: "„{value}“",
        true: REPORT_LABELS.de.true,
        false: REPORT_LABELS.de.false,
        list: "; ",
        aggregators: REPORT_LABELS.de.aggregators,
        valueName: REPORT_LABELS.de.valueName,
        valueOfRows: "{agg} der Zeilen",
        firstValue: "dem ersten Wert",
        countRows: "Anzahl der Zeilen",
        more: "{items} und {count} weitere",
        noItems: "(keine Einträge)",
        blanks: Object.freeze({ exclude: "ohne leere Werte", include: "mit leeren Werten", only: "nur leere Werte" }),
        withBlanks: "{text}, {blanks}",
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
        relative: phrase("{field} ist {range}", "{field} ist nicht {range}"),
        ranges: Object.freeze({
            last: deRanges("last"),
            next: deRanges("next"),
            before: deRanges("before"),
            this: Object.freeze(Object.fromEntries(RELATIVE_UNITS.map((u) => [u, DE_RANGES.last[u][2]])))
        }),
        anchoredRanges: Object.freeze({
            last: deAnchored("last"),
            next: deAnchored("next"),
            before: deAnchored("before"),
            this: Object.freeze(Object.fromEntries(RELATIVE_UNITS.map((u) => [u, deAnchored("last")[u].current])))
        }),
        how: "{text} ({how})",
        rolling: "gleitend",
        currentExcluded: "ohne den laufenden Zeitraum",
        fromAnchor: "gezählt ab {anchor}",
        anchors: Object.freeze({ latest: "dem letzten Datensatz", first: "dem ersten Datensatz" }),
        top: Object.freeze({ one: "der oberste Eintrag von {field} nach {by}", other: "die {count} obersten Einträge von {field} nach {by}" }),
        bottom: Object.freeze({ one: "der unterste Eintrag von {field} nach {by}", other: "die {count} untersten Einträge von {field} nach {by}" }),
        tiesKept: "{text}, gleiche Werte behalten",
        value: phrase("{field} mit {by} {op}", "{field} mit {by} nicht {op}"),
        units: GROUPING_NAMES.de.units,
        derived: "{name}: {field} nach {by}",
        bins: "{name}: {field} nach {by} je {size}",
        sortLabel: "{field} nach Beschriftung, {order}",
        sortValue: "{field} nach {by}, {order}",
        sortColumn: "{field} nach {by} in der Spalte {column}, {order}",
        sortCustom: "{field} in eigener Reihenfolge, {order}",
        orders: Object.freeze({ asc: "aufsteigend", desc: "absteigend" }),
        rows: "nach {fields}",
        cols: "in Spalten: {fields}",
        where: "Filter: {filters}",
        and: "; und ",
        separator: "; ",
        filterList: "; und ",
        chart: "als {type}",
        both: "als Tabelle und {type}",
        chartTypes: Object.freeze({ auto: "Diagramm", bar: "Balkendiagramm", line: "Liniendiagramm", area: "Flächendiagramm", pie: "Kreisdiagramm", donut: "Ringdiagramm", heatmap: "Heatmap", combo: "Balken- und Liniendiagramm", treemap: "Treemap" }),
        invalid: Object.freeze({ one: "(ungültig: {count} Fehler, betroffene Teile fehlen)", other: "(ungültig: {count} Fehler, betroffene Teile fehlen)" })
    })
});

/** A value's kind for a message: "a number", "a list", "null". */
const kindOf = (value) => (value === null ? "null" : Array.isArray(value) ? "a list" : typeof value === "object" ? "a table" : `a ${typeof value}`);

/** A language tag Intl takes ("de", "en-US"), for the plural rules of `lang`. */
function isLanguage(tag) {
    try {
        return Intl.getCanonicalLocales(tag).length === 1;
    } catch {
        return false;
    }
}

/**
 * What is wrong with words a host passes, or null: each key must be one of DESCRIBE_LABELS' (English
 * or German; a table English leaves null, such as `aggregators`, takes the German table's keys), each
 * word a text where those have a text and a table where they have a table; `lang` a language tag.
 * Null and undefined keep the base's word.
 * @param {object} words
 * @param {object[]} [shapes]  the tables at this depth in English and German
 * @param {string} [path]
 * @returns {string | null}  "blanks.exclude is a text, not a number"
 */
export function wordsProblem(words, shapes = [DESCRIBE_LABELS.en, DESCRIBE_LABELS.de], path = "") {
    for (const [key, value] of Object.entries(words)) {
        if (value === undefined || value === null) {
            continue;
        }
        const at = path ? `${path}.${key}` : key;
        const kinds = shapes.filter((s) => Object.hasOwn(s, key) && s[key] !== null).map((s) => s[key]);
        const tables = kinds.filter(isPlainObject);
        const text = kinds.some((k) => typeof k === "string");
        if (!kinds.length) {
            return `${at} is not a word of describeView`;
        }
        if (typeof value === "string" ? !text : !(isPlainObject(value) && tables.length)) {
            return `${at} is ${text && tables.length ? "a text or a table of words" : text ? "a text" : "a table of words"}, not ${kindOf(value)}`;
        }
        if (at === "lang" && !isLanguage(value)) {
            return `lang is a language such as "de", not ${JSON.stringify(value.slice(0, 40))}`;
        }
        const inner = isPlainObject(value) ? wordsProblem(value, tables, at) : null;
        if (inner) {
            return inner;
        }
    }
    return null;
}

/**
 * `words` over `base` at every depth: a table given in part keeps the base's other entries; null and
 * undefined keep the base's. Check `words` with wordsProblem first. Each table of the result is frozen.
 * @param {object} base
 * @param {object} words
 * @returns {any}
 */
export function mergeWords(base, words) {
    const out = { ...base };
    for (const [key, value] of Object.entries(words)) {
        if (value === undefined || value === null) {
            continue;
        }
        const own = Object.hasOwn(out, key) ? out[key] : undefined;
        out[key] = isPlainObject(own) && isPlainObject(value) ? mergeWords(own, value) : value;
    }
    return Object.freeze(out);
}

/** The DESCRIBE_LABELS of a locale's language ("de-DE": German), English for any other. */
const labelsOf = (locale) => (String(locale ?? "").split("-")[0].toLowerCase() === "de" ? DESCRIBE_LABELS.de : DESCRIBE_LABELS.en);

/**
 * The DESCRIBE_LABELS of a locale's language ("de-DE": German), English for any other; `own` words
 * over them at every depth, as describeView's `labels` go over English. Words that name their
 * language (`lang`, as DESCRIBE_LABELS.en does) go over that language's, so no word of the locale's
 * language is left among them. `own` that is not an object, or with a key describeView does not know
 * or a word of the wrong kind (wordsProblem), throws INVALID_ARGUMENT.
 * @param {string} [locale]
 * @param {DescribeLabelsInput} [own]
 * @returns {Readonly<DescribeLabels>}
 */
export function describeLabels(locale, own) {
    if (own === undefined || own === null) {
        return labelsOf(locale);
    }
    if (!isPlainObject(own)) {
        throw new PivotkitError("INVALID_ARGUMENT", `describeLabels: own words must be an object, not ${Array.isArray(own) ? "an array" : typeof own}`);
    }
    const problem = wordsProblem(own);
    if (problem) {
        throw new PivotkitError("INVALID_ARGUMENT", `describeLabels: own words: ${problem}`, { problem });
    }
    return mergeWords(labelsOf(typeof own.lang === "string" ? own.lang : locale), own);
}

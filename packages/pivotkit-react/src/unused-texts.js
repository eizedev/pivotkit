/*
 * What a view asked for and the report could not use, in plain words: one line per issue of
 * pivotkit-core's normalize() (its `code`, VIEW_ISSUE_CODES), with what it is about (a value's name, a
 * field, a zone) and what the report does instead. A chunk of its own, loaded only when a view has
 * such parts (unused-load.js); the warning (unused.jsx) shows the core's short English message until
 * it is here, and keeps it when the chunk fails. English is here; another language is
 * unused-texts-<lang>.js (UNUSED_TEXTS_OF in unused-load.js), English stands in for a text it lacks.
 * A host's texts for them are the `unused` entry of its labels (kept aside by resolveLabels; merged by
 * unusedTexts() in unused-load.js). This module imports nothing: what it needs of the first load (the
 * names of fields and values, fill) comes in `ctx`, so the build keeps it one small chunk.
 */

/** @typedef {typeof en} UnusedTexts */

export const en = {
    // "Quakes: the colour scale needs two or three colours - the default colours are used"
    item: "{subject}: {text}",
    // a key of the view this version does not know, as the subject
    quote: "“{key}”",
    // two lines about different entries with the same name: which one ({part}: the zone or section)
    position: "{subject} (no. {n} in {part})",
    // what an issue is about when no field or value is named
    view: "The view",
    sections: {
        sort: "Sorting",
        derived: "Groupings",
        totals: "Totals",
        collapsed: "Collapsed groups",
        display: "Table or chart",
        chart: "Chart",
        formatting: "Formatting"
    },
    // the setting of an unknown choice ({setting}), by the last part of its path
    settings: {
        display: "display",
        type: "chart type",
        valueLabels: "value labels",
        legend: "legend position",
        axisLabels: "axis labels",
        groupLabels: "group labels",
        labelPosition: "label position",
        other: "setting"
    },
    // what the report does instead, by the part of the view ({dropped} in a text)
    dropped: {
        rows: "it is left out of Rows",
        cols: "it is left out of Columns",
        values: "this value is left out",
        filters: "this filter is left out",
        sort: "the usual order is used",
        derived: "this grouping is left out",
        other: "it is left out"
    },
    codes: {
        notView: "this is not a pivotkit view - the report starts empty",
        notJson: "this is not valid JSON - the report starts empty",
        tooLarge: "the view is too large - the report starts empty",
        badVersion: "the view has an unknown version - the report starts empty",
        newerVersion: "the view comes from a newer pivotkit - the report starts empty; update pivotkit to open it",
        noMigration: "the view cannot be brought to this version - the report starts empty",
        unknownKey: "this setting is unknown here - it is ignored",
        notList: "this is not a list - nothing of it is used",
        tooMany: "more than {max} entries - only the first {max} are used",
        tooManyItems: "more than {max} items - only the first {max} are used",
        itemType: "the item “{value}” does not fit a {type} field - it is left out",
        itemCase: "the data has no item “{value}”, but “{suggestion}” - the filter keeps the item as written",
        unknownField: "the data has no field “{field}” - {dropped}",
        // the same, when the line is about that field itself (Rows, Columns, a filter or a sort)
        unknownFieldHere: "the data has no field of this name - {dropped}",
        placedTwice: "the field is in Rows or Columns twice - only its first place is used",
        groupingNoName: "the grouping has no name - it is left out",
        groupingNameTaken: "the data already has a field of this name - the grouping is left out",
        groupingNoSource: "the data has no field “{field}” to group - the grouping is left out",
        groupingUnknown: "the grouping “{value}” is unknown - it is left out",
        binsNeedNumber: "ranges need a number field, “{field}” is not one - the grouping is left out",
        groupingNeedsDate: "a date grouping needs a date field, “{field}” is not one - the grouping is left out",
        binSize: "ranges need a size above zero - the grouping is left out",
        notValueRef: "this is not a value - {dropped}",
        unknownAggregator: "the calculation “{value}” is unknown - {dropped}",
        aggregatorNeedsField: "{agg} needs a field - {dropped}",
        aggregatorType: "{agg} does not work on “{field}” ({type}) - {dropped}",
        unknownFormat: "the number format “{value}” is unknown - the usual format is used",
        badLabel: "the name is empty or longer than {max} characters - the usual name is used",
        unknownShowAs: "“Show as” “{value}” is unknown - the plain value is shown",
        showAsNotAdditive: "this “Show as” needs a sum or a count, not {agg} - the plain value is shown",
        showAsNotNumber: "{agg} gives no number to show as a share - the plain value is shown",
        unknownConditional: "the colour format “{value}” is unknown - the value is shown without colours",
        conditionalNotNumber: "colours need a number value - the value is shown without colours",
        colorScaleColors: "the colour scale needs two or three colours - the default colours are used",
        dataBarColor: "the bar colour is not a colour - the default colour is used",
        unknownFilterType: "the filter type “{value}” is unknown - this filter is left out",
        filterNoItems: "the filter lists no items - it is left out",
        filterFieldType: "a filter of the type “{value}” does not work on “{field}” ({type}) - this filter is left out",
        filterTextOp: "the text condition “{value}” is unknown - this filter is left out",
        filterMatch: "the text matching is unknown - case and spaces are ignored",
        filterNot: "“not” must be true or false - the filter is not inverted",
        filterBlanks: "what happens to blank items is unknown (“{value}”) - blank items are left out",
        blanksUnspecified: "the filter does not say what happens to blank items - they are left out",
        filterEmpty: "the filter lists no items and keeps no blanks - it keeps nothing",
        filterText: "the text condition has no text, or more than {max} characters - this filter is left out",
        filterNotNumber: "{agg} gives no number to filter by - this filter is left out",
        filterCount: "Top needs a whole number from 1 to {max} - this filter is left out",
        filterValue: "the condition needs a comparison and a number - this filter is left out",
        filterValue2: "“{value}” needs a second number - this filter is left out",
        filterCompareValue: "the comparison needs an operator and a number or a date (2022-03-01) that fits the field - this filter is left out",
        filterRelativeUnit: "the unit “{value}” is unknown (years, months or days) - this filter is left out",
        filterRelativeCount: "the range needs a whole number from 1 to {max} - this filter is left out",
        filterRelativeAnchor: "the range can count back from “today” or from “latest” (the latest record), not from “{value}” - this filter is left out",
        sortNoItems: "the custom order lists no items - the usual order is used",
        sortedTwice: "the field is sorted twice - only its first sort is used",
        badTotals: "the totals cannot be read - the usual totals are shown",
        collapsedPath: "a collapsed group does not fit the fields - it is shown expanded",
        unknownSetting: "the {setting} “{value}” is unknown - the default is used",
        badTitle: "the title is empty or longer than {max} characters - the chart has no title",
        unknownLocale: "the language “{value}” is unknown - the report's language is used",
        unknownTimeZone: "the time zone “{value}” is unknown - the data's time zone is used",
        timeZoneMismatch: "the view was made for the time zone {value}, the data is in {zone} - times are read in {zone}"
    },
    // a problem this version has no text for (a newer pivotkit-core)
    other: "this part could not be used - it is left out"
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (obj, key) => (isObject(obj) && Object.hasOwn(obj, key) ? obj[key] : undefined);
const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** The parts of a view that list fields or values, and the index of the entry an issue's path names. */
const ENTRY = /^(rows|cols|values|filters|sort|derived)\[(\d+)\]/;

/**
 * What a line needs of the report: its labels, fill() and the display names of a field and a value.
 * @typedef {{ labels: import("./labels.js").UiLabels, fill: (template: string, values: Record<string, unknown>) => string,
 *   field: (name: string) => string, value: (spec: { field: string | null, agg: string, label: null, showAs: null }) => string }} UnusedContext
 */

/** A value of a view as written (it may name a field or aggregator the data lacks): its name. */
function valueName(entry, ctx) {
    const label = text(own(entry, "label"));
    if (label) {
        return label;
    }
    const agg = own(entry, "agg");
    if (typeof agg !== "string") {
        return null;
    }
    const field = own(entry, "field");
    return ctx.value({ field: typeof field === "string" ? field : null, agg, label: null, showAs: null });
}

/**
 * What an issue is about, from the view as it was given (`raw`, the input of normalize()): the
 * value's name, the field of a row, column, filter or sort, the grouping's name, else the part of the
 * view (a zone, "Chart", "The view").
 */
function subjectOf(issue, raw, texts, ctx) {
    if (issue.code === "unknownKey") {
        // the key itself, also inside a section ("values[0].lable": "lable")
        return ctx.fill(texts.quote, { key: issue.path.split(".").pop() ?? issue.path });
    }
    const m = ENTRY.exec(issue.path);
    if (m) {
        const list = own(raw, m[1]);
        const entry = Array.isArray(list) ? list[Number(m[2])] : undefined;
        const name = m[1] === "values" ? valueName(entry, ctx) : text(m[1] === "rows" || m[1] === "cols" ? entry : m[1] === "derived" ? own(entry, "name") : own(entry, "field"));
        if (name) {
            return m[1] === "values" || m[1] === "derived" ? name : ctx.field(name);
        }
    }
    const head = /^[a-z]*/i.exec(issue.path)?.[0] ?? "";
    return own(ctx.labels.zones, head) ?? own(texts.sections, head) ?? texts.view;
}

/**
 * One issue in plain words: what it is about and what happened, the core's message aside.
 * @param {import("pivotkit-core").Issue} issue
 * @param {unknown} raw  the view as given to normalize()
 * @param {UnusedTexts} texts  unusedTexts() of the report's language (unused-load.js)
 * @param {UnusedContext} ctx
 * @returns {{ pre: string, subject: string, post: string }}  the text before the subject, the subject, the text after it
 */
export function unusedItem(issue, raw, texts, ctx) {
    const { labels, fill } = ctx;
    const head = /^[a-z]*/i.exec(issue.path)?.[0] ?? "";
    const code = typeof issue.code === "string" ? issue.code : "";
    // "Region: the data has no field of this name" when the line is about the field itself
    const key = code === "unknownField" && /^(rows|cols|filters|sort)\[\d+\]$/.test(issue.path) ? "unknownFieldHere" : code;
    // an issue without a code (a pivotkit-core before the codes): its own English message
    const template = code ? (own(texts.codes, key) ?? texts.other) : "{message}";
    const params = /** @type {import("pivotkit-core").IssueParams} */ (isObject(issue.params) ? issue.params : {});
    const core = labels.core;
    const values = {
        dropped: own(texts.dropped, head) ?? texts.dropped.other,
        setting: own(texts.settings, issue.path.split(".").pop() ?? "") ?? texts.settings.other,
        field: typeof params.field === "string" ? ctx.field(params.field) : "",
        value: params.value ?? "",
        agg: typeof params.agg === "string" ? (own(core.aggregators, params.agg) ?? params.agg) : "",
        type: typeof params.type === "string" ? (own(labels.types, params.type) ?? params.type) : "",
        max: typeof params.max === "number" ? params.max.toLocaleString(labels.lang) : "",
        zone: params.zone ?? "",
        suggestion: params.suggestion ?? "",
        message: issue.message
    };
    // the subject is shown in bold: the item's text around it ("{subject}: {text}"), split before the
    // text from the view goes in, so a name with "{subject}" in it stays a name
    const [before, after = ""] = texts.item.split("{subject}");
    const line = { text: fill(template, values) };
    return { pre: fill(before, line), subject: subjectOf(issue, raw, texts, ctx), post: fill(after, line) };
}

/**
 * The lines of a list of issues: unusedItem() of each, and where two lines about different entries
 * have the same subject (two values both named "Sum of Units"), each with its place ("no. 2 in
 * Values").
 * @param {Array<{ issue: import("pivotkit-core").Issue, raw: unknown }>} notes
 * @param {UnusedTexts} texts
 * @param {UnusedContext} ctx
 */
export function unusedItems(notes, texts, ctx) {
    const items = notes.map((n) => ({ ...unusedItem(n.issue, n.raw, texts, ctx), at: ENTRY.exec(n.issue.path) }));
    const entries = new Map();
    for (const it of items) {
        const set = entries.get(it.subject) ?? new Set();
        set.add(it.at ? it.at[0] : "");
        entries.set(it.subject, set);
    }
    return items.map(({ at, ...it }) => {
        if (!at || entries.get(it.subject).size < 2) {
            return it;
        }
        const part = own(ctx.labels.zones, at[1]) ?? own(texts.sections, at[1]) ?? at[1];
        return { ...it, subject: ctx.fill(texts.position, { subject: it.subject, n: Number(at[2]) + 1, part }) };
    });
}

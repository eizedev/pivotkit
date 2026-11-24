/*
 * The topics of the menus in levels (levels.jsx) as data: one table per menu (a field's, a value's,
 * Table settings, Chart settings, More) drives its first level (a row with the topic's state, or the topic's few choices right
 * there), its levels (a list of choices, or a panel with a form) and its search. A choice of a chip
 * menu says what it does as a pure change of the view (`change()`: the next view and the history's
 * note), so the menus, the search and the tests run the same code; one of the toolbar's menus calls the report
 * (`run()`). Also the pure parts of the levels' keys: arrow keys, type-ahead, a row's name. Loaded
 * with the menus (menus.js).
 */

import { CATALOG, COLOR_SCALES, aggregatorsFor, fieldLabel, formatter, isFormat } from "pivotkit-core";
import { fill, plural } from "./labels.js";
import { dateRangeText, dateDisplayLocale } from "./date-context.js";
import { calendarDays, groupHint, groupStats } from "./group-context.js";
import { columnText, groupingName, refLabel, relativeText, sortText, valueLabels } from "./names.js";
import { ZONES, dateSpan, filterZoneFields, filtersOf, groupField, groupingOf, hiddenAfter, isFiltered, moveField, numericResult, reorder, sameRef, setSort, sortEntry, sortOf, sourceOf } from "./view-ops.js";
import { valueAddsUp } from "pivotkit-core";
import { CHART_TYPES, SLICE_TYPES } from "./chart-types.js";
import { TOTALS, filterState, keepsBlanks, measureChoices, quickChoice, ruleKind, setQuickRange, setRule, setTopFilter, totalNoEffect, updateValue, withMeasure } from "./menu-ops.js";

/**
 * One choice of a topic: a menu item. `change` gives the next view and the history's note, or `run`
 * does what it does; `closes`: the menu closes after it (the chip it belongs to is replaced, or moves
 * away). `checkbox`: a switch (`checked` on or off) instead of one of several; `disabled` with the
 * `reason`; `info`: the id of its explanation (labels.settingInfo). `open`: the id of a topic whose
 * level it opens (after `run`; Back puts the focus on `backTo`, else on the choice), instead of applying; `actions`: an entry's own actions next to it
 * (choices themselves, drawn as icon buttons with `label`); `color`: a colour field beside it, a menu
 * item that opens the browser's colour picker (`pick` gets #rrggbb); `current`: the entry shown now. A switch
 * (`checkbox`) keeps its level open after it, so people flip several in a row.
 * @typedef {{ id: string, text: string, change?: () => { view: any, note: any } | null, run?: () => void, checked?: boolean,
 *   hint?: string, icon?: string, closes?: boolean, checkbox?: boolean, disabled?: boolean, reason?: string, info?: string,
 *   keywords?: string, open?: string, backTo?: string, actions?: Array<Choice & { label: string }>, current?: boolean, testId?: string, label?: string,
 *   color?: { id: string, value: string, label: string, pick: (color: string) => void },
 *   tags?: Array<{ icon: string, text: string }>, className?: string, note?: string, scale?: string[] }} Choice
 * `tags`: small marks after the text (the zones a field is in), hidden from assistive technology;
 * `scale`: the colours of a colour scale, low to high, drawn as a strip after the text;
 * `note`: a line under the text that says what choosing it does, read with it; `className`: the
 * item's own class (a field's type).
 */

/**
 * One topic of a menu. `kind`: "segmented" its choices on the first level side by side, "inline" one
 * below the other (`titled`: under its title), "menu" a row that opens a level with its choices,
 * "panel" a row that opens a level with a form (the menu's component draws it, by the topic's id).
 * `state` is what is set, in short, on the row's right; `changed` marks a setting that is not the
 * default; `info` the id of an explanation next to the level's title. `hidden`: a level a choice
 * opens, with no row of its own (`levelTitle` its title); `note`: a line under its choices.
 * @typedef {{ id: string, title: string, kind: "segmented" | "inline" | "menu" | "panel", testId?: string,
 *   groups?: Array<{ title?: string, choices: Choice[] }>, state?: string | null, changed?: boolean,
 *   icon?: string, titled?: boolean, info?: string, hidden?: boolean, levelTitle?: string, note?: string | null, noteId?: string, intro?: string,
 *   keywords?: string, searchExtra?: Array<{ id: string, text: string, focus?: string, choice?: Choice, keywords?: string }>,
 *   searchFor?: (query: string) => Array<{ id: string, text: string, focus?: string, choice: Choice, keywords?: string }> }} Topic
 * `keywords`: more words the search finds the topic's entries by (a choice's own `keywords` put it
 * first among the hits for them); `searchExtra`: more entries of a panel topic (a part of its level,
 * or a quick choice of it); `searchFor`: entries made from what is typed ("last 3 years", "from 2022").
 */

/** The formats the value menu offers first, and those under "More formats"; any other format of a view still works. */
export const FORMAT_CHOICES = Object.freeze(["number", "number:0", "number:2", "currency", "percent"].filter(isFormat));
export const MORE_FORMATS = Object.freeze(["compact", "bytes", "duration:h", "duration:s"].filter(isFormat));
/** A format of a view that writes a number as an offered one does, checked as that one: "integer" is "number:0". */
const SAME_FORMAT = Object.freeze({ integer: "number:0" });

/**
 * The offered format a view's format is (SAME_FORMAT; a currency that writes the example as the
 * offered Currency does is that one: pivotkit-core's own currency named by its code), else the
 * format itself.
 * @param {string | null | undefined} format
 * @param {(f: string) => string} example  a format's example in the report's locale
 */
function offeredAs(format, example) {
    if (!format) {
        return format;
    }
    if (Object.hasOwn(SAME_FORMAT, format)) {
        return SAME_FORMAT[format];
    }
    return /^currency:/i.test(format) && example(format) === example("currency") ? "currency" : format;
}
/** The calculations offered first; the others are under "More calculations". */
const COMMON_SHOW_AS = CATALOG.showAs.filter((s) => ["percentOfGrandTotal", "percentOfRowTotal", "percentOfColumnTotal"].includes(s));
/** The number a format's example shows, by the kind of number the format is for. */
const EXAMPLE = Object.freeze({ percent: 0.25, bytes: 1536000, "duration:h": 1.5, "duration:s": 3725 });

/** The quick choices of Top items, besides Off and a count of one's own. */
export const TOP_COUNTS = Object.freeze([3, 5, 10]);

/**
 * Move to another zone, and left or right in its own: each closes the menu (the chip moves).
 * @returns {Topic}
 */
function moveTopic(view, zone, index, count, labels, name, type, defaults) {
    const note = (z) => ({ step: "moved", field: name, zone: z });
    // into Values: a new value, counted or summed by the field's settings (an identifier is counted)
    /** @type {Choice[]} */
    const choices = ZONES.filter((z) => z !== zone).map((z) => ({ id: `move-${z}`, text: fill(labels.moveTo, { zone: labels.zones[z] }), icon: "chevronRight", closes: true, change: () => ({ view: moveField(view, zone, index, z, undefined, { type, defaults: z === "values" ? defaults : undefined }), note: note(z) }) }));
    if (zone !== "filters" && index > 0) {
        choices.push({ id: "move-left", text: labels.moveLeft, icon: "chevronRight", closes: true, change: () => ({ view: reorder(view, zone, index, index - 1), note: { step: "reordered", zone } }) });
    }
    if (zone !== "filters" && index < count - 1) {
        choices.push({ id: "move-right", text: labels.moveRight, icon: "chevronRight", closes: true, change: () => ({ view: reorder(view, zone, index, index + 1), note: { step: "reordered", zone } }) });
    }
    return { id: "move", title: labels.moveToTitle, kind: "menu", icon: "swap", groups: [{ choices }] };
}

/**
 * The topics of a field's menu on Rows or Columns: sort by label (side by side), sort by a value,
 * Filter, the grouping of a date or a number, Top items, Move to.
 * @param {{ view: any, zone: string, index: number, field: string, types: Map<string, string>,
 *   labels: any, locale: string, state?: any, defaultsOf?: (field: string) => any, encoded?: any, limits?: Partial<import("pivotkit-core").Limits> }} input
 *   `state`: the chip's state (zones.jsx), for the filter's "3 of 12"; `limits`: the host's (LimitsContext); `encoded`: the data, for the
 *   search's quick choices of a date field
 * @returns {Topic[]}
 */
export function axisTopics({ view, zone, index, field, types, labels, locale, state, defaultsOf, encoded, limits }) {
    const source = sourceOf(view, field);
    const name = fieldLabel(field, labels.core);
    const sourceType = types.get(source.toLowerCase());
    const date = sourceType === "date";
    const grouping = groupingOf(view, field);
    const sort = sortOf(view, field);
    const number = (x) => x.toLocaleString(locale, { maximumFractionDigits: 6 });
    // the values a sort can go by (one the view no longer shows stays a choice while it sorts)
    const measures = withMeasure(measureChoices(view, (f) => types.get(f.toLowerCase())), sort?.by === "value" ? sort.value : null);
    // the custom order of the view, else the host's for the field (fieldDefaults.order); a grouped
    // field has items of its own
    const hostOrder = source === field ? defaultsOf?.(source)?.order : undefined;
    const hosted = Array.isArray(hostOrder) && hostOrder.length > 0;
    const customItems = sort?.by === "custom" ? sort.items : hosted ? hostOrder : null;
    // the menu's choices sort by the whole row: none is checked while one column decides (#70)
    const isSort = (by, order, ref) => (sort ? sort.by === by && sort.order === order && (by !== "value" || (sameRef(sort.value, ref) && !sort.column)) : by === "label" && order === "asc");
    /** @returns {Choice} */
    const sortChoice = (id, text, by, order, ref, icon) => ({
        id: `sort-${id}`,
        text,
        icon,
        checked: isSort(by, order, ref),
        change: () => {
            const spec = by === "value" ? { by, order, value: ref } : by === "custom" ? { by, order, items: [...customItems] } : { by, order };
            return { view: setSort(view, field, sortEntry(spec, hosted)), note: { step: "sort", field: name } };
        }
    });
    const byValue = measures.flatMap((m, i) => {
        const value = refLabel(view, m, labels);
        return [sortChoice(`value-desc-${i}`, fill(labels.sortValueDesc, { value }), "value", "desc", m, "sortDesc"), sortChoice(`value-asc-${i}`, fill(labels.sortValueAsc, { value }), "value", "asc", m, "sortAsc")];
    });
    if (customItems) {
        byValue.push(sortChoice("custom", labels.sortCustom, "custom", "asc", null, "sortAsc"), sortChoice("custom-desc", labels.sortCustomDesc, "custom", "desc", null, "sortDesc"));
    }
    const otherSort = sort && sort.by !== "label" ? sortText(view, sort, labels, sort.column && encoded ? columnText(view, sort.column, encoded, labels, locale, limits) : undefined) : null;
    /** @type {Topic[]} */
    const topics = [
        {
            id: "sort",
            title: labels.sort,
            kind: "segmented",
            icon: "sortAsc",
            // a sort by a value (or a custom order) is said here too: the segments then show none
            state: otherSort,
            changed: Boolean(otherSort),
            groups: [{ choices: [sortChoice("label-asc", date ? labels.sortOldestShort : labels.sortLabelAsc, "label", "asc", null), sortChoice("label-desc", date ? labels.sortNewestShort : labels.sortLabelDesc, "label", "desc", null)] }]
        },
        // one value: largest and smallest first right here; more: a level of their own
        { id: "sortValue", title: labels.sortByValue, kind: byValue.length <= 2 ? "inline" : "menu", icon: "sortDesc", state: otherSort, changed: Boolean(otherSort), groups: [{ choices: byValue }] },
        filterTopic({ view, field, labels, locale, state, encoded })
    ];
    if (date) {
        topics.push(groupTopic({ view, field, source, labels, locale, encoded }));
    } else if (sourceType === "number") {
        const bins = grouping?.by === "bin" ? grouping : null;
        topics.push({ id: "bins", title: labels.bins, kind: "panel", icon: "number", state: bins ? fill(labels.binsState, { size: number(bins.size), start: number(bins.origin ?? 0) }) : labels.off, changed: Boolean(bins) });
    }
    const top = filtersOf(view, field, ["top"])[0];
    const topBy = top?.by ?? measureChoices(view, (f) => types.get(f.toLowerCase()))[0];
    topics.push({
        id: "top",
        title: labels.topN,
        kind: "panel",
        icon: "top",
        state: top ? topText(view, top, labels, locale) : labels.off,
        changed: Boolean(top),
        // Top 3, Top 5, Top 10 are found ("top 5", "5") and apply at once from the search
        searchExtra: TOP_COUNTS.map((n) => ({
            id: `top-${n}`,
            text: fill(labels.topBadge, { count: n.toLocaleString(locale) }),
            choice: { id: `top-${n}`, text: fill(labels.topBadge, { count: n.toLocaleString(locale) }), checked: Boolean(top && !top.bottom && top.count === n), change: () => ({ view: setTopFilter(view, field, { count: n, bottom: false, by: topBy }, top), note: { step: "top", field: name } }) }
        }))
    });
    topics.push(nameTopic(view, field, labels));
    topics.push(moveTopic(view, zone, index, view[zone].length, labels, name, sourceType, defaultsOf?.(field)));
    return topics;
}

/**
 * Name: the field's own name in the report (#158), a level with a text field (chip-menus.jsx
 * FieldNameLevel). Its state is the name the report shows.
 * @returns {Topic}
 */
function nameTopic(view, field, labels) {
    const own = Object.entries(view.fieldLabels ?? {}).some(([key]) => key.toLowerCase() === field.toLowerCase());
    return { id: "name", title: labels.rename, kind: "panel", icon: "text", state: fieldLabel(field, labels.core), changed: own, keywords: labels.nameKeywords };
}

/** The search's "a number" in what is typed: "last 3 years" 3, "from 2022" 2022. */
const NUMBER_TYPED = /\d+/;

/**
 * The Filter topic of a field's menu: its state in words ("last 5 years (2022–2026)", "3 of 12"), the
 * rules found by their names (they open the level on them), and from what is typed in the search,
 * for a date field: the quick choices with that count ("Last 3 years (2024–2026)") and, for a grouping
 * by year, a year compared ("From 2022"), applied at once.
 * @param {{ view: any, field: string, labels: any, locale: string, state?: any, encoded?: any }} input
 * @returns {Topic}
 */
export function filterTopic({ view, field, labels, locale, state, encoded }) {
    const name = fieldLabel(field, labels.core);
    const note = { step: "filter", field: name };
    const filtered = filterState(view, field, state, labels, locale);
    const fk = encoded ? ruleKind(encoded, view, field) : null;
    const timeZone = encoded?.timeZone ?? "UTC";
    const capital = (text) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
    /** @type {Topic["searchFor"]} */
    const searchFor = fk?.quick
        ? (query) => {
              const n = Number(NUMBER_TYPED.exec(query)?.[0]);
              if (!Number.isSafeInteger(n) || n < 1) {
                  return [];
              }
              const units = n > CATALOG.relativeMaxCount ? [] : fk.months ? ["year", "month"] : ["year"];
              // the range takes the place of the quick choice, counts back from what the field's range does
              // now (the latest record, or today) and keeps the blanks as the field's rules do
              const anchor = filtersOf(view, field, ["relative"])[0]?.anchor;
              const previous = quickChoice(view, field, fk).filters[0] ?? null;
              const blanks = keepsBlanks(view, field) ? "include" : "exclude";
              // the same words as the chip and the Filter level: "Last 3 years (2024–2025; 2026 has no data)"
              const span = dateSpan(encoded, sourceOf(view, field));
              const ranges = units.map((unit) => {
                  const text = capital(relativeText({ unit, count: n, anchor }, labels, locale, timeZone, undefined, span));
                  return { id: `quick-${unit}-${n}`, text, choice: { id: `quick-${unit}-${n}`, text, change: () => ({ view: setQuickRange(view, field, { unit, count: n, anchor, blanks }, previous), note }) } };
              });
              // a year of a grouping by year, written as its chip will say it ("from 2022"); a date
              // field compares days, which the rule editor picks
              const keyed = fk.item === "group" && n >= 1000 && n <= 9999 && view.derived.some((d) => d.name.toLowerCase() === field.toLowerCase() && d.by === "year");
              if (!keyed) {
                  return ranges;
              }
              const compares = [">=", "<=", "<", ">"].map((op) => {
                  const entry = { field, type: "compare", op, value: n, not: false, blanks: "exclude" };
                  // the words of the chip, with the year as typed ("from 2022", not a date)
                  const text = capital(fill(labels.compareShort[op], { value: String(n) }));
                  return { id: `compare-${op}-${n}`, text, choice: { id: `compare-${op}-${n}`, text, change: () => ({ view: setRule(view, field, null, entry), note }) } };
              });
              return [...compares, ...ranges];
          }
        : undefined;
    return {
        id: "filter",
        title: labels.filterTopic,
        kind: "panel",
        icon: "filter",
        state: filtered ?? labels.filterAll,
        changed: filtered !== null,
        keywords: labels.filterKeywords,
        // the rules are found by their names, and open the level on them
        searchExtra: [
            { id: "open-filter-rules", text: labels.rulesTitle, focus: "conditions" },
            // the rule on the name by its operators too ("does not begin with")
            // both add a rule: "rule" finds them under their "Filter by …" names
            { id: "open-filter-text", text: labels.addRuleName, focus: "conditions", keywords: `${labels.rulesTitle} ${Object.values(labels.labelOps).join(" ")}` },
            { id: "open-filter-value", text: labels.addRuleTotal, focus: "conditions", keywords: labels.rulesTitle }
        ],
        searchFor
    };
}

/**
 * The Group topic of a date: its units along the time line and over the years, each with what it
 * makes of the data (groupHint), and None. A unit replaces the field with its grouping, in Rows,
 * Columns or Filters, in the same place (another chip: the menu closes).
 * @param {{ view: any, field: string, source: string, labels: any, locale: string, encoded?: any }} input
 * @returns {Topic}
 */
function groupTopic({ view, field, source, labels, locale, encoded }) {
    const grouping = groupingOf(view, field);
    const stats = groupStats(encoded, source);
    const span = stats?.span;
    const dateLocale = dateDisplayLocale(view.formatting?.locale || locale);
    const regroup = (unit) => () => {
        const sourceName = fieldLabel(source, labels.core);
        const grouped = unit ? groupingName(sourceName, unit, labels) : null;
        return { view: groupField(view, field, unit, { name: grouped ?? undefined }).view, note: { step: "group", field: sourceName } };
    };
    const unit = (u) => ({ id: `group-${u}`, text: labels.units[u] ?? u, hint: groupHint(encoded, source, u, dateLocale, labels, stats), checked: grouping?.by === u, closes: true, change: regroup(u) });
    return {
        id: "group",
        // the data's range, and for a filtered field that another grouping clears the filter
        intro: [span ? fill(plural(labels.groupDataRange, calendarDays(span), { lang: labels.lang, locale: dateLocale }), { range: dateRangeText(span, dateLocale) }) : "", isFiltered(view, field) ? labels.groupClearsFilter : ""].filter(Boolean).join(" ") || undefined,
        title: labels.groupTopic,
        kind: "menu",
        icon: "date",
        state: grouping ? labels.units[grouping.by] ?? grouping.by : labels.groupNoneShort,
        changed: Boolean(grouping),
        groups: [
            { title: labels.groupTimeline, choices: CATALOG.timelineUnits.map(unit) },
            { title: labels.groupCyclic, choices: CATALOG.cyclicUnits.map(unit) },
            { choices: [{ id: "group-none", text: labels.groupNone, checked: !grouping, closes: true, change: regroup(null) }] }
        ]
    };
}

/**
 * The topics of a field's menu in Filters (the whole report): Filter, Group for a date, Move to.
 * @param {{ view: any, index: number, field: string, types: Map<string, string>, labels: any, locale: string, state?: any, encoded?: any }} input
 * @returns {Topic[]}
 */
export function filterZoneTopics({ view, index, field, types, labels, locale, state, encoded }) {
    const source = sourceOf(view, field);
    const type = types.get(source.toLowerCase());
    return [
        filterTopic({ view, field, labels, locale, state, encoded }),
        ...(type === "date" ? [groupTopic({ view, field, source, labels, locale, encoded })] : []),
        nameTopic(view, field, labels),
        moveTopic(view, "filters", index, filterZoneFields(view).length, labels, fieldLabel(field, labels.core), type)
    ];
}

/**
 * A Top items filter in words: "Top 10 by Sum of Revenue", "Bottom 3 by Count".
 * @param {any} view
 * @param {{ count: number, bottom?: boolean, by?: { field: string | null, agg: string } }} top
 */
export function topText(view, top, labels, locale) {
    const by = top.by ?? (view.values?.[0] ? { field: view.values[0].field ?? null, agg: view.values[0].agg } : null);
    return `${fill(top.bottom ? labels.bottomBadge : labels.topBadge, { count: top.count.toLocaleString(locale) })} ${fill(labels.by, { value: refLabel(view, by, labels) })}`;
}

/**
 * A format in words: its own label, a number with other decimals ("Number, 1 decimal"), a currency
 * with its code ("Currency (USD)"), else the label of its kind, else its name.
 * @param {string} format
 */
export function formatLabel(format, labels, locale) {
    if (Object.hasOwn(labels.formats, format)) {
        return labels.formats[format];
    }
    const decimals = /^number:(\d+)$/.exec(format);
    if (decimals) {
        return plural(labels.formatDecimals, Number(decimals[1]), { lang: labels.lang, locale });
    }
    const [kind, code] = format.split(":");
    if (kind === "currency" && code && Object.hasOwn(labels.formats, kind)) {
        // the code tells it from the offered Currency (pivotkit-core's own, the euro)
        return `${labels.formats.currency} (${code.toUpperCase()})`;
    }
    return Object.hasOwn(labels.formats, kind) ? labels.formats[kind] : format;
}

/** The theme's colour scale as a strip: its low, middle and high tokens (styles.css; table.jsx SCALE_MID). */
const THEME_SCALE = Object.freeze(["var(--pk-scale-low)", "var(--pk-scale-mid, color-mix(in srgb, var(--pk-scale-low), var(--pk-scale-high)))", "var(--pk-scale-high)"]);

/**
 * The colours of a value's colour scale (Highlight › Colour scale on): the theme's, then pivotkit-core's
 * COLOR_SCALES, each with its colours as a strip; a view's own colours (from a file or a link) stay
 * a choice of their own while they are set. A choice writes `conditional.colors`; the theme's writes none.
 * @param {string[]} colors  the value's own colours ([] for the theme's)
 * @param {(colors: string[]) => () => { view: any, note: any }} write
 * @returns {Topic}
 */
function scaleTopic(colors, write, labels) {
    const same = (list) => list.length === colors.length && list.every((c, i) => c.toLowerCase() === colors[i].toLowerCase());
    const presets = Object.entries(COLOR_SCALES).map(([key, list]) => ({ key, list: [...list] }));
    const own = colors.length > 0 && !presets.some((p) => same(p.list));
    /** @type {Choice[]} */
    const choices = [
        { id: "scale-theme", text: labels.scaleNames.theme, scale: [...THEME_SCALE], checked: colors.length === 0, change: colors.length === 0 ? () => null : write([]) },
        ...presets.map(({ key, list }) => ({ id: `scale-${key}`, text: labels.scaleNames[key], note: key === "redGreen" ? labels.scaleRedGreenHint : undefined, scale: list, checked: same(list), change: same(list) ? () => null : write(list) })),
        ...(own ? [{ id: "scale-own", text: labels.scaleOwn, scale: colors, checked: true, change: () => null }] : [])
    ];
    const current = choices.find((c) => c.checked);
    return { id: "scaleColors", title: labels.scaleColors, kind: "menu", icon: "heatmap", state: current?.text, changed: colors.length > 0, keywords: labels.scaleKeywords, groups: [{ choices }] };
}

/**
 * The topics of a value's menu: Summarize by, Show as, Number format (each a level), Highlight (side
 * by side), Name, Move to. A value whose result is no number has no Show as, format or highlight.
 * @param {{ view: any, index: number, types: Map<string, string>, labels: any, locale: string, defaultsOf?: (field: string) => any,
 *   earlier?: () => any[] }} input  `earlier`: the history's views before this one, oldest first
 * @returns {Topic[]}
 */
export function valueTopics({ view, index, types, labels, locale, defaultsOf, earlier }) {
    const spec = view.values[index];
    const type = spec.field ? types.get(spec.field.toLowerCase()) ?? "string" : "number";
    const defaults = spec.field ? defaultsOf?.(spec.field) : undefined;
    const name = valueLabels(view.values, labels)[index];
    const set = (patch) => () => ({ view: updateValue(view, index, patch, { defaults }), note: { step: "value", field: name } });
    const aggs = spec.field ? aggregatorsFor(type) : ["count"];
    // another aggregator is another chip (its key): the menu closes
    const agg = (a) => ({ id: `agg-${a}`, text: labels.core.aggregators[a] ?? a, checked: spec.agg === a, closes: true, change: set({ agg: a }) });
    const rare = aggs.filter((a) => !CATALOG.commonAggregators.includes(a));
    /** @type {Topic[]} */
    const topics = [
        {
            id: "summarize",
            title: labels.aggregation,
            kind: "menu",
            icon: "sigma",
            state: labels.core.aggregators[spec.agg] ?? spec.agg,
            groups: [{ choices: CATALOG.commonAggregators.filter((a) => aggs.includes(a)).map(agg) }, ...(rare.length ? [{ title: labels.moreStatistics, choices: rare.map(agg) }] : [])]
        }
    ];
    if (numericResult(spec, type)) {
        // the shares in percent are found as "percent" too, before the number format of that name
        const showAs = (s) => {
            const text = labels.showAsNames[s] ?? s;
            return { id: `showas-${s}`, text, keywords: text.includes("%") ? labels.showAsKeywords : undefined, checked: spec.showAs?.type === s, change: set({ showAs: { type: s, axis: spec.showAs?.axis ?? "rows" } }) };
        };
        const along = spec.showAs && CATALOG.showAsAlongAxis.includes(spec.showAs.type) ? spec.showAs : null;
        topics.push({
            id: "showAs",
            title: labels.showAs,
            kind: "menu",
            info: "showAs",
            icon: "table",
            state: spec.showAs ? labels.showAsNames[spec.showAs.type] ?? spec.showAs.type : labels.showAsNone,
            changed: Boolean(spec.showAs),
            groups: [
                { choices: [{ id: "showas-none", text: labels.showAsNone, checked: !spec.showAs, change: set({ showAs: null }) }, ...COMMON_SHOW_AS.map(showAs)] },
                { title: labels.moreCalculations, choices: CATALOG.showAs.filter((s) => !COMMON_SHOW_AS.includes(s)).map(showAs) },
                ...(along ? [{ title: labels.along, choices: ["rows", "cols"].map((axis) => ({ id: `along-${axis}`, text: labels.zones[axis], checked: along.axis === axis, change: set({ showAs: { ...along, axis } }) })) }] : [])
            ]
        });
        const example = (f) => formatter(f, { locale })(Object.hasOwn(EXAMPLE, f) ? EXAMPLE[f] : 1234.5);
        // Percent reads the value as a share (0.25 is 25%): its example shows both
        const hint = (f) => (f === "percent" ? `${formatter("number", { locale })(EXAMPLE.percent)} → ${example(f)}` : example(f));
        const own = offeredAs(spec.format, example);
        const format = (f) => ({ id: `format-${f}`, text: labels.formats[f] ?? f, hint: hint(f), keywords: labels.formatKeywords[f], checked: own === f, change: set({ format: f }) });
        const formatName = own ? formatLabel(own, labels, locale) : labels.formatAuto;
        // a format of the view that is not offered (number:1 from a host's defaults): checked, first
        const offered = !own || FORMAT_CHOICES.includes(own) || MORE_FORMATS.includes(own);
        topics.push({
            id: "format",
            title: labels.format,
            kind: "menu",
            icon: "number",
            state: formatName,
            changed: Boolean(spec.format) && spec.format !== defaults?.format,
            groups: [
                {
                    choices: [
                        ...(offered ? [] : [{ id: "format-current", text: formatName, hint: example(spec.format), checked: true, change: set({ format: spec.format }) }]),
                        { id: "format-auto", text: labels.formatAuto, checked: !spec.format, change: set({ format: null }) },
                        ...FORMAT_CHOICES.map(format)
                    ]
                },
                { title: labels.moreFormats, choices: MORE_FORMATS.map(format) }
            ]
        });
        /**
         * A highlight of the value: its own of that type when it had one (the view's colours; also an
         * earlier step's, so None and back keeps them), else the theme's colours (pivotkit-core's
         * DEFAULT_THEME gives them).
         */
        const ownOf = (type) => {
            const same = (v) => v.agg === spec.agg && (v.field ?? null) === (spec.field ?? null);
            for (const v of [view, ...[...(earlier?.() ?? [])].reverse()]) {
                const c = (v.values ?? []).find(same)?.conditional;
                if (c?.type === type) {
                    return c;
                }
            }
            return type === "colorScale" ? { type } : { type, color: null };
        };
        const highlight = (id, text, type) => {
            const checked = (spec.conditional?.type ?? null) === type;
            return { id, text, checked, change: checked ? () => null : set({ conditional: type ? ownOf(type) : null }) };
        };
        // three choices: side by side on the first level
        topics.push({
            id: "highlight",
            title: labels.conditional,
            kind: "segmented",
            icon: "sparkle",
            changed: Boolean(spec.conditional),
            groups: [
                {
                    // the one checked changes nothing; another brings back the value's own colours of that kind
                    choices: [
                        highlight("cond-none", labels.conditionalNone, null),
                        highlight("cond-colorScale", labels.colorScale, "colorScale"),
                        highlight("cond-dataBar", labels.dataBar, "dataBar")
                    ]
                }
            ]
        });
    }
    if (spec.conditional?.type === "colorScale") {
        topics.push(scaleTopic(spec.conditional.colors ?? [], (colors) => set({ conditional: { type: "colorScale", colors } }), labels));
    }
    topics.push({ id: "name", title: labels.rename, kind: "panel", icon: "text", state: name, changed: Boolean(spec.label), keywords: labels.nameKeywords });
    topics.push(moveTopic(view, "values", index, view.values.length, labels, name, type));
    return topics;
}

/**
 * The words of folding the groups of Rows (Expand all and Collapse all), from the fields: Collapse all
 * keeps the first field's groups ("Show Region only"), Expand all shows every item of the last field
 * ("Show each Country"). With fewer than two fields in Rows there is nothing to name: the plain words
 * ("Show details", "Show group totals only"), `named` false.
 * @param {any} view
 * @param {any} labels  with the menus' texts
 * @returns {{ expand: string, collapse: string, named: boolean }}
 */
export function rowFoldTexts(view, labels) {
    if (view.rows.length < 2) {
        return { expand: labels.chartShowDetails, collapse: labels.chartShowTotals, named: false };
    }
    const name = (/** @type {string} */ f) => fieldLabel(f, labels.core);
    return { expand: fill(labels.chartShowEach, { field: name(view.rows.at(-1)) }), collapse: fill(labels.chartShowOnly, { field: name(view.rows[0]) }), named: true };
}

/**
 * How the groups of Rows show, in short, for a row's state: every item of the last field ("Each
 * Country", the default), the first field's groups only ("Region only"), or some groups collapsed.
 * @param {any} view  with two or more fields in Rows
 * @param {{ canCollapse: boolean, collapsed: number }} folding  rowFolding() of view-ops.js
 * @param {any} labels
 * @returns {{ text: string, changed: boolean }}
 */
function foldState(view, folding, labels) {
    const name = (/** @type {string} */ f) => fieldLabel(f, labels.core);
    if (!folding.collapsed) {
        return { text: fill(labels.chartFoldEach, { field: name(view.rows.at(-1)) }), changed: false };
    }
    return { text: folding.canCollapse ? labels.chartFoldSome : fill(labels.chartFoldOnly, { field: name(view.rows[0]) }), changed: true };
}

/**
 * Expand all and Collapse all as choices: each closes the menu, and says why while it does nothing.
 * @param {{ canExpand: boolean, canCollapse: boolean, why: { expand?: string | null, collapse?: string | null } }} folding  rowFolding() of view-ops.js
 * @param {any} labels
 * @param {{ expand: () => void, collapse: () => void }} act
 * @param {{ expand: string, collapse: string, hint?: string }} words
 * @param {[string, string]} ids
 * @returns {Choice[]}
 */
function foldChoices(folding, labels, act, words, ids) {
    const why = (/** @type {string | null | undefined} */ key) => (key && Object.hasOwn(labels, key) ? labels[key] : undefined);
    return [
        { id: ids[0], text: words.expand, icon: "plus", closes: true, disabled: !folding.canExpand, reason: why(folding.why.expand), run: act.expand },
        { id: ids[1], text: words.collapse, icon: "chevronRight", hint: words.hint, closes: true, disabled: !folding.canCollapse, reason: why(folding.why.collapse), run: act.collapse }
    ];
}

/**
 * The Table settings menu: the totals as switches (off, with the reason, where the table has no such
 * total), then Rows with Expand all and Collapse all; Collapse all says what it keeps in the chart's
 * words ("Show Region only"). A switch applies at once and the menu stays open; Expand all and
 * Collapse all close it.
 * @param {{ view: any, labels: any, folding: { canExpand: boolean, canCollapse: boolean, why: any },
 *   act: { total: (key: string, on: boolean) => void, expand: () => void, collapse: () => void } }} input
 * @returns {Topic[]}
 */
export function tableTopics({ view, labels, folding, act }) {
    const words = rowFoldTexts(view, labels);
    return [
        {
            id: "totals",
            title: labels.totals,
            kind: "inline",
            titled: true,
            groups: [
                {
                    choices: TOTALS.map((key) => {
                        const why = totalNoEffect(view, key);
                        // a switch that changes nothing shows no tick: the table has no such total
                        return { id: `total-${key}`, text: labels[key], checkbox: true, checked: why === null && view.totals[key], disabled: why !== null, reason: why ? labels[why] : undefined, info: key, run: () => act.total(key, !view.totals[key]) };
                    })
                }
            ]
        },
        {
            id: "rows",
            title: labels.zones.rows,
            kind: "inline",
            titled: true,
            groups: [{ choices: foldChoices(folding, labels, act, { expand: labels.expandAll, collapse: labels.collapseAll, hint: words.named ? words.collapse : undefined }, ["expand-all", "collapse-all"]) }]
        }
    ];
}

/**
 * The topics of "More": Help first, a level with the tips' switches (where the host leaves them to
 * the user) and a row that opens the keyboard shortcuts (a panel, toolbar-panels.jsx). The toolbar's
 * buttons that moved into More follow below it (toolbar.jsx).
 * @param {{ labels: any, tips: { controls: boolean, on: boolean, canReset: boolean }, explanations: { on: boolean } | null,
 *   act: { tipsOn: (on: boolean) => void, resetTips: () => void, explain: (on: boolean) => void } }} input
 * @returns {Topic[]}
 */
export function moreTopics({ labels, tips, explanations, act }) {
    /** @type {Choice[]} */
    const help = [];
    if (tips.controls) {
        help.push({ id: "show-tips", text: labels.showTips, checkbox: true, checked: tips.on, run: () => act.tipsOn(!tips.on) });
    }
    if (explanations) {
        help.push({ id: "show-explanations", text: labels.showSettingInfo, checkbox: true, checked: explanations.on, run: () => act.explain(!explanations.on) });
    }
    if (tips.controls) {
        help.push({ id: "reset-tips", text: labels.resetTips, icon: "reset", disabled: !tips.canReset, run: act.resetTips });
    }
    help.push({ id: "shortcuts", text: labels.shortcutsTitle, icon: "info", open: "shortcuts" });
    return [
        { id: "help", title: labels.helpAndShortcuts, levelTitle: labels.help, kind: "menu", icon: "info", testId: "more-help", groups: [{ choices: help }] },
        { id: "shortcuts", title: labels.shortcutsTitle, kind: "panel", hidden: true, levelTitle: `${labels.help} › ${labels.shortcutsTitle}` }
    ];
}

/** The value labels a chart type offers: a share in percent is a pie's and a donut's. */
const VALUE_LABELS = Object.freeze({ slices: ["auto", "off", "value", "percent", "both"], other: ["auto", "off", "value"] });

/**
 * The topics of Chart settings after its types (#106, #580), each a row with what is set that opens
 * its level: Value labels, Legend, Title (a form), Axis (axis and group labels, the zoom slider),
 * Tooltip (and the share in it), Reference lines (a form), Series (one switch and one colour per
 * series or slice) and Layout (100 % stacks, smooth lines, a pie's label position, the groups of
 * Rows folded). A topic the chart has nothing for is left out. Every choice applies `act.display(patch)`
 * (pivotkit-core's chart settings); the type stays. Reference lines come after Tooltip: a level with
 * a form (toolbar-panels.jsx), its row saying which lines are on.
 * @param {{ view: any, drawn: string, labels: any, names: string[], act: { display: (patch: object) => void, expand?: () => void, collapse?: () => void }, drawnColors?: Map<string, string>,
 *   lines?: { rules: { average: boolean, trend: boolean, target: boolean, extremes: boolean, notes?: string[] }, targetText: string },
 *   folding?: { canExpand: boolean, canCollapse: boolean, collapsed: number, why: any } }} input
 *   `drawn`: the picker entry drawn (chart-types.js); `names`: the legend's entries (series, a pie's slices);
 *   `lines`: which reference lines the chart can draw (pivotkit-core's referenceLineChecks, or its
 *   view's rules with the note "table" while the chart is not drawn yet), and the target as the locale writes it;
 *   `drawnColors`: the colour the chart draws each name with, as #rrggbb (the colour fields start from it);
 *   `folding`: rowFolding() of view-ops.js. With it, Layout ends with the groups of Rows folded or
 *   not, in the words of the fields ("Show each Country", "Show Region only"; rowFoldTexts)
 * @returns {Topic[]}
 */
export function chartTopics({ view, drawn, labels, names, act, lines = { rules: { average: true, trend: true, target: true, extremes: true, notes: [] }, targetText: "" }, drawnColors = new Map(), folding }) {
    const chart = view.chart;
    const pie = SLICE_TYPES.includes(drawn);
    const axis = CHART_TYPES[drawn]?.axis ?? false;
    // a treemap names each tile on it: no legend
    const legend = drawn !== "treemap";
    /** One choice of several: radio, its patch applied at once. @returns {Choice} */
    const pickOf = (/** @type {string} */ key, /** @type {string} */ value, /** @type {string} */ text, /** @type {string} */ id, /** @type {string | undefined} */ info = undefined) => ({ id, text, checked: (chart[key] ?? null) === value, info, run: () => act.display({ [key]: value }) });
    /** A switch. @returns {Choice} */
    const flip = (/** @type {string} */ key, /** @type {string} */ text, /** @type {string} */ id, /** @type {string | undefined} */ info = undefined) => ({ id, text, checkbox: true, checked: Boolean(chart[key]), info, run: () => act.display({ [key]: !chart[key] }) });
    // a pie's "percent" on another type draws the value: it shows as "Value" there
    const valueLabels = !pie && (chart.valueLabels === "percent" || chart.valueLabels === "both") ? "value" : chart.valueLabels;
    /** @type {Topic[]} */
    const topics = [
        {
            id: "valueLabels",
            title: labels.valueLabels,
            kind: "menu",
            state: labels.valueLabelNames[valueLabels],
            changed: valueLabels !== "auto",
            groups: [{ choices: (pie ? VALUE_LABELS.slices : VALUE_LABELS.other).map((v) => ({ ...pickOf("valueLabels", v, labels.valueLabelNames[v], `labels-${v}`), checked: valueLabels === v })) }]
        },
        ...(legend ? [/** @type {Topic} */ ({ id: "legend", title: labels.legend, kind: "menu", state: labels.legendNames[chart.legend], changed: chart.legend !== "auto", groups: [{ choices: ["auto", "bottom", "right", "off"].map((v) => pickOf("legend", v, labels.legendNames[v], `legend-${v}`)) }] })] : []),
        { id: "title", title: labels.chartTitle, kind: "panel", state: chart.title || labels.chartTitleNone, changed: Boolean(chart.title) }
    ];
    if (axis) {
        const groups = view.rows.length >= 2;
        const off = [groups && chart.groupLabels !== "auto" ? `${labels.groupLabels.toLowerCase()} ${labels.groupLabelNames[chart.groupLabels].toLowerCase()}` : null, chart.zoom !== "auto" ? `${labels.zoom.toLowerCase()} ${labels.zoomNames[chart.zoom].toLowerCase()}` : null].filter(Boolean);
        topics.push({
            id: "axis",
            title: labels.chartAxis,
            kind: "menu",
            state: [labels.axisLabelNames[chart.axisLabels], ...off].join(", "),
            changed: chart.axisLabels !== "auto" || off.length > 0,
            groups: [
                { title: labels.axisLabels, choices: ["auto", "all", "nth"].map((v) => pickOf("axisLabels", v, labels.axisLabelNames[v], `axis-${v}`)) },
                ...(groups ? [{ title: labels.groupLabels, choices: ["auto", "on", "off"].map((v) => pickOf("groupLabels", v, labels.groupLabelNames[v], `groups-${v}`, v === "auto" ? "groupLabels" : undefined)) }] : []),
                { title: labels.zoom, choices: ["auto", "on", "off"].map((v) => pickOf("zoom", v, labels.zoomNames[v], `zoom-${v}`, v === "auto" ? "zoom" : undefined)) }
            ]
        });
    }
    if (drawn !== "heatmap") {
        // what the tooltip covers (bars, lines, areas) and the share of the total in it (#54)
        const mode = chart.tooltip ?? "auto";
        const state = [axis ? labels.tooltipNames[mode] : null, chart.tooltipShare ? labels.tooltipShare : null].filter(Boolean).join(", ");
        topics.push({
            id: "tooltip",
            title: labels.tooltip,
            kind: "menu",
            info: axis ? "tooltip" : undefined,
            state: state || null,
            changed: mode !== "auto" || Boolean(chart.tooltipShare),
            groups: [...(axis ? [{ choices: ["auto", "axis"].map((v) => pickOf("tooltip", v, labels.tooltipNames[v], `tooltip-${v}`)) }] : []), { choices: [flip("tooltipShare", labels.tooltipShare, "chart-tooltip-share")] }]
        });
    }
    if (axis && CHART_TYPES[drawn]?.lines !== false) {
        // Reference lines: a level of switches (Average, Trend, High and low points), the target's row that opens its form
        // (the hidden topic "linesTarget", toolbar-panels.jsx), and why a line is off as a reason
        const now = chart.referenceLines ?? { average: false, trend: false, target: null, extremes: false };
        const words = labels.core.referenceLines;
        const { rules, targetText } = lines;
        const notes = Array.isArray(rules.notes) ? rules.notes : [];
        const say = (/** @type {string[]} */ keys) => {
            const note = notes.find((n) => keys.includes(n));
            return note && Object.hasOwn(labels.linesNotes, note) ? labels.linesNotes[note] : undefined;
        };
        const total = ["noTotal", "percentStack", "negative"];
        const set = (/** @type {object} */ patch) => act.display({ referenceLines: { ...now, ...patch } });
        /** @type {Choice[]} */
        const choices = [
            { id: "line-average", text: words.average, checkbox: true, checked: now.average, disabled: !rules.average, reason: rules.average ? undefined : say(total), run: () => set({ average: !now.average }) },
            { id: "line-trend", text: words.trend, checkbox: true, checked: now.trend, disabled: !rules.trend, reason: rules.trend ? undefined : say([...total, "noTime"]), run: () => set({ trend: !now.trend }) },
            // the high and low points (#574): where an average is drawn, with its reason where not
            { id: "line-extremes", text: labels.linesExtremes, checkbox: true, checked: Boolean(now.extremes), disabled: !rules.extremes, reason: rules.extremes ? undefined : say(total), run: () => set({ extremes: !now.extremes }) },
            { id: "line-target", text: words.target, hint: now.target !== null ? targetText : labels.targetNone, open: "linesTarget", disabled: !rules.target, reason: rules.target ? undefined : say(["noTotal", "percentStack", "mixedUnits"]) },
            // a target the chart cannot draw stays removable
            ...(!rules.target && now.target !== null ? [{ id: "target-remove", text: labels.targetRemove, run: () => set({ target: null }) }] : [])
        ];
        const on = [now.average ? words.average : null, now.trend ? words.trend : null, now.extremes ? labels.linesExtremes : null, now.target !== null ? words.target : null].filter(Boolean);
        // a note under the choices: the chart not drawn yet (the note "table"), or a trend over the categories' order
        const note = notes.includes("table") ? labels.linesNotes.table : notes.includes("byIndex") && rules.trend ? labels.linesNotes.byIndex : null;
        topics.push({ id: "lines", title: labels.referenceLines, kind: "menu", state: on.length ? on.join(", ") : labels.linesOff, changed: on.length > 0, groups: [{ choices }], note, noteId: "lines-note" });
        topics.push({ id: "linesTarget", title: words.target, kind: "panel", hidden: true, levelTitle: `${labels.referenceLines} › ${words.target}` });
    }
    // one series too: its colour; its switch only says it is always shown
    if (names.length > 0) {
        const only = names.length === 1;
        const hidden = (chart.hidden ?? []).filter((/** @type {string} */ n) => names.includes(n)).length;
        const now = chart.hidden ?? [];
        // a fixed colour per name (chart.colors, #54): the view's, else the colour the chart draws
        /** @type {Array<{ name: string, color: string }>} */
        const own = chart.colors ?? [];
        const same = (/** @type {string} */ a, /** @type {string} */ b) => a.toLowerCase() === b.toLowerCase();
        const recolor = (/** @type {string} */ name, /** @type {string | null} */ color) => act.display({ colors: [...own.filter((c) => !same(c.name, name)), ...(color ? [{ name, color }] : [])] });
        const stale = own.filter((c) => !names.some((n) => same(n, c.name)));
        topics.push({
            id: "series",
            title: labels.shownSeries,
            kind: "menu",
            info: "chartColors",
            state: fill(labels.seriesShownOf, { shown: String(names.length - hidden), count: String(names.length) }),
            changed: hidden > 0 || own.length > 0,
            // every series or slice, the level scrolls; a switch keeps the level open for the next one;
            // beside each its colour, and Default where the view fixes one
            groups: [
                {
                    choices: names.map((name, i) => {
                        const mine = own.find((c) => same(c.name, name));
                        return {
                            id: `series-${i}`,
                            text: name,
                            checkbox: true,
                            checked: only || !now.includes(name),
                            ...(only ? { disabled: true, reason: labels.seriesOnly } : {}),
                            run: () => act.display({ hidden: hiddenAfter(now, name, now.includes(name)) }),
                            color: { id: `series-${i}-color`, value: mine?.color ?? drawnColors.get(name) ?? "", label: fill(labels.colorOf, { name }), pick: (/** @type {string} */ c) => recolor(name, c) },
                            ...(mine ? { actions: [{ id: `series-${i}-default`, text: labels.colorDefault, label: `${labels.colorDefault}: ${name}`, icon: "reset", run: () => recolor(name, null) }] } : {})
                        };
                    })
                },
                // a view's colour for a name the chart does not show: Remove
                ...(stale.length ? [{ title: labels.colorsNotShown, choices: stale.map((c, i) => ({ id: `color-stale-${i}`, text: c.name, label: `${labels.colorRemove}: ${c.name}`, icon: "x", run: () => recolor(c.name, null) })) }] : [])
            ]
        });
    }
    /** @type {Choice[]} */
    const layout = [];
    if ((drawn === "stacked" || drawn === "area") && view.values.length > 0 && view.values.every(valueAddsUp)) {
        layout.push(flip("stackPercent", labels.stackPercent, "chart-stack-percent", "stackPercent"));
    }
    if (drawn === "line" || drawn === "area") {
        layout.push(flip("smooth", labels.smoothLines, "chart-smooth"));
    }
    if (pie) {
        layout.push(...["outside", "inside"].map((v) => ({ ...pickOf("labelPosition", v, labels.labelPositionNames[v], `label-position-${v}`, v === "outside" ? "labelPosition" : undefined), checked: (chart.labelPosition ?? "outside") === v, disabled: chart.valueLabels === "off" })));
    }
    const on = layout.filter((c) => c.checked && (c.checkbox || c.id === "label-position-inside")).map((c) => c.text);
    if (folding && act.expand && act.collapse) {
        // a collapsed group is one category of the chart: Expand all and Collapse all in its words
        layout.push(...foldChoices(folding, labels, { expand: act.expand, collapse: act.collapse }, rowFoldTexts(view, labels), ["chart-show-each", "chart-show-only"]));
    }
    // how the groups of Rows show, named by the fields (the default: each item of the last field)
    const fold = folding && view.rows.length >= 2 ? foldState(view, folding, labels) : null;
    if (layout.length) {
        const state = [...on, ...(fold ? [fold.text] : [])].join(", ");
        topics.push({ id: "layout", title: labels.chartLayout, kind: "menu", state: state || null, changed: on.length > 0 || Boolean(fold?.changed), groups: [{ choices: layout }] });
    }
    return topics;
}

/**
 * The ids of the Views menu's entries: by their group, their name and how often the name came
 * before in that group, so an entry keeps its id when one before it is deleted, and two entries of
 * one name are told apart.
 * @param {Array<{ scope: string, name: string }>} templates
 */
export function entryIds(templates) {
    const seen = new Map();
    return templates.map((t) => {
        const key = `${t.scope}:${t.name}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
        return `entry:${key}:${seen.get(key)}`;
    });
}

/**
 * The entry the focus goes to once the entry at `place` of a group is deleted: the next one, else
 * the one before it; undefined when it was the only one.
 * @template T
 * @param {T[]} list
 * @param {number} place
 */
export const afterDelete = (list, place) => list[place + 1] ?? list[place - 1];

/**
 * One entry of a menu's search: a choice of a topic (with the path to it), or a topic's level
 * (`focus`: the part of it to show and focus).
 * @typedef {{ id: string, text: string, path: string, topic: Topic, choice?: Choice, focus?: string, keywords?: string }} SearchEntry
 */

/**
 * Every entry of a menu, for its search: each choice with the titles above it as its path ("Number
 * format › More formats"), each panel as an entry that opens it, and the entries a topic makes from
 * what is typed (`query`).
 * @param {Topic[]} topics
 * @param {string} [query]
 * @returns {SearchEntry[]}
 */
export function searchEntries(topics, query = "") {
    return topics.flatMap((topic) => {
        if (topic.hidden) {
            return [];
        }
        const typed = query && topic.searchFor ? topic.searchFor(query) : [];
        const extra = [...typed, ...(topic.searchExtra ?? [])].map((x) => ({ id: x.id, text: x.text, path: topic.title, topic, choice: x.choice, focus: x.focus, keywords: x.keywords }));
        return topic.kind === "panel"
            ? [{ id: `open-${topic.id}`, text: topic.title, path: "", topic }, ...extra]
            : (topic.groups ?? []).flatMap((g) => g.choices.map((choice) => ({ id: choice.id, text: choice.text, path: [topic.title, g.title].filter(Boolean).join(" › "), topic, choice })));
    });
}

/** At most this many hits show. */
export const SEARCH_HITS = 8;

/**
 * The entries every word of `query` is found in (its text or its path), at most SEARCH_HITS; those
 * whose text starts with the query first.
 * @param {SearchEntry[]} entries
 * @param {string} query
 * @param {string} [locale]
 * @returns {SearchEntry[]}
 */
export function searchHits(entries, query, locale) {
    const lower = (s) => s.toLocaleLowerCase(locale);
    const words = lower(query).split(/\s+/).filter(Boolean);
    if (!words.length) {
        return [];
    }
    const found = entries.filter((e) => {
        const text = lower(`${e.text} ${e.path} ${e.topic.keywords ?? ""} ${e.choice?.keywords ?? e.keywords ?? ""}`);
        return words.every((w) => text.includes(w));
    });
    // a stable sort: the entries with the first word among their own keywords ("percent": the shares
    // of Show as), then those whose text starts with it, in their order, then the rest
    const own = (/** @type {SearchEntry} */ e) => lower(e.choice?.keywords ?? "").split(/\s+/).includes(words[0]);
    const rank = (/** @type {SearchEntry} */ e) => (own(e) ? 0 : lower(e.text).startsWith(words[0]) ? 1 : 2);
    return [0, 1, 2].flatMap((r) => found.filter((e) => rank(e) === r)).slice(0, SEARCH_HITS);
}

/**
 * A row's accessible name: "Filter, 3 of 12, changed" (`changedWord`: ", changed").
 * @param {string} title
 * @param {string | null | undefined} state
 * @param {boolean | undefined} changed
 * @param {string} changedWord
 */
export const rowName = (title, state, changed, changedWord) => `${title}${state ? `, ${state}` : ""}${changed ? changedWord : ""}`;

/**
 * Where the focus goes in a list of `count` items from `at` for a key (ArrowDown, ArrowUp, Home,
 * End), around the ends; null for another key.
 * @param {string} key
 * @param {number} at  -1 when no item has the focus
 * @param {number} count
 */
export function stepIndex(key, at, count) {
    if (count === 0) {
        return null;
    }
    switch (key) {
        case "ArrowDown":
            return (at + 1) % count;
        case "ArrowUp":
            return at <= 0 ? count - 1 : at - 1;
        case "Home":
            return 0;
        case "End":
            return count - 1;
        default:
            return null;
    }
}

/**
 * Type-ahead: the next item after `at` whose text starts with `typed` (the letters typed in a short
 * while), around the end; null when none does.
 * @param {string[]} texts
 * @param {number} at
 * @param {string} typed
 * @param {string} [locale]
 */
export function typeAheadIndex(texts, at, typed, locale) {
    const want = typed.toLocaleLowerCase(locale);
    // the same letter again moves on; more letters stay on the item while it still matches
    const from = typed.length > 1 ? at : at + 1;
    for (let i = 0; i < texts.length; i++) {
        const k = (Math.max(0, from) + i) % texts.length;
        if (texts[k].trim().toLocaleLowerCase(locale).startsWith(want)) {
            return k;
        }
    }
    return null;
}

/*
 * The tips above the result, the one table they are defined in: when each one shows (a pure function
 * of the report's state, tipContext), its text (labels.tips, labels.tipActions) and the action its
 * button runs. A "notice" says that the result is cut or empty (top N, the chart's category cap, a
 * filter that leaves nothing): it always shows, cannot be dismissed and counts against no limit. The
 * other entries are tips: at most TIP_LIMIT at a time, the most important first, each can be
 * dismissed, and a host can allow some or none (the `tips` prop). A new entry is one row here, its
 * text in every language and, for a button, its action in PivotReport.
 */

import { CATALOG, fieldLabel, suggestDateUnit } from "pivotkit-core";
import { CHART_TYPES, MANY_SERIES, SLICE_TYPES, chartPlan } from "./chart-types.js";
import { fill } from "./labels.js";
import { readItem, subscribeItem, writeItem } from "./storage.js";
import { emptyPick, filterZoneFields, filtersOf, isFiltered, sourceOf } from "./view-ops.js";

/** Tips shown at a time: one, the most important; the next waits until it is followed or dismissed. */
export const TIP_LIMIT = 1;

/** When the tips show; each number is documented in the React reference (tips). */
export const TIP_THRESHOLDS = Object.freeze({
    /** columns of an ungrouped date on Columns from which grouping it is suggested */
    dateColumns: 12,
    /** rows of an ungrouped date on Rows from which grouping it is suggested */
    dateRows: 60,
    /** columns from which swapping rows and columns is suggested (when there are fewer rows) */
    manyColumns: 20,
    /** changes of the view in this session after which saving it as a template is suggested */
    changesBeforeSave: 5,
    /** changes after the first drag during which the Undo and menu tip stays */
    afterDragChanges: 3,
    /** slices from which a pie or a donut suggests bars: a circle reads well up to about 7 parts */
    pieSlices: 7
});

/** The "show values as" calculations that are percentages: their tip says what 100 % is. */
const PERCENT_SHOW_AS = Object.freeze(["percentOfGrandTotal", "percentOfRowTotal", "percentOfColumnTotal", "percentOfParentRow", "percentOfParentColumn", "percentRunningTotal", "percentDifferenceFromPrevious"]);

/**
 * @typedef {object} TipContext  what the conditions read; built by tipContext()
 * @property {any} view  the normalized view
 * @property {boolean} empty  nothing placed
 * @property {boolean} failed  the result cannot be shown (an error is shown instead)
 * @property {(field: string) => string} typeOf  the type of a field's source column
 * @property {import("pivotkit-core").Encoded} encoded
 * @property {Record<string, string>} [fields]  display names (labels.core.fields)
 * @property {number} rowLeaves  rows of the innermost row field (1 without row fields)
 * @property {number} colLeaves  columns of the innermost column field (1 without column fields)
 * @property {number} matched  source rows left after the filters
 * @property {number} dataRows  source rows of the data
 * @property {{ series: any[], categories: any[], categoryCount: number } | null} series  the chart's series, when the chart shows
 * @property {boolean} tableShown  the table (with cells) is on screen
 * @property {boolean} drilled  a value was opened once
 * @property {number} changes  changes of the view in this session
 * @property {number | null} dragAt  `changes` when the first drag ended, null before
 * @property {boolean} canSave  the host lets the user save templates
 * @property {number} savedAt  `changes` when the view was last saved (0: not saved in this session)
 * @property {{ name: string, auto: boolean, swap: boolean }} chartPlan  what the chart draws
 *   (chart-types.js chartPlan): the type, whether the data chose it, rows and columns swapped for it
 */

/**
 * @typedef {object} TipEntry
 * @property {string} id
 * @property {(ctx: TipContext) => Record<string, any> | null} when  null: not now; else the
 *   placeholders of its text (and `action` data)
 * @property {string} [action]  the action of its button: a key of labels.tipActions and of PivotReport's actions
 * @property {"notice"} [kind]  a notice: always shown, not dismissible, outside the tips' limit
 * @property {string} [icon]
 */

const name = (ctx, field) => fieldLabel(field, { fields: ctx.fields });
/** The grouping unit of a derived field ("month", "weekday"), "" for a field of the data. */
const derivedBy = (ctx, field) => ctx.view.derived.find((d) => d.name.toLowerCase() === String(field).toLowerCase())?.by ?? "";
const isRawDate = (ctx, field) => ctx.typeOf(field) === "date" && sourceOf(ctx.view, field).toLowerCase() === String(field).toLowerCase();
const table = (ctx) => !ctx.failed && !ctx.empty && ctx.view.display === "table";
const chart = (ctx) => !ctx.failed && ctx.view.display === "chart" && ctx.series !== null && ctx.view.values.length > 0;
/** The chart's series where chart(ctx) holds. */
const seriesOf = (ctx) => /** @type {NonNullable<TipContext["series"]>} */ (ctx.series);
const axisChart = (ctx) => chart(ctx) && CHART_TYPES[ctx.chartPlan.name].axis;
const lines = (ctx) => ["line", "area"].includes(ctx.chartPlan.name);
const sliceChart = (ctx) => chart(ctx) && SLICE_TYPES.includes(ctx.chartPlan.name);
const dateOn = (ctx, axis) => ctx.view[axis].some((f) => ctx.typeOf(f) === "date");
/** Lines or areas with dates on Columns only, drawn as the view has them: each date is a line of its own. */
const datesAcross = (ctx) => axisChart(ctx) && !ctx.chartPlan.swap && lines(ctx) && dateOn(ctx, "cols") && !dateOn(ctx, "rows");

/** @type {readonly TipEntry[]} the tips, most important first: that is the order they show in */
export const TIPS = Object.freeze([
    {
        // a filter that leaves nothing: say so instead of an empty table
        id: "filterEmpty",
        kind: "notice",
        icon: "filter",
        action: "removeFilters",
        when: (ctx) => (!ctx.failed && !ctx.empty && ctx.dataRows > 0 && ctx.matched === 0 && ctx.view.filters.some((f) => isFiltered(ctx.view, f.field)) ? {} : null)
    },
    {
        // top N changes what totals mean
        id: "top",
        kind: "notice",
        icon: "top",
        when: (ctx) => {
            if (ctx.failed || ctx.empty) {
                return null;
            }
            for (const field of [...ctx.view.rows, ...ctx.view.cols]) {
                const top = filtersOf(ctx.view, field, ["top"])[0];
                if (top) {
                    return { field: name(ctx, field), count: top.count, bottom: Boolean(top.bottom) };
                }
            }
            return null;
        }
    },
    {
        id: "chartCapped",
        kind: "notice",
        when: (ctx) => (chart(ctx) && seriesOf(ctx).categoryCount > seriesOf(ctx).categories.length ? { shown: seriesOf(ctx).categories.length, total: seriesOf(ctx).categoryCount } : null)
    },
    {
        // "% of row total": what 100 % is
        id: "showAs",
        icon: "sigma",
        when: (ctx) => {
            if (ctx.failed || ctx.empty) {
                return null;
            }
            const spec = ctx.view.values.find((v) => v.showAs && PERCENT_SHOW_AS.includes(v.showAs.type));
            return spec ? { type: spec.showAs.type } : null;
        }
    },
    {
        // a type the user chose for data over time: lines show it (automatic draws them)
        id: "chartOverTime",
        icon: "line",
        action: "auto",
        when: (ctx) => {
            if (!chart(ctx) || ctx.chartPlan.auto || lines(ctx) || ctx.chartPlan.name === "heatmap") {
                return null;
            }
            // only where Automatic would draw lines: a date along the time line, not a repeating one (weekday)
            if (chartPlan({ ...ctx.view, chart: { ...ctx.view.chart, type: "auto" } }, ctx.encoded).name !== "line") {
                return null;
            }
            const field = [...ctx.view.rows, ...ctx.view.cols].find((f) => ctx.typeOf(f) === "date" && !CATALOG.cyclicUnits.includes(derivedBy(ctx, f)));
            return field ? { field: name(ctx, field) } : null;
        }
    },
    {
        // a pie of many slices: the small ones cannot be told apart
        id: "pieSlices",
        icon: "chart",
        action: "bars",
        when: (ctx) => (sliceChart(ctx) && seriesOf(ctx).categories.length > TIP_THRESHOLDS.pieSlices ? { count: seriesOf(ctx).categories.length, max: TIP_THRESHOLDS.pieSlices } : null)
    },
    {
        // a pie draws one slice per row: the columns are added up
        id: "pieColumns",
        icon: "info",
        action: "bars",
        when: (ctx) => (sliceChart(ctx) && ctx.view.cols.length > 0 ? { fields: ctx.view.cols.map((f) => name(ctx, f)).join(", ") } : null)
    },
    {
        id: "chartDates",
        action: "swap",
        when: (ctx) => (datesAcross(ctx) ? {} : null)
    },
    {
        // a line or an area over categories without an order (countries, teams) draws a trend
        // between things that follow no line: bars fit better. Dates, number ranges and a custom
        // order (seasons) are an order
        id: "chartTrend",
        icon: "chart",
        action: "bars",
        when: (ctx) => {
            // dates on Columns: the dates tip (swap) says the better thing
            if (!axisChart(ctx) || ctx.chartPlan.auto || datesAcross(ctx) || !lines(ctx) || ctx.view.rows.length === 0) {
                return null;
            }
            const field = ctx.view.rows[ctx.view.rows.length - 1];
            const ordered = ["date", "number"].includes(ctx.typeOf(field)) || ctx.view.sort.some((s) => s.by === "custom" && String(s.field).toLowerCase() === String(field).toLowerCase());
            return ordered ? null : {};
        }
    },
    {
        id: "chartSeries",
        action: "swap",
        // the dates tip says the same (swap) more precisely; lines over time drawn automatically
        // would draw the same lines after a swap
        when: (ctx) => (axisChart(ctx) && !datesAcross(ctx) && !(ctx.chartPlan.auto && lines(ctx)) && seriesOf(ctx).series.length > MANY_SERIES ? { count: seriesOf(ctx).series.length } : null)
    },
    {
        // a text field in Values is counted: say so, and what a sum needs
        id: "textValue",
        icon: "sigma",
        when: (ctx) => {
            if (ctx.failed || ctx.empty) {
                return null;
            }
            // a value with a name of its own ("Laureates") is counted on purpose
            const spec = ctx.view.values.find((v) => v.field && !v.label && ["string", "boolean"].includes(ctx.typeOf(v.field)));
            return spec ? { field: name(ctx, spec.field) } : null;
        }
    },
    {
        // a date without grouping makes a column per day (or per instant)
        id: "dateUngrouped",
        icon: "date",
        action: "groupDate",
        when: (ctx) => {
            if (!table(ctx)) {
                return null;
            }
            const onCols = ctx.colLeaves > TIP_THRESHOLDS.dateColumns ? ctx.view.cols.find((f) => isRawDate(ctx, f)) : undefined;
            const field = onCols ?? (ctx.rowLeaves > TIP_THRESHOLDS.dateRows ? ctx.view.rows.find((f) => isRawDate(ctx, f)) : undefined);
            if (!field) {
                return null;
            }
            const column = ctx.encoded.column(field);
            const suggested = suggestDateUnit(ctx.encoded, field);
            // a grouping by day changes nothing for dates without a time: by month then
            const unit = !suggested || (suggested === "day" && column?.dateOnly) ? "yearMonth" : suggested;
            return { field: name(ctx, field), source: field, unit };
        }
    },
    {
        id: "manyColumns",
        icon: "swap",
        action: "swap",
        when: (ctx) => (table(ctx) && ctx.view.cols.length > 0 && ctx.colLeaves > TIP_THRESHOLDS.manyColumns && ctx.rowLeaves < ctx.colLeaves ? { count: ctx.colLeaves } : null)
    },
    {
        // once after the first drag: Undo and the menus (before the next step: it goes after a few changes)
        id: "afterDrag",
        icon: "undo",
        when: (ctx) => (!ctx.failed && ctx.dragAt !== null && ctx.changes - ctx.dragAt <= TIP_THRESHOLDS.afterDragChanges ? {} : null)
    },
    {
        // rows without values show no numbers
        id: "values",
        icon: "sigma",
        when: (ctx) => (table(ctx) && ctx.view.values.length === 0 ? {} : null)
    },
    {
        id: "saveTemplate",
        icon: "bookmark",
        action: "saveTemplate",
        // after a save it waits for as many changes again
        when: (ctx) => (ctx.canSave && !ctx.failed && !ctx.empty && ctx.changes - ctx.savedAt >= TIP_THRESHOLDS.changesBeforeSave ? {} : null)
    },
    {
        // the empty report: every field has a menu, and Undo is there
        id: "menus",
        icon: "sparkle",
        when: (ctx) => (!ctx.failed && ctx.empty && ctx.view.display === "table" && ctx.dragAt === null ? {} : null)
    },
    {
        id: "cells",
        icon: "info",
        when: (ctx) => (table(ctx) && ctx.tableShown && ctx.view.values.length > 0 && !ctx.drilled ? {} : null)
    }
]);

/** Every tip id, for a host's `tips` list and for stored dismissals. */
export const TIP_IDS = Object.freeze(TIPS.filter((t) => t.kind !== "notice").map((t) => t.id));

/** The notices: shown whenever they hold, whatever the tips settings are. */
export const NOTICE_IDS = Object.freeze(TIPS.filter((t) => t.kind === "notice").map((t) => t.id));

/** The dismissal that switches every tip off ("Show tips" in Options). */
export const ALL_TIPS = "*";

/**
 * The other switch of Options → Help, "Show explanations", kept in the same list (and storage) as the
 * tips: off, it hides every "i" - of the settings, of the zones and of the field descriptions -
 * except those a host forces on (the props settingInfo, zoneInfo and fieldInfo).
 */
export const NO_EXPLANATIONS = "-explanations";
/** The field list collapsed to a rail by the user (a wide or medium report), kept in the same list. */
export const FIELDS_COLLAPSED = "-fields";
/** Entries of the list that are switches, not dismissed tips: "Show dismissed tips again" keeps them. */
export const SWITCHES = Object.freeze([ALL_TIPS, NO_EXPLANATIONS, FIELDS_COLLAPSED]);

/**
 * Whether the field list is collapsed: the user's choice in this session, else the host's
 * `fieldList` ("open" or "collapsed"), else what the user chose before (the list).
 * @param {boolean | null} session
 * @param {unknown} forced
 * @param {readonly string[]} dismissed
 */
export function fieldsCollapsed(session, forced, dismissed) {
    return session ?? (forced === "collapsed" || forced === "open" ? forced === "collapsed" : dismissed.includes(FIELDS_COLLAPSED));
}

/** Entries "Show dismissed tips again" keeps: the switches. */
export const keptOnReset = (id) => SWITCHES.includes(id);

/**
 * Whether one kind of "i" shows: the host's "on" or "off" forces it (and the user's switch leaves it
 * alone), else the user's "Show explanations" in the list, on by default.
 * @param {unknown} forced  the host's prop (settingInfo, zoneInfo or fieldInfo)
 * @param {readonly string[]} dismissed
 * @param {string} [off]  the switch's entry, NO_EXPLANATIONS
 * @returns {{ on: boolean, user: boolean }}  `user`: the user's switch decides
 */
export function helpSwitch(forced, dismissed, off = NO_EXPLANATIONS) {
    if (forced === "on" || forced === "off") {
        return { on: forced === "on", user: false };
    }
    return { on: !dismissed.includes(off), user: true };
}

/**
 * The keyboard shortcuts of the help section in Options: the keys (with "Mod" for Ctrl or ⌘) and
 * the key of their text in labels.shortcuts.
 */
export const SHORTCUTS = Object.freeze([
    { keys: ["Mod", "Z"], text: "undo" },
    { keys: ["Mod", "Shift", "Z"], text: "redo" },
    { keys: ["Arrow keys"], text: "move" },
    { keys: ["Enter"], text: "open" },
    { keys: ["Space"], text: "drag" },
    { keys: ["Escape"], text: "close" },
    { keys: ["Arrow keys"], text: "fields" },
    { keys: ["Shift", "F10"], text: "fieldMenu" }
]);

/**
 * What the conditions read, from the report's state. Pure.
 * @param {{ view: any, result: import("pivotkit-core").PivotResult | null, encoded: import("pivotkit-core").Encoded,
 *   failed: boolean, empty: boolean, typeOf: (field: string) => string, fields?: Record<string, string>,
 *   series?: TipContext["series"], tableShown?: boolean, drilled?: boolean, changes?: number, dragAt?: number | null, canSave?: boolean,
 *   savedAt?: number, chartPlan?: TipContext["chartPlan"] }} state
 * @returns {TipContext}
 */
export function tipContext({ view, result, encoded, failed, empty, typeOf, fields, series = null, tableShown = false, drilled = false, changes = 0, dragAt = null, canSave = false, savedAt = 0, chartPlan = { name: "bar", auto: true, swap: false } }) {
    const leaves = (nodes, depth) => (result && depth > 0 ? nodes.reduce((n, node) => n + (node.depth === depth ? 1 : 0), 0) : 1);
    return {
        view,
        empty,
        failed: failed || !result,
        typeOf,
        encoded,
        fields,
        rowLeaves: result ? leaves(result.rowNodes, result.rowFields.length) : 0,
        colLeaves: result ? leaves(result.colNodes, result.colFields.length) : 0,
        matched: result ? result.rows.length : 0,
        dataRows: encoded.length,
        series,
        tableShown,
        drilled,
        changes,
        dragAt,
        canSave,
        savedAt,
        chartPlan
    };
}

/**
 * What to show now, the most important first: every notice whose condition holds, then the tips
 * whose condition holds, allowed by the host and not dismissed, at most `limit` of them.
 * @param {TipContext} ctx
 * @param {{ allowed: "on" | "off" | readonly string[], dismissed: ReadonlySet<string> | readonly string[], limit?: number }} options
 * @returns {Array<{ id: string, params: Record<string, any>, entry: TipEntry }>}
 */
export function activeTips(ctx, { allowed, dismissed, limit = TIP_LIMIT }) {
    const gone = new Set(dismissed);
    const tipsOff = allowed === "off" || gone.has(ALL_TIPS);
    const out = [];
    let tips = 0;
    for (const entry of TIPS) {
        const notice = entry.kind === "notice";
        if (!notice && (tipsOff || tips >= limit || (Array.isArray(allowed) && !allowed.includes(entry.id)) || gone.has(entry.id))) {
            continue;
        }
        const params = entry.when(ctx);
        if (params) {
            out.push({ id: entry.id, params, entry });
            tips += notice ? 0 : 1;
        }
    }
    return out;
}

/**
 * The text of a tip in the labels' language; numbers in the locale.
 * @param {string} id
 * @param {Record<string, any>} params
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 */
export function tipText(id, params, labels, locale) {
    const texts = labels.tips;
    const values = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === "number" ? v.toLocaleString(locale) : v]));
    if (id === "showAs") {
        const per = texts.showAs;
        return Object.hasOwn(per, params.type) ? per[params.type] : "";
    }
    if (id === "top") {
        return fill(params.bottom ? texts.bottom : texts.top, values);
    }
    if (id === "dateUngrouped") {
        return fill(texts.dateUngrouped, { ...values, unit: labels.units[params.unit] ?? params.unit });
    }
    return Object.hasOwn(texts, id) && typeof texts[id] === "string" ? fill(texts[id], values) : "";
}

/**
 * The text of a tip's button.
 * @param {TipEntry} entry
 * @param {Record<string, any>} params
 * @param {import("./labels.js").UiLabels} labels
 */
export function tipActionText(entry, params, labels) {
    if (!entry.action) {
        return "";
    }
    const text = Object.hasOwn(labels.tipActions, entry.action) ? labels.tipActions[entry.action] : "";
    return fill(text, { unit: labels.units[params.unit] ?? params.unit ?? "" });
}

/**
 * A host's `tips` prop or attribute: "on" (default), "off", or the ids it allows (an array, or a
 * comma-separated text); unknown ids are left out.
 * @param {unknown} value
 * @returns {"on" | "off" | string[]}
 */
export function allowedTips(value) {
    if (value === "off" || value === false) {
        return "off";
    }
    const list = typeof value === "string" && value.trim() !== "on" && value.trim() !== "" ? value.split(",") : Array.isArray(value) ? value : null;
    if (!list) {
        return "on";
    }
    return list.map((id) => String(id).trim()).filter((id) => TIP_IDS.includes(id));
}

/** Dismissed ids from anywhere (storage, a host): known ids and the switches only, once each. */
export function cleanDismissed(value) {
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string" && (SWITCHES.includes(id) || TIP_IDS.includes(id))))] : [];
}

/** The localStorage key of a report's tips: one per `storageKey`, so two reports never share one. */
export const storageName = (key) => `pivotkit:tips:${key}`;

/**
 * The stored text of a report's dismissed tips, or null (no key, no storage, blocked). A text, so a
 * React store snapshot of it compares by value.
 * @param {string | undefined} key
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 * @returns {string | null}
 */
export function readStored(key, storage) {
    return key ? readItem(storageName(key), storage) : null;
}

/** The dismissed ids of a stored text: [] for nothing or broken JSON. @param {string | null} raw */
export function parseStored(raw) {
    if (!raw) {
        return [];
    }
    try {
        return cleanDismissed(JSON.parse(raw));
    } catch {
        return [];
    }
}

/**
 * The dismissed tips stored for a report, or [] (no key, no storage, blocked, broken JSON).
 * @param {string | undefined} key
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 */
export function readDismissed(key, storage) {
    return parseStored(readStored(key, storage));
}

/**
 * Listens to the stored tips of a key: a write in this page (writeDismissed) or in another tab of
 * the same site. For useSyncExternalStore, so the report reads the storage only after hydration (its
 * server snapshot is "nothing stored").
 * @param {string | undefined} key
 * @param {() => void} callback
 * @returns {() => void}  stops listening
 */
export function subscribeStored(key, callback) {
    return key ? subscribeItem(storageName(key), callback) : () => {};
}

/**
 * Stores the dismissed tips of a report and tells the reports of the page that use the key; nothing
 * without a key or storage, and quietly when the browser refuses (private mode, quota): the tips stay
 * dismissed until the page is loaded again.
 * @param {string | undefined} key
 * @param {Pick<Storage, "setItem" | "removeItem"> | null | undefined} storage
 * @param {readonly string[]} dismissed
 */
export function writeDismissed(key, storage, dismissed) {
    if (key && storage) {
        writeItem(storageName(key), storage, dismissed.length ? JSON.stringify(dismissed) : null);
    }
}

/** The Filters zone fields, kept with empty filters, and every other filter gone: "Remove filter". */
export function withoutFilters(view) {
    return { ...view, filters: filterZoneFields(view).map(emptyPick) };
}

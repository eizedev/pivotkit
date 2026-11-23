/*
 * What the report shows above its result before the tips' table is here: the notices (the result is
 * cut or empty: top N, the chart's category cap, a filter that leaves nothing), the state the
 * conditions read (tipContext), the choice of what shows (activeEntries) and the texts. A notice always
 * shows, cannot be dismissed and counts against no limit, so it is in the first load. The tips
 * themselves are rows of tips.js, which pivotkit-element loads after the first render. A new notice
 * is a row here with its id in NOTICE_IDS (tip-state.js); test/tips.test.js checks both.
 */

import { fieldLabel } from "pivotkit-core";
import { fill } from "./labels.js";
import { valueLabel } from "./names.js";
import { ALL_TIPS } from "./tip-state.js";
import { filtersOf, isFiltered } from "./view-ops.js";

/** Tips shown at a time: one, the most important; the next waits until it is followed or dismissed. */
export const TIP_LIMIT = 1;

/**
 * @typedef {object} TipContext  what the conditions read; built by tipContext()
 * @property {any} view  the normalized view
 * @property {string} display  what the result shows: "table", "chart" or, on a wide report, "both" (#51)
 * @property {boolean} empty  nothing placed
 * @property {boolean} failed  the result cannot be shown (an error is shown instead)
 * @property {(field: string) => string} typeOf  the type of a field's source column
 * @property {import("pivotkit-core").Encoded} encoded
 * @property {Record<string, string>} [fields]  display names (labels.core.fields)
 * @property {number} rowLeaves  rows of the innermost row field (1 without row fields)
 * @property {number} colLeaves  columns of the innermost column field (1 without column fields)
 * @property {boolean} colSubtotalShown  a column group with more than one child is expanded, so a
 *   column subtotal shows when column subtotals are on (core's layout.js draws none for one child)
 * @property {number} matched  source rows left after the filters
 * @property {number} dataRows  source rows of the data
 * @property {{ series: any[], categories: any[], categoryCount: number } | null} series  the chart's series, when the chart shows
 * @property {boolean} tableShown  the table (with cells) is on screen
 * @property {boolean} drilled  a value was opened once
 * @property {number} changes  changes of the view in this session
 * @property {number | null} dragAt  `changes` when the first drag ended, null before
 * @property {boolean} canSave  the host lets the user save templates
 * @property {number} savedAt  `changes` when the view was last saved (0: not saved in this session)
 * @property {{ name: string, auto: boolean, swap: boolean, chart?: { type: string, stacked: boolean, horizontal: boolean } }} chartPlan
 *   what the chart draws (chart-types.js chartPlan): the type, whether the data chose it, rows and
 *   columns swapped for it, the settings it draws with
 */

/**
 * @typedef {object} TipEntry
 * @property {string} id
 * @property {(ctx: TipContext) => Record<string, any> | null} when  null: not now; else the
 *   placeholders of its text (and `action` data)
 * @property {string} [action]  the action of its button: a key of labels.tipActions and of use-tips.js's tipStep
 * @property {"notice"} [kind]  a notice: always shown, not dismissible, outside the tips' limit
 * @property {string} [icon]
 */

export const name = (ctx, field) => fieldLabel(field, { fields: ctx.fields });
export const chart = (ctx) => !ctx.failed && ctx.display !== "table" && ctx.series !== null && ctx.view.values.length > 0;
/** The chart's series where chart(ctx) holds. */
export const seriesOf = (ctx) => /** @type {NonNullable<TipContext["series"]>} */ (ctx.series);

/** @type {readonly TipEntry[]} the notices, most important first: that is the order they show in */
export const NOTICES = Object.freeze([
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
    }
]);

/**
 * Whether an outer group of an axis has more than one child and is open (it and every group around
 * it not collapsed): the groups that get a subtotal line.
 * @param {any[]} nodes  the axis' nodes (result.colNodes)
 * @param {number} depth  fields on the axis
 * @param {any[][]} collapsed  the axis' collapsed paths
 */
function expandedGroup(nodes, depth, collapsed) {
    const shut = new Set(collapsed.map((path) => JSON.stringify(path)));
    const open = (path) => path.every((_, i) => !shut.has(JSON.stringify(path.slice(0, i + 1))));
    return nodes.some((node) => node.depth > 0 && node.depth < depth && node.children.length > 1 && open(node.path));
}

/**
 * What the conditions read, from the report's state. Pure.
 * @param {{ view: any, result: import("pivotkit-core").PivotResult | null, encoded: import("pivotkit-core").Encoded,
 *   failed: boolean, empty: boolean, typeOf: (field: string) => string, fields?: Record<string, string>,
 *   display?: string, series?: TipContext["series"], tableShown?: boolean, drilled?: boolean, changes?: number, dragAt?: number | null, canSave?: boolean,
 *   savedAt?: number, chartPlan?: TipContext["chartPlan"] }} state
 * @returns {TipContext}
 */
export function tipContext({ view, display = view.display, result, encoded, failed, empty, typeOf, fields, series = null, tableShown = false, drilled = false, changes = 0, dragAt = null, canSave = false, savedAt = 0, chartPlan = { name: "bar", auto: true, swap: false } }) {
    const leaves = (nodes, depth) => (result && depth > 0 ? nodes.reduce((n, node) => n + (node.depth === depth ? 1 : 0), 0) : 1);
    return {
        view,
        // what the result shows: "both" on a wide report only (#51)
        display,
        empty,
        failed: failed || !result,
        typeOf,
        encoded,
        fields,
        rowLeaves: result ? leaves(result.rowNodes, result.rowFields.length) : 0,
        colLeaves: result ? leaves(result.colNodes, result.colFields.length) : 0,
        colSubtotalShown: result ? expandedGroup(result.colNodes, result.colFields.length, view.collapsed?.cols ?? []) : false,
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
 * whose condition holds, allowed by the host and not dismissed, at most `limit` of them. With
 * `narrow` (a narrow report, where height is short) a notice takes a tip's place too, so a
 * phone shows one note above the result, not two.
 * @param {readonly TipEntry[]} table  NOTICES, or every row (tips.js TIPS)
 * @param {TipContext} ctx
 * @param {{ allowed: "on" | "off" | readonly string[], dismissed: ReadonlySet<string> | readonly string[], limit?: number, narrow?: boolean }} options
 * @returns {Array<{ id: string, params: Record<string, any>, entry: TipEntry }>}
 */
export function activeEntries(table, ctx, { allowed, dismissed, limit = TIP_LIMIT, narrow }) {
    const gone = new Set(dismissed);
    const tipsOff = allowed === "off" || gone.has(ALL_TIPS);
    const out = [];
    let tips = 0;
    for (const entry of table) {
        const notice = entry.kind === "notice";
        if (!notice && (tipsOff || tips >= limit || (Array.isArray(allowed) && !allowed.includes(entry.id)) || gone.has(entry.id))) {
            continue;
        }
        const params = entry.when(ctx);
        if (params) {
            out.push({ id: entry.id, params, entry });
            tips += notice && !narrow ? 0 : 1;
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
    if (id === "stackedTotal") {
        return fill(texts.stackedTotal, { value: valueLabel(params.spec, labels) });
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


/*
 * The tips above the result, the one table they are defined in: when each one shows (a pure function
 * of the report's state, tipContext), its text (labels.tips, labels.tipActions) and the action its
 * button runs. The notices (the result is cut or empty) come first, from notices.js, which the first
 * load has. The tips follow: at most TIP_LIMIT at a time, the most important first, each can be
 * dismissed, and a host can allow some or none (the `tips` prop). A new tip is one row here, its id in
 * tip-state.js, its text in every language and, for a button, its action in PivotReport.
 */

import { CATALOG, suggestDateUnit } from "pivotkit-core";
import { CHART_TYPES, MANY_SERIES, SLICE_TYPES, chartPlan } from "./chart-types.js";
import { NOTICES, activeEntries, chart, name, seriesOf } from "./notices.js";
import { sourceOf } from "./view-ops.js";

export { TIP_LIMIT, tipActionText, tipContext, tipText } from "./notices.js";

/** @typedef {import("./notices.js").TipEntry} TipEntry @typedef {import("./notices.js").TipContext} TipContext */

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

/** The grouping unit of a derived field ("month", "weekday"), "" for a field of the data. */
const derivedBy = (ctx, field) => ctx.view.derived.find((d) => d.name.toLowerCase() === String(field).toLowerCase())?.by ?? "";
const isRawDate = (ctx, field) => ctx.typeOf(field) === "date" && sourceOf(ctx.view, field).toLowerCase() === String(field).toLowerCase();
const table = (ctx) => !ctx.failed && !ctx.empty && ctx.view.display === "table";
const axisChart = (ctx) => chart(ctx) && CHART_TYPES[ctx.chartPlan.name].axis;
const lines = (ctx) => ["line", "area"].includes(ctx.chartPlan.name);
const sliceChart = (ctx) => chart(ctx) && SLICE_TYPES.includes(ctx.chartPlan.name);
const dateOn = (ctx, axis) => ctx.view[axis].some((f) => ctx.typeOf(f) === "date");
/** Lines or areas with dates on Columns only, drawn as the view has them: each date is a line of its own. */
const datesAcross = (ctx) => axisChart(ctx) && !ctx.chartPlan.swap && lines(ctx) && dateOn(ctx, "cols") && !dateOn(ctx, "rows");

/** @type {readonly TipEntry[]} the notices (notices.js) and the tips, most important first: that is the order they show in */
export const TIPS = Object.freeze([
    ...NOTICES,
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
        // column subtotals with two or more fields in Columns: what a Total column next to the
        // others adds up (people read "1 Critical Total" as one more status)
        id: "colSubtotals",
        icon: "sigma",
        action: "colSubtotalsOff",
        when: (ctx) => (table(ctx) && ctx.view.values.length > 0 && ctx.view.totals.colSubtotals && ctx.view.cols.length >= 2 && ctx.colSubtotalShown ? {} : null)
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

/**
 * What to show now from every row: the notices whose condition holds, then the tips allowed and not
 * dismissed, at most `limit` of them (notices.js activeEntries).
 * @param {import("./notices.js").TipContext} ctx
 * @param {Parameters<typeof activeEntries>[2]} options
 */
export const activeTips = (ctx, options) => activeEntries(TIPS, ctx, options);

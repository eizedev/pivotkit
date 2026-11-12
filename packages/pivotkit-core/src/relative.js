/*
 * Relative date ranges: the dates a `relative` filter keeps, as [from, to) in wall-clock ms.
 *
 * - direction "last": with `calendar` (the default) the `count` whole units that end with the current
 *   one (`includeCurrent`, the default) or with the one before it; without `calendar` (rolling) the
 *   time from `count` units before the reference to the reference itself. "next" the same forward:
 *   the `count` whole units from the current one (or the next one), or from the reference to `count`
 *   units after it. "this" the current unit alone. "before" every date before the "last" range.
 * - units hour, day, week (starting on `weekStart`, 1 Monday to 7 Sunday, ISO 8601's numbers),
 *   month, quarter, year.
 * - the reference is today (the wall clock of `options.now` of computePivot()), the data's latest or
 *   first date, or a date the filter names (`anchor`).
 *
 * Wall-clock ms have no daylight saving time: a day is 24 hours. An end beyond what a Date holds is
 * infinite (-Infinity, Infinity), so every date of the data is on its side of the reference.
 */

import { isDateMs } from "./time.js";
import { MS_PER_DAY } from "./util.js";

export const RELATIVE_UNITS = Object.freeze(["hour", "day", "week", "month", "quarter", "year"]);
export const RELATIVE_DIRECTIONS = Object.freeze(["last", "next", "this", "before"]);
/** The most units a relative range reaches: 500 years from today stay after year 1. */
export const RELATIVE_MAX_COUNT = 500;
/**
 * What a relative range counts from, besides a date of its own ("2025-06-30"): today (the default),
 * or the latest or the first date of the field's data (an archive, a closed year).
 */
export const RELATIVE_ANCHORS = Object.freeze(["today", "latest", "first"]);
/** The first day of a week by default: Monday (ISO 8601). */
export const WEEK_START = 1;

const MS_PER_HOUR = 3_600_000;

/**
 * @typedef {{ direction: string, unit: string, count?: number, calendar: boolean, includeCurrent: boolean }} RangeSpec
 */

// setUTCFullYear takes every year (Date.UTC reads 0 to 99 as 1900 to 1999) and rolls months over; it
// is NaN only for a day beyond the Date range
const at = (y, m, d) => new Date(0).setUTCFullYear(y, m, d);

/**
 * The start (wall-clock ms) of the unit `n` units after the one `ms` is in (0: its own), NaN beyond
 * what a Date holds. Counted from `ms`'s own calendar parts, so the unit next to the edge of the Date
 * range is found even where the start of `ms`'s own unit lies beyond it.
 */
function startOf(unit, ms, weekStart, n = 0) {
    if (unit === "hour") {
        const out = (Math.floor(ms / MS_PER_HOUR) + n) * MS_PER_HOUR;
        return isDateMs(out) ? out : NaN;
    }
    const d = new Date(ms);
    const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
    switch (unit) {
        case "day":
            return at(y, m, day + n);
        case "week":
            // the weekday as ISO 8601 numbers it (Monday 1 to Sunday 7), back to the week's first day
            return at(y, m, day - (((d.getUTCDay() || 7) - weekStart + 7) % 7) + 7 * n);
        case "month":
            return at(y, m + n, 1);
        case "quarter":
            return at(y, m - (m % 3) + 3 * n, 1);
        default:
            return at(y + n, 0, 1);
    }
}

/**
 * `ms` moved by `n` units. Months, quarters and years keep the day of the month where the target
 * month has it, else its last day (the 31st one month on is the 30th or the 28th).
 */
function shift(unit, ms, n) {
    if (unit === "hour" || unit === "day" || unit === "week") {
        const out = ms + n * (unit === "hour" ? MS_PER_HOUR : unit === "day" ? MS_PER_DAY : 7 * MS_PER_DAY);
        return isDateMs(out) ? out : NaN;
    }
    const months = n * (unit === "month" ? 1 : unit === "quarter" ? 3 : 12);
    const d = new Date(ms);
    const time = ms - at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const first = at(d.getUTCFullYear(), d.getUTCMonth() + months, 1);
    if (Number.isNaN(first)) {
        return NaN;
    }
    const f = new Date(first);
    const last = new Date(at(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    return at(f.getUTCFullYear(), f.getUTCMonth(), Math.min(d.getUTCDate(), last)) + time;
}

/**
 * The dates of a relative range, [from, to) in wall-clock ms, around `reference` (wall-clock ms).
 * @param {RangeSpec} spec
 * @param {number} reference
 * @param {number} [weekStart]  1 (Monday) to 7 (Sunday)
 * @returns {{ from: number, to: number }}
 */
export function rangeOf(spec, reference, weekStart = WEEK_START) {
    const { unit, calendar, includeCurrent } = spec;
    const count = spec.count ?? 1;
    const bounds = (from, to) => ({ from: Number.isNaN(from) ? -Infinity : from, to: Number.isNaN(to) ? Infinity : to });
    const unitAt = (n) => startOf(unit, reference, weekStart, n);
    if (spec.direction === "this") {
        return bounds(unitAt(0), unitAt(1));
    }
    const skip = includeCurrent ? 0 : 1;
    if (spec.direction === "next") {
        return calendar ? bounds(unitAt(skip), unitAt(count + skip)) : bounds(reference, shift(unit, reference, count) + 1);
    }
    // last, and before (everything before the last range)
    const last = calendar ? bounds(unitAt(1 - count - skip), unitAt(1 - skip)) : bounds(shift(unit, reference, -count), reference + 1);
    return spec.direction === "before" ? { from: -Infinity, to: last.from } : last;
}

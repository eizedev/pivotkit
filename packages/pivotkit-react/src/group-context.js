// Group-level hints load only with the menus.
import { CATALOG } from "pivotkit-core";
import { plural } from "./labels.js";
import { dateFormatter, dateRangeText } from "./date-context.js";

/** Scan the dictionary once for all Group choices, not once per choice.
 * @param {import("pivotkit-core").Encoded | undefined} encoded @param {string} field */
export function groupStats(encoded, field) {
    const column = encoded?.column(field);
    if (!column || column.type !== "date") return null;
    let min = Infinity, max = -Infinity;
    const months = new Set();
    // Every representable Gregorian year fits this fixed 68 KiB bitmap.
    const yearBits = new Uint8Array(Math.ceil(547582 / 8));
    let yearCount = 0;
    const date = new Date(0);
    for (const value of column.dict) {
        if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 8.64e15) continue;
        min = Math.min(min, value); max = Math.max(max, value);
        date.setTime(value);
        const month = date.getUTCMonth();
        const yearIndex = date.getUTCFullYear() + 271821;
        const byte = yearIndex >> 3, mask = 1 << (yearIndex & 7);
        if (!(yearBits[byte] & mask)) { yearBits[byte] |= mask; yearCount++; }
        months.add(month);
    }
    return min <= max ? {span: {min, max}, first: new Date(min), last: new Date(max), years: yearCount, months: [...months].sort((a, b) => a - b)} : null;
}

/** Inclusive calendar days, independent of the endpoint times. @param {{min: number, max: number}} span */
export const calendarDays = (span) => Math.floor(span.max / 86400000) - Math.floor(span.min / 86400000) + 1;

/** Data-derived hints in the Group level; wall-clock dates are formatted in UTC.
 * @param {import("pivotkit-core").Encoded} encoded @param {string} field @param {string} unit @param {string} locale @param {any} labels @param {ReturnType<typeof groupStats>} [stats] */
export function groupHint(encoded, field, unit, locale, labels, stats = groupStats(encoded, field)) {
    const span = stats?.span;
    if (!span || !stats) return labels.unitHints[unit] || undefined;
    const {first, last, months, years} = stats;
    const y1 = first.getUTCFullYear(), y2 = last.getUTCFullYear();
    const era = y1 <= 0 ? "short" : undefined;
    // Year and quarter keys use the core labeler's Gregorian, ASCII years.
    const firstYear = String(y1), lastYear = String(y2);
    if (CATALOG.cyclicUnits.includes(unit)) {
        let example = labels.unitHints[unit];
        if (unit === "month" || unit === "quarter") {
            const name = (m) => unit === "quarter" ? `Q${Math.floor(m / 3) + 1}` : dateFormatter(locale, {calendar: "gregory", month: "short", timeZone: "UTC"}).format(new Date(Date.UTC(2000, m, 1)));
            const periods = [...new Set(months.map((m) => unit === "quarter" ? Math.floor(m / 3) : m))];
            const runs = [];
            const text = (p) => name(unit === "quarter" ? p * 3 : p);
            for (let i = 0; i < periods.length; i++) {
                const first = periods[i];
                while (i + 1 < periods.length && periods[i + 1] === periods[i] + 1) i++;
                runs.push(first === periods[i] ? text(first) : `${text(first)}–${text(periods[i])}`);
            }
            example = runs.join(", ");
        }
        return `${example} · ${plural(labels.groupYearsTogether, years, {lang: labels.lang, locale})}`;
    }
    if (unit === "yearQuarter") {
        const q1 = Math.floor(first.getUTCMonth() / 3) + 1, q2 = Math.floor(last.getUTCMonth() / 3) + 1;
        return `Q${q1} ${firstYear} … Q${q2} ${lastYear} (${(y2 - y1) * 4 + q2 - q1 + 1})`;
    }
    if (unit === "year") return `${firstYear} … ${lastYear} (${y2 - y1 + 1})`;
    if (unit === "yearMonth") {
        const fmt = dateFormatter(locale, { year: "numeric", month: "short", timeZone: "UTC", era });
        const start = new Date(0), end = new Date(0);
        start.setUTCFullYear(y1, first.getUTCMonth(), 1);
        end.setUTCFullYear(y2, last.getUTCMonth(), 1);
        return `${fmt.format(start)} … ${fmt.format(end)} (${(y2 - y1) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1})`;
    }
    return dateRangeText(span, locale);
}

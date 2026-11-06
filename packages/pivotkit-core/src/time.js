/*
 * Dates as wall-clock milliseconds: the calendar date and clock time as a person reads them, encoded
 * as if they were UTC, so "2026-03-04T10:00" is 10:00 on every machine and grouping by month or hour
 * reads the UTC fields of that number.
 *
 * - An ISO string without an offset is taken as written; no time zone is involved.
 * - A Date object, epoch milliseconds or an ISO string with an offset is an instant; it becomes the
 *   wall clock of the data's time zone. The default is "UTC", never the machine's zone, so the same
 *   data gives the same pivot everywhere. Any IANA zone ("Europe/Berlin") can be chosen; "local"
 *   resolves to the machine's zone once, by name.
 *
 * Not part of the public API.
 */

import { PivotkitError } from "./errors.js";
import { MS_PER_DAY } from "./util.js";

export const DEFAULT_TIME_ZONE = "UTC";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/**
 * Milliseconds of a UTC date and time, years 0-99 included (Date.UTC maps them to 1900-1999).
 */
function utc(y, mo, d, h = 0, mi = 0, s = 0, ms = 0) {
    const date = new Date(Date.UTC(2000, mo - 1, d, h, mi, s, ms));
    date.setUTCFullYear(y);
    return date.getTime();
}

/**
 * Parses an ISO date string; null when it is not one or names a day or time that does not exist
 * (2026-02-30, 10:61).
 * @param {string} text
 * @returns {{ ms: number, offsetMinutes: number | null } | null}  ms: the wall clock as written
 */
export function parseIso(text) {
    const m = ISO_DATE.exec(text.trim());
    if (!m) {
        return null;
    }
    const [, ys, mos, ds, hs, mis, ss, frac, zone] = m;
    const [y, mo, d, h, mi, s] = [ys, mos, ds, hs ?? "0", mis ?? "0", ss ?? "0"].map(Number);
    if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) {
        return null;
    }
    const ms = utc(y, mo, d, h, mi, s, frac ? Math.round(Number(`0.${frac}`) * 1000) : 0);
    // rejects 2026-02-30, which Date.UTC would roll over into March
    if (new Date(ms).getUTCDate() !== d) {
        return null;
    }
    let offsetMinutes = null;
    if (zone) {
        if (zone === "Z") {
            offsetMinutes = 0;
        } else {
            const digits = zone.slice(1).replace(":", "");
            const oh = Number(digits.slice(0, 2));
            const om = Number(digits.slice(2) || 0);
            if (oh > 23 || om > 59) {
                return null;
            }
            offsetMinutes = (zone[0] === "-" ? -1 : 1) * (oh * 60 + om);
        }
    }
    return { ms, offsetMinutes };
}

/** True when the string is an ISO date that exists. */
export function isIsoDate(text) {
    return parseIso(text) !== null;
}

/**
 * The canonical name of a time zone option: "UTC", an IANA name, or the machine's zone for "local".
 * @param {unknown} timeZone  undefined for the default
 * @returns {string}
 */
export function resolveTimeZone(timeZone) {
    if (timeZone === undefined || timeZone === null) {
        return DEFAULT_TIME_ZONE;
    }
    if (timeZone === "local") {
        return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? DEFAULT_TIME_ZONE;
    }
    const name = canonicalTimeZone(timeZone);
    if (!name) {
        throw new PivotkitError("INVALID_OPTION", `time zone ${JSON.stringify(timeZone)} is not "UTC", "local" or an IANA name`);
    }
    return name;
}

/**
 * The canonical IANA name of a time zone; null when it is none.
 * @param {unknown} timeZone
 */
export function canonicalTimeZone(timeZone) {
    if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) {
        return null;
    }
    if (timeZone.toUpperCase() === "UTC") {
        return "UTC";
    }
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
    } catch {
        return null;
    }
}

/**
 * A function instant -> wall-clock ms in a time zone. Offsets are looked up once per day and only
 * computed exactly on days when the offset changes (daylight saving), so 100,000 Date objects cost
 * a few hundred Intl calls, not 100,000.
 * @param {string} timeZone  canonical, from resolveTimeZone
 * @returns {(instant: number) => number}
 */
export function wallClock(timeZone) {
    if (timeZone === "UTC") {
        return (t) => t;
    }
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
    });
    const offsetAt = (t) => {
        const p = {};
        for (const part of dtf.formatToParts(new Date(t))) {
            p[part.type] = Number(part.value);
        }
        const whole = t - (((t % 1000) + 1000) % 1000);
        return utc(p.year, p.month, p.day, p.hour, p.minute, p.second) - whole;
    };
    const days = new Map();
    return (t) => {
        const day = Math.floor(t / MS_PER_DAY);
        let offset = days.get(day);
        if (offset === undefined) {
            const start = offsetAt(day * MS_PER_DAY);
            const end = offsetAt((day + 1) * MS_PER_DAY - 1);
            // NaN marks a day with an offset change: computed per value
            offset = start === end ? start : NaN;
            days.set(day, offset);
        }
        return t + (Number.isNaN(offset) ? offsetAt(t) : offset);
    };
}

/**
 * Wall-clock milliseconds of a Date, an ISO date string or epoch milliseconds; NaN if it is none.
 * @param {unknown} value
 * @param {(instant: number) => number} toWall  from wallClock()
 */
export function toWallMs(value, toWall) {
    if (value instanceof Date) {
        const t = value.getTime();
        return Number.isNaN(t) ? NaN : toWall(t);
    }
    if (typeof value === "string") {
        const parsed = parseIso(value);
        if (!parsed) {
            return NaN;
        }
        return parsed.offsetMinutes === null ? parsed.ms : toWall(parsed.ms - parsed.offsetMinutes * 60_000);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return toWall(value);
    }
    return NaN;
}

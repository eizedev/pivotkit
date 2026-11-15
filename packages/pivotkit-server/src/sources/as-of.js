/*
 * When data is from (dataAsOf): every value a source gives (a file's time, a code source's asOf, an
 * HTTP body's field) is parsed here and written again in one form, ISO 8601 in UTC to the second
 * ("2026-11-15T08:00:00Z"). A source's own text never reaches a caller: a value that does not parse
 * is left out (the arrival time stands in) and a time in the future becomes now.
 */

/** The one form of a dataAsOf. */
export const AS_OF_FORM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** An ISO 8601 date with a time and a zone (or a date alone), as sources write it. */
const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2}))?$/i;

/** The earliest and latest times taken (before 1970 is no data source's time). */
const EARLIEST = Date.UTC(1970, 0, 1);

/**
 * A time as dataAsOf, or null when it does not parse.
 * @param {unknown} value  a Date, an ISO 8601 text, or a number of `epoch` units since 1970
 * @param {{ epoch?: "ms" | "s", now?: number }} [how]  epoch: what a number counts (default ms); now: the clock (tests)
 * @returns {string | null}
 */
export function asOfText(value, how = {}) {
    const now = how.now ?? Date.now();
    let ms = NaN;
    if (value instanceof Date) {
        ms = value.getTime();
    } else if (typeof value === "number" && Number.isFinite(value)) {
        ms = how.epoch === "s" ? value * 1000 : value;
    } else if (typeof value === "string" && value.length <= 40 && ISO.test(value.trim())) {
        ms = Date.parse(value.trim().replace(" ", "T"));
    }
    if (!Number.isFinite(ms) || ms < EARLIEST) {
        return null;
    }
    return new Date(Math.floor(Math.min(ms, now) / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

/**
 * The members a result gets from what its data said: dataAsOf, and stale when last good data stood in.
 * @param {{ asOf?: string | null, stale?: { since: string } | null }} read
 */
export function asOfMembers(read) {
    const asOf = typeof read?.asOf === "string" && AS_OF_FORM.test(read.asOf) ? read.asOf : null;
    const since = typeof read?.stale?.since === "string" && AS_OF_FORM.test(read.stale.since) ? read.stale.since : null;
    return { ...(asOf ? { dataAsOf: asOf } : {}), ...(asOf && since ? { stale: { since } } : {}) };
}

/** "2026-11-15 08:00 UTC" of a dataAsOf. */
const wordsOf = (asOf) => `${asOf.slice(0, 10)} ${asOf.slice(11, 16)} UTC`;

/**
 * One sentence on when the data is from, for a message: "Data as of 2026-11-15 08:00 UTC.", or
 * "The data is from 2026-11-15 08:00 UTC: the source could not be refreshed." for last good data;
 * empty without a time.
 * @param {{ dataAsOf?: string, stale?: { since: string } }} members  asOfMembers'
 */
export function asOfSentence(members) {
    if (!members.dataAsOf) {
        return "";
    }
    return members.stale ? `The data is from ${wordsOf(members.dataAsOf)}: the source could not be refreshed.` : `Data as of ${wordsOf(members.dataAsOf)}.`;
}

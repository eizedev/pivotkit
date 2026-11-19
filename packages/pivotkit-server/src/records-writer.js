/*
 * The rows of a data set as the JSON text of the rows route's `data` member: one array per column, in
 * the shape pivotkit-core's encode() reads (records.js writes the members around it). It runs in the
 * compute worker that holds the data set and gives the text in pieces of about `pieceChars`
 * characters, so neither thread ever holds the whole answer.
 *
 * Each value is written as the data set holds it: a text as it is, a number with every digit, true
 * or false, a date as ISO text without an offset (wall clock, so encode() reads the same day and
 * time in any time zone), null for a blank.
 */

/**
 * A wall-clock date as ISO text without an offset: the day alone in a column without clock times,
 * else the day and the time, with milliseconds when the value has them. The format of pivotkit-core's
 * data exports (rows.js isoWall), which its import reads back to the same value.
 * @param {number} ms  wall-clock milliseconds
 * @param {boolean} dateOnly
 */
export function isoWall(ms, dateOnly) {
    // a year beyond 9999 is written with its sign ("+10000-01-01"): split at the time, not at a place
    const [day, time] = new Date(ms).toISOString().split("T");
    if (dateOnly) {
        return day;
    }
    return `${day}T${ms % 1000 === 0 ? time.slice(0, 8) : time.slice(0, 12)}`;
}

/**
 * The type a column is answered with: its encoded type, or null for a column without any value (the
 * engine infers that again).
 * @param {import("pivotkit-core").Column} column
 * @returns {"string" | "number" | "boolean" | "date" | null}
 */
export const answeredType = (column) => (column.type === "null" ? null : column.type);

/**
 * The JSON text of one value of a column (a dictionary entry), or "null" for a blank.
 * @param {import("pivotkit-core").Column} column
 */
function valueText(column) {
    if (column.type === "date") {
        const dateOnly = Boolean(column.dateOnly);
        return (/** @type {unknown} */ v) => JSON.stringify(isoWall(/** @type {number} */ (v), dateOnly));
    }
    return (/** @type {unknown} */ v) => JSON.stringify(v);
}

/** About how many characters a piece holds by default: a quarter of a MiB of text. */
export const PIECE_CHARS = 262_144;

/**
 * The columns' values as JSON text in pieces: `[v,v,...],[v,...]` (the arrays of `data`, without the
 * brackets around them), each piece of about `pieceChars` characters, never cut inside a value.
 * Each distinct value is turned into JSON once per column (the column's dictionary as text, dropped
 * once the column is written), then written once per row it is in.
 * @param {{ length: number }} data  an encoded data set (its row count)
 * @param {import("pivotkit-core").Column[]} columns  the columns to write, in order
 * @param {number} [pieceChars]
 * @returns {Generator<string>}
 */
export function* columnPieces(data, columns, pieceChars = PIECE_CHARS) {
    /** @type {string[]} */
    let parts = [];
    let size = 0;
    const push = (text) => {
        parts.push(text);
        size += text.length;
    };
    for (let c = 0; c < columns.length; c++) {
        const column = columns[c];
        const text = valueText(column);
        // the dictionary's texts once, so a value in many rows is turned into JSON once
        const dict = column.dict.map(text);
        push(c === 0 ? "[" : ",[");
        for (let i = 0; i < data.length; i++) {
            const code = column.codes[i];
            push(`${i === 0 ? "" : ","}${code < 0 ? "null" : dict[code]}`);
            if (size >= pieceChars) {
                yield parts.join("");
                parts = [];
                size = 0;
            }
        }
        push("]");
    }
    if (parts.length) {
        yield parts.join("");
    }
}

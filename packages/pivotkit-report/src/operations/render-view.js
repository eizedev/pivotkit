/*
 * What render_view does beyond rendering: the caller's locale checked, and the result as text for
 * a reader.
 */

import { toCsv, toJson } from "pivotkit-core/export";
import { OperationError } from "./errors.js";

/**
 * render_view's text for a reader (input.inline), from the rendered grid: the csv without a byte
 * order mark, or the json on one line, with `zeros`, the values "shown" writes as 0 though they are
 * not 0; none for another format or over `maxCells` cells.
 * @param {import("pivotkit-core").Grid} grid
 * @param {string} format
 * @param {{ inline: { numbers?: "full" | "shown", maxCells?: number }, flatHeader?: boolean }} input
 * @returns {{ inline?: { text: string, zeros: number } }}
 */
export function inlineOf(grid, format, input) {
    const numbers = input.inline.numbers ?? "shown";
    if ((format !== "csv" && format !== "json") || grid.bodyRows.length * grid.columnCount > (input.inline.maxCells ?? Infinity)) {
        return {};
    }
    const text = format === "json" ? toJson(grid, { numbers, space: 0 }) : toCsv(grid, { numbers, flatHeader: input.flatHeader === true });
    return { inline: { text, zeros: numbers === "shown" ? shownZeros(grid) : 0 } };
}

/** The values "shown" writes as 0 though they are not 0 (a sum of 1e-9 at two decimals): json's values shown against full. */
function shownZeros(grid) {
    const values = (numbers) => JSON.parse(toJson(grid, { numbers, space: 0 })).rows.flatMap((/** @type {{ values: unknown[] }} */ row) => row.values);
    const full = values("full");
    return values("shown").filter((v, i) => v === 0 && typeof full[i] === "number" && full[i] !== 0).length;
}

/**
 * A caller's locale as Intl writes it; INVALID_INPUT for one that is no language tag, or one this
 * runtime has no number format for (Intl would fall back to the machine's locale).
 * @param {string} locale
 */
export function localeOf(locale) {
    try {
        const [canonical] = Intl.getCanonicalLocales(locale);
        if (canonical && /-u(?:-[a-z0-9]{2,8})*-nu(?:-|$)/i.test(canonical)) {
            throw new OperationError("INVALID_INPUT", "locale may not choose a numbering system (-u-nu-): csv and json write Latin digits; leave it out");
        }
        if (canonical && Intl.NumberFormat.supportedLocalesOf(canonical).length) {
            return canonical;
        }
    } catch (e) {
        if (e instanceof OperationError) {
            throw e;
        }
        // no language tag
    }
    throw new OperationError("INVALID_INPUT", "locale is no language tag this server knows; give one such as de-DE or en-US");
}

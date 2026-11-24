/*
 * The findings of a view, explained for a person: a view over data that lacks the fields it uses (the
 * data mismatch, with the hints to rename and the signs of an exported pivot result), the errors that
 * follow from another one (a missing field, a grouping the view cannot make), where a view's JSON
 * stops, and a data file given where the view belongs. A message holds header names and at most one
 * cell value, cut (errors.js). --json keeps every finding; the ones that follow from another are
 * marked `followsFrom` and counted there.
 */

import { DEFAULT_LABELS, REPORT_LABELS, closest, viewFileFields } from "pivotkit-core";
import { extname } from "node:path";
import { printable, shortName } from "pivotkit-node/files";
import { DATA_EXTENSIONS } from "./data.js";
import { quoteArg } from "./layout-view.js";
import { viewFileOf } from "./view.js";

/** A field name in a list of a message: at most this many characters. */
const NAME_LENGTH = 30;
/** A list of field names in a message: at most about this many characters, then "and n more". */
const LIST_LENGTH = 140;
/** A cell value in a message (what made a column text, a sign of a pivot result): at most this many characters. */
const VALUE_LENGTH = 20;

/** Text cut to `max` characters with "…". */
const cut = (text, max) => {
    const chars = Array.from(String(text));
    return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
};

/** Field names as a message lists them: each cut, as many as fit, then "and n more". */
function nameList(names) {
    const shown = [];
    let length = 0;
    for (const name of names) {
        const text = cut(name, NAME_LENGTH);
        if (shown.length && length + text.length + 2 > LIST_LENGTH) break;
        shown.push(text);
        length += text.length + 2;
    }
    return names.length > shown.length ? `${shown.join(", ")} and ${names.length - shown.length} more` : shown.join(", ");
}

/** What to take instead of an exported pivot result. */
const PIVOT_RESULT_ADVICE = Object.freeze(["in the report, take Export → Source data → All rows as CSV, and give that file to --data", "or give --data the file the report was made from, if you have it"]);

/** At most this many fields of a missing field's type are named as the one it may have been renamed to. */
const RENAME_CANDIDATES = 3;

/** The words of a value's name in a pivot result's header ("Sum of", "Summe von"), every language's. */
const VALUE_NAME = (() => {
    const words = new Set();
    for (const labels of [DEFAULT_LABELS, ...Object.values(REPORT_LABELS)]) {
        const joiner = labels.valueName.replace("{agg}", "").replace("{field}", "").trim();
        for (const agg of Object.values(labels.aggregators)) words.add(`${agg} ${joiner} `.toLowerCase());
    }
    return [...words];
})();
const TOTAL_NAMES = new Set([DEFAULT_LABELS.grandTotal, ...Object.values(REPORT_LABELS).map((l) => l.grandTotal)].map((t) => t.toLowerCase()));

/**
 * What says a data file is a pivot RESULT (the table's own CSV), not the rows: a grand total column,
 * a value's name ("Average of Mean °C") in its header or its first rows. Each cut for the message.
 * @param {import("pivotkit-core/import").ImportTable} table
 */
export function pivotResultSigns(table) {
    const signs = [];
    const total = table.columns.find((name) => TOTAL_NAMES.has(String(name).toLowerCase()));
    if (total) signs.push(cut(total, VALUE_LENGTH));
    const valueName = (text) => typeof text === "string" && VALUE_NAME.some((w) => text.toLowerCase().startsWith(w));
    const named = table.columns.find(valueName) ?? table.raw.flatMap((values) => values.slice(0, 3)).find(valueName);
    if (named) signs.push(cut(named, VALUE_LENGTH));
    return signs;
}

/**
 * The lines that say a data file looks like an exported pivot result, and what to take instead. Not
 * yet printable().
 * @param {string[]} signs  pivotResultSigns()
 * @param {string} rows  what the rows are: "the rows the report was made from", "the rows a report is made from"
 */
export const pivotResultLines = (signs, rows) => [`it ${signs.length > 1 ? "looks like" : "may be"} an exported pivot result (${signs.map((s) => JSON.stringify(s)).join(", ")}), not ${rows}:`, ...PIVOT_RESULT_ADVICE];

/** The words that say a data file may be an exported pivot result, as a finding gives them. */
export const pivotResultAdvice = () => PIVOT_RESULT_ADVICE.map(printable);

/** The errors a field the data does not have brings along, when they name one of the missing fields. */
const FOLLOW_ON = new Set(["unknownField", "groupingNoSource", "aggregatorNeedsField", "filterFieldType"]);

/**
 * The findings of a view over data, explained for a person: when the data lacks fields the view uses,
 * one error first (dataMismatch: the view's fields, the data's, the missing ones with a hint, and
 * whether the file looks like a pivot result); an error that names a missing field (and, for a pivot
 * result, a grouping whose name its header has) is marked as following from it; an unknown field
 * names the data's fields; a value refused on a text field names the value (cut) and row that made it
 * text.
 * @param {any[]} findings
 * @param {unknown} viewText  the view as given (text or an object of a link)
 * @param {{ table: any, name: string }} data  readData's result
 */
function explain(findings, viewText, data) {
    const columns = data.table.columns.map(String);
    const has = new Set(columns.map((c) => c.toLowerCase()));
    const read = viewFileOf(viewText);
    // the fields the view uses; source.fields (every field of the file) only gives their types
    const wanted = read.failed ? [] : viewFileFields(read.view ?? {});
    const missing = wanted.filter((name) => !has.has(String(name).toLowerCase()));
    const out = findings.map((f) => explainFinding(f, columns, data.table));
    return missing.length ? withMismatch(out, data, { columns, wanted, missing, fields: read.source?.fields ?? [] }) : out;
}

/**
 * One finding explained: an unknown field names the data's fields; a value refused on a text field
 * names the value and the row that made the column text.
 * @param {any} f
 * @param {string[]} columns
 * @param {any} table
 */
function explainFinding(f, columns, table) {
    if (f.code === "unknownField") {
        return { ...f, message: printable(`${f.message}; the data has: ${nameList(columns)}`) };
    }
    if (f.code === "aggregatorType" || f.code === "filterFieldType") {
        const field = /the string field "(.+)"/.exec(f.message)?.[1];
        const c = field === undefined ? -1 : columns.findIndex((name) => name.toLowerCase() === field.toLowerCase());
        const raw = c >= 0 ? table.raw[c] : [];
        const row = raw.findIndex((v) => v !== null && String(v).trim() !== "" && !Number.isFinite(Number(String(v).trim().replace(",", "."))));
        if (row >= 0) {
            return { ...f, message: printable(`${f.message} (read as text: its value ${JSON.stringify(cut(raw[row], VALUE_LENGTH))} in row ${row + 1} is no number)`) };
        }
    }
    return f;
}

/**
 * The dataMismatch error put before the first error, and the errors that follow from the missing
 * fields marked so.
 * @param {any[]} findings  explained one by one
 * @param {{ table: any, name: string }} data
 * @param {{ columns: string[], wanted: string[], missing: string[], fields: Array<{ name: string, type: string }> }} fit
 */
function withMismatch(findings, data, { columns, wanted, missing, fields }) {
    const signs = pivotResultSigns(data.table);
    const lower = missing.map((m) => String(m).toLowerCase());
    const namesMissing = (f) => lower.some((m) => f.message.toLowerCase().includes(`"${m}"`));
    const followers = findings.filter((f) => f.severity === "error" && ((FOLLOW_ON.has(f.code) && namesMissing(f)) || (f.code === "groupingNameTaken" && signs.length > 0)));
    const details = [
        `the view uses: ${nameList(wanted)}`,
        `the data has: ${nameList(columns)}`,
        ...renameHints(missing, columns, data.table.types, { wanted, fields }),
        ...(signs.length ? pivotResultLines(signs, "the rows the report was made from") : []),
        ...(followers.length ? [`and ${followers.length} more error${followers.length === 1 ? "" : "s"} from the missing fields (--json lists them)`] : [])
    ].map(printable);
    const mismatch = {
        severity: "error",
        code: "dataMismatch",
        path: "",
        message: printable(`${data.name} does not have the fields the view uses`),
        missing: missing.map((m) => printable(String(m))),
        dataFields: columns.map(printable),
        pivotResult: signs.length > 1,
        details
    };
    const first = findings.findIndex((f) => f.severity === "error");
    const marked = findings.map((f) => (followers.includes(f) ? { ...f, followsFrom: "dataMismatch" } : f));
    marked.splice(first < 0 ? marked.length : first, 0, mismatch);
    return marked;
}

/**
 * A line per missing field the data may have under another name: a name close to it, or the one or
 * few fields of its type (as the view file lists it) that the view does not use, with the --map to give.
 * @param {string[]} missing
 * @param {string[]} columns
 * @param {string[]} types  the data's column types
 * @param {{ wanted: string[], fields: Array<{ name: string, type: string }> }} view  the fields the view uses and the ones its file lists
 */
function renameHints(missing, columns, types, { wanted, fields }) {
    const typeOf = new Map(fields.map((f) => [String(f.name).toLowerCase(), f.type]));
    const wantedKeys = new Set(wanted.map((w) => String(w).toLowerCase()));
    const unusedOfType = (type) => columns.filter((c, i) => types[i] === type && !wantedKeys.has(c.toLowerCase()));
    return missing
        .map((name) => {
            const near = closest(String(name), columns);
            if (near) return `missing: "${cut(name, NAME_LENGTH)}" (did you mean "${cut(near, NAME_LENGTH)}"?)`;
            const type = typeOf.get(String(name).toLowerCase());
            return renameHint(name, type, type ? unusedOfType(type) : []);
        })
        .filter(Boolean);
}

/**
 * A missing field and the fields of its type the view does not use: exactly one is named as renamed,
 * a few as candidates, more as none.
 * @param {string} name
 * @param {string | undefined} type
 * @param {string[]} fresh
 */
function renameHint(name, type, fresh) {
    if (fresh.length === 1) {
        return `missing: "${cut(name, NAME_LENGTH)}" (${type}); the data has a new ${type} field "${cut(fresh[0], NAME_LENGTH)}": renamed? --map ${quoteArg(`${name}=${fresh[0]}`)}`;
    }
    // a few candidates: name them and the flag to give
    return fresh.length > 1 && fresh.length <= RENAME_CANDIDATES ? `missing: "${cut(name, NAME_LENGTH)}" (${type}); the data has ${type} fields the view does not use: ${fresh.map((f) => JSON.stringify(cut(f, NAME_LENGTH))).join(", ")}: one of them renamed? --map ${quoteArg(`${name}=<its new name>`)}` : null;
}

/** The grouping errors that leave a grouping out of the view, so that an error naming it follows from them. */
const GROUPING_DROPPED = new Set(["groupingNeedsDate", "binsNeedNumber", "groupingUnknown", "groupingNoSource", "binSize"]);

/**
 * A grouping the view cannot make (a date grouping of a text field) leaves its name unknown: the errors
 * that name it (an unknown field "Region by month") follow from it. They are marked `followsFrom` (the
 * grouping's code) and counted on the grouping's error, as a data mismatch counts its own; --json keeps
 * them.
 * @param {any[]} findings
 * @param {unknown} viewText  the view as given (text or an object of a link)
 */
function withGroupingFollowers(findings, viewText) {
    const read = viewFileOf(viewText);
    const derived = Array.isArray(read.view?.derived) ? read.view.derived : [];
    let out = findings;
    for (const grouping of findings.filter((f) => f.severity === "error" && GROUPING_DROPPED.has(f.code) && !f.followsFrom)) {
        const name = derived[Number(/^derived\[(\d+)\]$/.exec(grouping.path ?? "")?.[1])]?.name;
        if (typeof name !== "string" || !name) {
            continue;
        }
        const quotedName = `"${name.toLowerCase()}"`;
        const followers = out.filter((f) => f !== grouping && f.severity === "error" && !f.followsFrom && FOLLOW_ON.has(f.code) && f.message.toLowerCase().includes(quotedName));
        if (!followers.length) {
            continue;
        }
        const n = followers.length;
        const line = `and ${n} more error${n === 1 ? "" : "s"} from it (--json lists ${n === 1 ? "it" : "them"})`;
        out = out.map((f) => (followers.includes(f) ? { ...f, followsFrom: grouping.code } : f === grouping ? { ...f, details: [...(f.details ?? []), line] } : f));
    }
    return out;
}

/**
 * A view that is not JSON: where its JSON stops ("at line 2, column 30"), added to the finding that
 * says so.
 * @param {any[]} findings
 * @param {unknown} viewText
 */
export function withJsonPosition(findings, viewText) {
    if (typeof viewText !== "string" || !findings.some((f) => /not valid JSON/.test(f.message))) {
        return findings;
    }
    const at = jsonStopsAt(viewText);
    return findings.map((f) => (at && /not valid JSON/.test(f.message) ? { ...f, message: printable(f.message.replace("not valid JSON", `not valid JSON${at}`)) } : f));
}

/**
 * Where a text stops being JSON: " at line 2, column 30", or "" when the parser does not say.
 * @param {string} text
 */
function jsonStopsAt(text) {
    try {
        JSON.parse(text);
    } catch (e) {
        const position = Number(/position (\d+)/.exec(String(e.message))?.[1]);
        if (Number.isInteger(position)) {
            const before = text.slice(0, position).split("\n");
            return ` at line ${before.length}, column ${before.at(-1).length + 1}`;
        }
    }
    return "";
}

/**
 * A data file given where the view belongs (pivotkit validate sales.csv): the view file's error gets a
 * line that says to give it with --data, or what to run on data. Data: a file of a data extension, or
 * JSON that is a list (rows), not an object.
 * @param {any[]} findings
 * @param {{ view: unknown, source: string }} view  readView's result
 * @param {"render" | "validate"} command
 */
export function withDataHint(findings, view, command) {
    const file = findings.find((f) => f.code === "viewFile" && f.severity === "error");
    if (!file || ["argument", "link", "-"].includes(view.source)) {
        return findings;
    }
    const looksLikeData = DATA_EXTENSIONS.includes(extname(view.source).slice(1).toLowerCase()) || (typeof view.view === "string" && view.view.trimStart().startsWith("["));
    if (!looksLikeData) {
        return findings;
    }
    const name = quoteArg(shortName(view.source));
    const other = command === "validate" ? `describe it: pivotkit describe ${name}` : `make a view of it: pivotkit render ${name} --suggest`;
    const line = printable(`${shortName(view.source)} looks like data, not a view: give it with --data (pivotkit ${command} <view> --data ${name}), or ${other}`);
    return findings.map((f) => (f === file ? { ...f, details: [...(f.details ?? []), line] } : f));
}

/**
 * A view's findings over data, explained for a person: the data mismatch, then the errors that follow
 * from a grouping. Without data, only the grouping's followers.
 * @param {any[]} findings
 * @param {unknown} viewText
 * @param {{ table: any, name: string } | null} data
 */
export const explained = (findings, viewText, data) => withGroupingFollowers(data ? explain(findings, viewText, data) : findings, viewText);

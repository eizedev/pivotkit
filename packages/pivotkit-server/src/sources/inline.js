/*
 * Data sent in the request (the source id "inline:"): the caller's own table, never the operator's.
 *
 * - MCP: a small table in the input (`data`: columns, rows, rowCount), on unless mcp.data is false or
 *   the caller's profile says `data: false`, under a built-in cap (MCP_DATA_CAP: rows, cells and the
 *   bytes of `data` as JSON) the operator may lower (mcp.data) but never raise.
 * - REST: the same JSON `data`, or a file in a multipart body (rest/multipart.js), only for callers whose
 *   policy says `data: true` (policy.data, policy.profiles.<p>.data); their body may be up to
 *   rest.data.maxBytes (limits.js bodyBytesOf).
 *
 * The table is checked here (unique column names without control or direction characters, every row
 * as long as the columns, rowCount equal to the rows sent) and computed in a worker as a table job,
 * a file sent with the request parsed there under the compute and import limits; it is never kept
 * (no table key). No exposure policy applies: every field is shown to the caller who sent it; the
 * profile's inline limits still do. A link (create_link) and a schedule (draft_schedule) cannot be
 * made over it.
 */

import { cleanText } from "pivotkit-core/import";
import { LIMITS, PivotkitError } from "pivotkit-core";
import { OperationError } from "pivotkit-report/operations";
import { fieldKey, resolvePolicy } from "../policy.js";
import { asOfText } from "./as-of.js";

/** The reserved source id of data sent in the request. */
export const INLINE_ID = "inline:";

/** How a report names data sent in the request when the caller gives it no name. */
export const INLINE_NAME = "Data sent with the request";

/** The most a caller may send over MCP: the operator may lower it (mcp.data), never raise it. */
export const MCP_DATA_CAP = Object.freeze({ rows: 500, cells: 5000, bytes: 262_144 });

/** The largest REST body of a caller that may send data, unless rest.data.maxBytes says otherwise. */
export const REST_DATA_BYTES = 10_485_760;

/** The formats of a file sent in a multipart body, by extension and by media type. */
export const UPLOAD_FORMATS = Object.freeze({
    csv: ["text/csv"],
    tsv: ["text/tab-separated-values"],
    json: ["application/json"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
});

/** The longest name of the data, in characters (the `data` schema's name). */
const NAME_TEXT = 200;

/**
 * The cap of MCP inline data in force, or false when it is off (mcp.data: false).
 * @param {import("../config.js").ServerOptions} options
 * @returns {false | { rows: number, cells: number, bytes: number }}
 */
export function mcpCapOf(options) {
    const given = options.mcp?.data;
    if (given === false) {
        return false;
    }
    return Object.freeze({ ...MCP_DATA_CAP, ...(given ?? {}) });
}

/**
 * The largest REST body of a caller that may send data.
 * @param {import("../config.js").ServerOptions} options
 */
export const restDataBytesOf = (options) => options.rest?.data?.maxBytes ?? REST_DATA_BYTES;

/** The policy profile a caller is bound to, if any. */
const profileOf = (options, caller) => (caller?.profile && Object.hasOwn(options.policy?.profiles ?? {}, caller.profile) ? options.policy?.profiles?.[caller.profile] : undefined);

/**
 * Whether a caller may send data on a surface: REST only where its profile (else the server's
 * policy) says `data: true`; MCP unless mcp.data is false or its profile (else the server's policy)
 * says `data: false`.
 * @param {import("../config.js").ServerOptions} options
 * @param {import("../registry.js").Caller} caller
 * @param {"mcp" | "rest"} surface
 */
export function maySendData(options, caller, surface) {
    const own = profileOf(options, caller)?.data ?? options.policy?.data;
    return surface === "rest" ? own === true : mcpCapOf(options) !== false && own !== false;
}

/**
 * Whether any caller may send data over REST (a policy or a profile with `data: true`): the REST
 * service and its OpenAPI document offer `data` then, and a body may be larger than BODY_BYTES.
 * @param {import("../config.js").ServerOptions} options
 */
export const restDataOffered = (options) => options.policy?.data === true || Object.values(options.policy?.profiles ?? {}).some((p) => p?.data === true);

/**
 * The refusal of a caller that may not send data.
 * @param {"mcp" | "rest"} surface
 */
export function dataRefusal(surface) {
    return new OperationError("NOT_ALLOWED", surface === "rest" ? "your token may not send data (the operator allows it per profile: data: true)" : "this server takes no data sent in the request (the operator switched it off); use a source from list_sources");
}

/**
 * "256 KiB", "20 MiB" of a number of bytes.
 * @param {number} bytes
 */
export function bytesText(bytes) {
    /** @type {Array<[string, number]>} */
    const units = [["MiB", 1_048_576], ["KiB", 1024]];
    for (const [unit, size] of units) {
        if (bytes >= size) {
            const n = bytes / size;
            return `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}`;
        }
    }
    return `${bytes} bytes`;
}

/** "500 rows / 5000 cells / 256 KiB" of a cap. */
export const capText = (cap) => `${cap.rows} rows / ${cap.cells} cells / ${bytesText(cap.bytes)}`;

/**
 * The checks of a table sent as JSON that need no cell's value, so a large table is refused before
 * anything goes through its cells: rows and cells against the server's import limits and, on MCP,
 * the cap. Throws OperationError.
 * @param {any} data
 * @param {{ limits?: Partial<import("pivotkit-core").Limits>, cap?: false | { rows: number, cells: number, bytes: number } }} [how]
 */
export function checkTableSize(data, how = {}) {
    if (!data || typeof data !== "object" || !Array.isArray(data.rows) || !Array.isArray(data.columns)) {
        return;
    }
    const rows = data.rows.length;
    const cells = rows * data.columns.length;
    const cap = how.cap;
    if (cap && (rows > cap.rows || cells > cap.cells)) {
        throw new OperationError("LIMIT_EXCEEDED", `you sent ${rows} rows (${cells} cells): the limit is ${capText(cap)}; send fewer, or ask the operator to configure a source for this data`);
    }
    const limits = { ...LIMITS, ...(how.limits ?? {}) };
    if (rows > limits.rows || cells > limits.importCells) {
        throw new OperationError("LIMIT_EXCEEDED", `you sent ${rows} rows (${cells} cells): more than the server reads (limits.rows ${limits.rows}, limits.importCells ${limits.importCells})`);
    }
}

/**
 * A table sent as JSON, checked: its columns, every row as long as the columns, rowCount equal to the
 * rows sent, and on MCP the cap (rows, cells, and the bytes of `data` as JSON). The table as lists in
 * the columns' order (no row is an object keyed by a column's name, so "__proto__" is a plain name).
 * @param {any} data
 * @param {{ limits?: Partial<import("pivotkit-core").Limits>, cap?: false | { rows: number, cells: number, bytes: number } }} how
 * @returns {{ columns: string[], rows: unknown[][] }}
 */
export function checkTable(data, how) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new OperationError("INVALID_INPUT", "data is an object with columns, rows and rowCount");
    }
    if (!Array.isArray(data.columns) || !data.columns.length) {
        throw new OperationError("INVALID_INPUT", "data.columns lists the names of the columns, at least one");
    }
    if (!Array.isArray(data.rows)) {
        throw new OperationError("INVALID_INPUT", "data.rows is a list of rows, each a list of values in the columns' order");
    }
    if (!Number.isSafeInteger(data.rowCount) || data.rowCount < 0) {
        throw new OperationError("INVALID_INPUT", "data needs rowCount: the number of rows of the whole table");
    }
    checkTableSize(data, how);
    if (how.cap) {
        const bytes = Buffer.byteLength(JSON.stringify(data));
        if (bytes > how.cap.bytes) {
            throw new OperationError("LIMIT_EXCEEDED", `you sent ${bytesText(bytes)}: the limit is ${capText(how.cap)}; send fewer, or ask the operator to configure a source for this data`);
        }
    }
    const seen = new Map();
    data.columns.forEach((name, i) => {
        if (typeof name !== "string" || !name.trim()) {
            throw new OperationError("INVALID_INPUT", `data.columns[${i}] is a name (a text that is not empty)`);
        }
        if (cleanText(name) !== name.trim()) {
            throw new OperationError("INVALID_INPUT", `data.columns[${i}] holds a control or direction character`);
        }
        // the engine and the policy match names without case (and with whitespace collapsed)
        const key = fieldKey(name);
        if (seen.has(key)) {
            throw new OperationError("INVALID_INPUT", `data.columns[${i}] repeats the name of data.columns[${seen.get(key)}]: give every column its own name`);
        }
        seen.set(key, i);
    });
    const width = data.columns.length;
    data.rows.forEach((row, r) => {
        if (!Array.isArray(row)) {
            throw new OperationError("INVALID_INPUT", `data.rows[${r}] is a list of values in the columns' order`);
        }
        if (row.length !== width) {
            throw new OperationError("INVALID_INPUT", `data.rows[${r}] has ${row.length} value${row.length === 1 ? "" : "s"} but there are ${width} columns: give every row one value per column (null for none)`);
        }
        for (let c = 0; c < width; c++) {
            const value = row[c];
            if (!(value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))) {
                throw new OperationError("INVALID_INPUT", `data.rows[${r}][${c}] is a text, a number, true, false or null`);
            }
        }
    });
    if (data.rowCount !== data.rows.length) {
        throw new OperationError("DATA_MISMATCH", `you sent ${data.rows.length} rows but rowCount says ${data.rowCount}: send the whole table`);
    }
    return { columns: data.columns.map((name) => name.trim()), rows: data.rows };
}

/**
 * How a source is resolved for an input: the input's `data` added to `how`, so the registry's
 * "inline:" can take it. `data` goes with "inline:" only, and "inline:" only with data (or a file
 * sent in a multipart body: how.upload).
 * @param {Record<string, any>} input
 * @param {Record<string, any>} how
 */
export function inlineHow(input, how) {
    if (input.data !== undefined && input.source !== INLINE_ID) {
        throw new OperationError("INVALID_INPUT", `data goes with source "${INLINE_ID}": the source is then the table you send`);
    }
    return input.data === undefined ? how : { ...how, data: input.data };
}

/** A name the caller gave its data, cleaned as a report's name is; the default without one. */
const nameOf = (given) => (typeof given === "string" ? cleanText(given).slice(0, NAME_TEXT) : "") || INLINE_NAME;

/**
 * The policy over data sent in a request: every field shown (it is the caller's own; no field of the
 * server's or a profile's policy applies), with the caller's inline limits and values listed per field,
 * and the file route open (the caller may send data, which resolve checked).
 * @param {import("../config.js").ServerOptions} options
 * @param {import("../registry.js").Caller} caller
 * @returns {import("../policy.js").Policy}
 */
function inlinePolicy(options, caller) {
    const callers = resolvePolicy(options.policy, undefined, profileOf(options, caller));
    const open = resolvePolicy({}, { default: "show" });
    return { ...open, fields: new Map(), items: callers.items, inline: callers.inline, results: true, implicitDefault: false, auto: false, stats: null };
}

/**
 * "inline:" for a caller: the table it sent (how.data) or the file it sent in a multipart body
 * (how.upload), checked, as a source of the kind "inline". Throws NOT_ALLOWED when the caller may not
 * send data on this surface.
 * @param {any} reg  the registry's internals (registry.js)
 * @param {string} _ref
 * @param {import("../registry.js").Caller} caller
 * @param {{ surface?: "mcp" | "rest", data?: unknown, upload?: { bytes: Uint8Array, format: string, sheet?: string, name?: string, asOf?: string } }} how
 * @param {unknown} [params]
 */
export function resolveInline(reg, _ref, caller, how, params) {
    const surface = how.surface ?? "mcp";
    if (!maySendData(reg.options, caller, surface)) {
        throw dataRefusal(surface);
    }
    if (params !== undefined && params !== null && Object.keys(params).length) {
        throw new OperationError("INVALID_INPUT", `source "${INLINE_ID}" takes no params`);
    }
    const upload = how.upload;
    if (!upload && how.data === undefined) {
        throw new OperationError("INVALID_INPUT", `source "${INLINE_ID}" is the table you send: give data with columns, rows and rowCount`);
    }
    const meta = /** @type {any} */ (upload ?? how.data);
    const table = upload ? null : checkTable(how.data, { limits: reg.limits, cap: surface === "mcp" ? mcpCapOf(reg.options) : false });
    const policy = inlinePolicy(reg.options, caller);
    // stated by the caller: parsed and written again, shown as suppliedAsOf, never as dataAsOf
    const supplied = typeof meta?.asOf === "string" ? asOfText(meta.asOf) : null;
    return {
        sourceKind: "inline",
        policy,
        source: null,
        link: null,
        template: undefined,
        params: null,
        descriptions: null,
        // the caller's own data, which may be about a person: closed for delivery (registry.js
        // isClosedForDelivery), so a report over it gets only a link its sender can open, or none
        sourceClosed: true,
        table,
        upload: upload ? { bytes: upload.bytes, format: upload.format, ...(upload.sheet ? { sheet: upload.sheet } : {}) } : null,
        // when the data arrived: what dataAsOf says
        asOf: asOfText(new Date()),
        suppliedAsOf: supplied,
        spec: { id: INLINE_ID, kind: "inline", name: nameOf(meta?.name), levels: reg.levelsOf(policy), limits: reg.limits, timeZone: reg.options.timeZone, schedulable: false }
    };
}

/** The longest message of a file sent in the request that cannot be read. */
const UPLOAD_MESSAGE = 300;

/**
 * The error of a file the caller sent that cannot be read, in words: the reader's own sentence (the
 * file is the caller's, so what it quotes of it goes back to its sender), cleaned and cut, and for a
 * workbook without the sheet asked for, its sheets. Anything else as data.js asOperationError says it.
 * @param {unknown} error
 * @param {{ bytes: Uint8Array, format: string, sheet?: string }} upload
 * @param {Partial<import("pivotkit-core").Limits>} limits
 * @returns {Promise<Error>}
 */
export async function uploadError(error, upload, limits) {
    if (!(error instanceof PivotkitError) || error.code !== "INVALID_FILE") {
        const { asOperationError } = await import("../data.js");
        return asOperationError(error, INLINE_NAME);
    }
    let text = cleanText(String(error.message)).replace(/\.$/, "");
    if (error.details?.reason === "NO_SHEET" && upload.format === "xlsx") {
        try {
            const reader = await (await import("pivotkit-xlsx")).default.load();
            const sheets = await reader.sheets(new File([/** @type {BlobPart} */ (upload.bytes)], `${INLINE_NAME}.xlsx`), { name: `${INLINE_NAME}.xlsx`, limits });
            text += `; its sheets: ${sheets.map((s) => `"${cleanText(String(s.name)).slice(0, 80)}"`).join(", ")}`;
        } catch {
            // the list is a help; the error stands without it
        }
    }
    return new OperationError("INVALID_FILE", text.slice(0, UPLOAD_MESSAGE));
}

/** Data sent in the request: computed in a worker as a table job, never kept. */
export const inlineKind = Object.freeze({
    /**
     * @param {any} computer
     * @param {string} op
     * @param {any} input
     * @param {any} resolved  resolveInline's
     * @param {any} base  link, template, locale, time zone
     */
    async run(computer, op, input, resolved, base) {
        if (op === "create_link") {
            throw new OperationError("NO_LINK", "data sent in the request cannot be linked: a link opens a source of the operator's; render the report to a file instead");
        }
        if (op === "draft_schedule") {
            throw new OperationError("NOT_SCHEDULABLE", "a schedule cannot run over data sent in the request; ask the operator to add it as a source");
        }
        const job = { ...base, spec: resolved.spec, tableKey: null, asOf: resolved.asOf, ...(resolved.upload ? { upload: resolved.upload } : { table: resolved.table }) };
        const ran = await computer.run(op, input, job);
        return { ...ran, suppliedAsOf: resolved.suppliedAsOf };
    }
});

/**
 * What list_sources says about data sent in the request to a caller that may send it: the cap (MCP)
 * or the largest body (REST); nothing otherwise.
 * @param {import("../config.js").ServerOptions} options
 * @param {import("../registry.js").Caller} caller
 * @param {"mcp" | "rest"} surface
 */
export function dataListEntry(options, caller, surface) {
    if (!maySendData(options, caller, surface)) {
        return {};
    }
    const cap = mcpCapOf(options);
    return { data: surface === "rest" ? { maxBytes: restDataBytesOf(options) } : { ...(cap || MCP_DATA_CAP) } };
}

/**
 * What a log line may say about data sent in the request: how many rows and columns (or, for a file,
 * its format and bytes), never a value or a name.
 * @param {any} input  an operation's input
 * @param {{ bytes: Uint8Array, format: string } | null} [upload]  a file sent in a multipart body
 * @returns {Record<string, number | string>}
 */
export function inlineLogFields(input, upload = null) {
    if (upload) {
        return { format: upload.format, bytes: upload.bytes.length };
    }
    const data = input?.source === INLINE_ID ? input?.data : undefined;
    if (!data || typeof data !== "object") {
        return {};
    }
    return { ...(Array.isArray(data.rows) ? { rows: data.rows.length } : {}), ...(Array.isArray(data.columns) ? { columns: data.columns.length } : {}) };
}

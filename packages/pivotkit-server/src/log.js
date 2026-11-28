/*
 * The log: one line per event on stderr (stdout is the protocol on stdio), as JSON or as text
 * (logfmt, in the style of Go's slog TextHandler), with the same fields. `log.format` "auto" writes
 * text to a terminal and JSON otherwise; "text" and "json" force one. Every line has `time`, `level`
 * (debug, info, warn, error), `severity` (the RFC 5424 number: 7, 6, 4, 3), `event`, `msg`, `service`
 * and `version`; a JSON line of an info, warn or debug message repeats `msg` as `message` (the field
 * many log collectors read; the text format leaves it out); a line written inside a request adds the request's scope (request-id.js):
 * `requestId`, `traceId`, `upstreamRequestId` (a valid incoming X-Request-Id) and, unless
 * `log.address` is "off", `address` (the client as best known: behind a trusted proxy the forwarded
 * one, else the socket's peer) and `peerAddress` (the socket's peer where it differs: the proxy).
 *
 * A tool call (MCP) or a request (REST) logs its operation, the source (a configured id, `inline:`,
 * `file:` or `unknown`, at most SOURCE_LOG_TEXT characters), the client (a token's name or an OAuth
 * client id), the person only where the operator asked for it (audit.subject: a keyed hash or the
 * claim's text, `subject`), its status and `outcome` (ok or error; the line's level follows the
 * status: info, warn for 4xx, error for 5xx), its error code and its time; a downloaded file is an
 * event of its own, a refused request one with its `reason`. Never a view, a value, a token, a
 * person's groups or other claims, or a full path.
 */

import { createHmac } from "node:crypto";
import { requestScope, withRequestScope } from "./request-id.js";

/** The caller's fields a log line may hold; a person's groups, claims or issuer never, the subject only as audit gives it (callerFields). */
export const CALLER_LOG_FIELDS = Object.freeze(["client"]);

/** The most characters of a subject logged as text (audit.subject "plain"). */
export const AUDIT_PLAIN_TEXT = 128;

/** What a subject logged as text leaves out: control characters (C0, C1), the bidi controls that turn text around, and U+2028/U+2029, which split a line; never the joiners (ZWJ, ZWNJ) a name may need. */
const AUDIT_STRIPPED = /[\p{Cc}\p{Zl}\p{Zp}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;


/** The hex characters of a subject logged as a keyed hash (audit.subject "hash"). */
export const AUDIT_HASH_TEXT = 16;

/**
 * How a log line names a signed-in person, or null for none: "hash", the first AUDIT_HASH_TEXT hex
 * characters of HMAC-SHA256(key, JSON of [issuer, subject]); "plain", the subject without control
 * characters (C0, C1, the bidi controls, the line and paragraph separators; the joiners that some
 * names need stay), at most AUDIT_PLAIN_TEXT characters; "off" or no subject, null.
 * @param {{ subject: "off" | "hash" | "plain", key?: Uint8Array | null }} audit
 * @param {string | null | undefined} issuer
 * @param {string | null | undefined} subject
 * @returns {string | null}
 */
export function auditText(audit, issuer, subject) {
    if (typeof subject !== "string" || !subject || audit.subject === "off") {
        return null;
    }
    if (audit.subject === "hash") {
        return audit.key ? createHmac("sha256", audit.key).update(JSON.stringify([issuer ?? null, subject])).digest("hex").slice(0, AUDIT_HASH_TEXT) : null;
    }
    const text = subject.replace(AUDIT_STRIPPED, "").slice(0, AUDIT_PLAIN_TEXT);
    return text || null;
}

/** The person each caller is logged as, set where its token was verified (auth.js callerOf). */
const audited = new WeakMap();

/**
 * Notes how a caller's log lines name its person (auditText's); a null leaves it unnamed.
 * @param {object} caller
 * @param {string | null | undefined} text
 */
export function noteAudit(caller, text) {
    if (typeof text === "string" && text) {
        audited.set(caller, text);
    }
}

/**
 * The subject text noteAudit kept for a caller, or null (audit.subject off).
 * @param {object} caller
 * @returns {string | null}
 */
export const auditedText = (caller) => audited.get(caller) ?? null;

/**
 * The caller's fields for a log line: only CALLER_LOG_FIELDS, only texts, and `subject` where the
 * operator's audit setting named the person when the token was verified.
 * @param {Partial<import("./registry.js").Caller> | null | undefined} caller
 * @returns {{ client?: string, subject?: string }}
 */
export function callerFields(caller) {
    const fields = Object.fromEntries(CALLER_LOG_FIELDS.flatMap((key) => (typeof caller?.[key] === "string" ? [[key, caller[key]]] : [])));
    const subject = caller && typeof caller === "object" ? audited.get(caller) : undefined;
    return subject ? { ...fields, subject } : fields;
}

/** The levels of `log.level`, least to most severe; "off" writes nothing. */
export const LOG_LEVELS = Object.freeze(["debug", "info", "warn", "error", "off"]);

/** The formats of `log.format`: "auto" is text on a terminal and JSON otherwise. */
export const LOG_FORMATS = Object.freeze(["auto", "text", "json"]);

/** `log.address`: "on" logs the socket's peer (and the forwarded client with http.trustProxy). */
export const LOG_ADDRESS = Object.freeze(["on", "off"]);

/** The settings of a server that names none. */
export const LOG_DEFAULTS = Object.freeze({ level: "info", format: "auto", address: "on" });

/** The RFC 5424 severity of each level (syslog's numbers; GELF's `level` uses the same). */
export const SEVERITY = Object.freeze({ debug: 7, info: 6, warn: 4, error: 3 });

/** The most characters of `source` on a line, the same on REST and MCP lines. */
export const SOURCE_LOG_TEXT = 64;

/** Each level's rank: a line is written when its rank reaches the setting's. */
const RANK = Object.freeze({ debug: 0, info: 1, warn: 2, error: 3, off: 4 });

/**
 * @typedef {{ level: "debug" | "info" | "warn" | "error" | "off", format: "auto" | "text" | "json", address: "on" | "off" }} LogSettings
 */

/**
 * The log settings of the options' `log`: a level alone ("debug", the short form) or an object with
 * level, format and address; what is not given is LOG_DEFAULTS'.
 * @param {string | Partial<LogSettings> | undefined} log
 * @returns {LogSettings}
 */
export function logSettingsOf(log) {
    const given = typeof log === "string" ? { level: log } : (log ?? {});
    return /** @type {LogSettings} */ ({ ...LOG_DEFAULTS, ...Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined)) });
}

/**
 * The format a log writes: "auto" is text when the stream is a terminal, JSON otherwise.
 * @param {LogSettings["format"]} format
 * @param {{ isTTY?: boolean }} stream
 * @returns {"text" | "json"}
 */
export const formatOf = (format, stream) => (format === "auto" ? (stream?.isTTY ? "text" : "json") : format);

/**
 * A line's level by its answer: info below 400, warn for 4xx, error for 5xx. A 503 BUSY is warn: the
 * server is full, a client may try again, and nothing is broken.
 * @param {number} status
 * @param {{ code?: unknown, reason?: unknown }} [entry]  the line's fields: a refused line names BUSY by its reason
 */
export const levelOfStatus = (status, entry = {}) => (status >= 500 && !isBusy(entry) ? "error" : status >= 400 ? "warn" : "info");

/**
 * Whether a line is of a BUSY answer: by its code, or by a refused line's reason. A new refusal
 * that answers BUSY logs its reason through REFUSAL_REASONS.BUSY, or it counts as a fault.
 */
const isBusy = (entry) => entry.code === "BUSY" || (entry.code === undefined && entry.reason === REFUSAL_REASONS.BUSY);

/** The fields the text format leaves out: the same on every line of a process (started names them) or meant for a log shipper. */
const TEXT_LEFT_OUT = new Set(["severity", "service", "traceId"]);

/** A key as the text format writes it: letters, digits, "_", "." and "-". */
const textKey = (key) => key.replace(/[^A-Za-z0-9_.-]/g, "_") || "_";

/** A value as text: what would break the line or turn text around removed (AUDIT_STRIPPED). */
const plainText = (text) => text.replace(AUDIT_STRIPPED, "");

/**
 * The JSON format's replacer: every text value, nested ones too, through plainText, so a C1 control
 * a caller sent (in a forwarded address, a Host or an Origin) never reaches a log shipper raw.
 * @param {string} _key
 * @param {unknown} value
 */
const jsonValue = (_key, value) => (typeof value === "string" ? plainText(value) : value);

/**
 * A value as the text format writes it (slog's rules): a number or boolean as it is; a list of plain
 * values joined with ","; any other object as JSON; text quoted (with JSON's escapes) when it is
 * empty or holds a space, "=", a quote or a backslash; control and bidi characters removed first.
 * @param {unknown} value
 */
function textValue(value) {
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
        return String(value);
    }
    const text = plainText(Array.isArray(value) && value.every((v) => v === null || typeof v !== "object") ? value.join(",") : typeof value === "object" ? JSON.stringify(value) : String(value));
    return text === "" || /[\s="\\]/.test(text) ? JSON.stringify(text) : text;
}

/** The ANSI colour of each level's name on a terminal. */
const COLOURS = Object.freeze({ debug: "\x1b[90m", info: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" });

/**
 * One line of the text format: key=value pairs, the level's name coloured when `colour`.
 * @param {Record<string, unknown>} fields
 * @param {boolean} colour
 */
function textLine(fields, colour) {
    const parts = [];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || TEXT_LEFT_OUT.has(key) || (key === "message" && typeof value === "string" && plainText(value).slice(0, 500) === fields.msg) || (key === "version" && fields.msg !== "started")) {
            continue;
        }
        const text = textValue(value);
        parts.push(`${textKey(key)}=${colour && key === "level" ? `${COLOURS[/** @type {keyof typeof COLOURS} */ (value)] ?? ""}${text}\x1b[0m` : text}`);
    }
    return parts.join(" ");
}

/**
 * Fields put into a line after the first of `after` it has (or at its end): the line keeps the order
 * a person reads it in (the client, then where it came from; the status, then the outcome).
 * @param {Array<[string, unknown]>} pairs
 * @param {string[]} after
 * @param {Array<[string, unknown]>} added
 */
function insertAfter(pairs, after, added) {
    if (!added.length) {
        return;
    }
    const at = pairs.findLastIndex(([key]) => after.includes(key));
    pairs.splice(at < 0 ? pairs.length : at + 1, 0, ...added);
}

/**
 * Whether the request running now wrote a line of its own: an outcome line (also one the level
 * leaves out, such as a debug refusal at info) or an error. The mark is the scope's `answer` box
 * (request-id.js), which every copy of the scope with the same id shares, so a line written inside
 * withRequestId reaches the HTTP edge's check. logUnanswered writes a `refused` line for an error
 * answer of any other request.
 * @param {number} [status]  the line's status (an error line: 500), kept as the highest so far
 */
export function noteAnswered(status = 0) {
    const answer = requestScope()?.answer;
    if (answer) {
        answer.logged = true;
        // the highest status a line of the request named: a 500 the HTTP edge answers later still
        // gets an error line unless one is there
        answer.worst = Math.max(answer.worst ?? 0, Number.isFinite(status) ? status : 0);
    }
}

/**
 * Notes, for the request running now, a refusal the MCP SDK reported (onerror) without its status:
 * the HTTP edge's check writes it as the request's `refused` line, with the answer's status.
 * @param {{ error: string, refusal?: string, detail: string }} protocol  error: the error's class; refusal: the SDK's fixed name for it; detail: its message (debug only: it can quote the body)
 * @returns {boolean} false outside a request's scope (nothing noted)
 */
export function noteProtocolRefusal(protocol) {
    const answer = requestScope()?.answer;
    if (answer) {
        answer.protocol = protocol;
    }
    return Boolean(answer);
}

/** The code whose reason a refused line written for an answer without a problem code gives, by its status; any other 4xx is INVALID_INPUT, a 5xx INTERNAL. */
const STATUS_CODES = Object.freeze({ 400: "INVALID_INPUT", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 406: "NOT_ACCEPTABLE", 413: "BODY_TOO_LARGE", 415: "UNSUPPORTED_MEDIA_TYPE", 429: "RATE_LIMITED" });

/** The statuses whose refused line is kept to the debug log: routine noise (a scan of paths, a GET of a stateless MCP endpoint). */
const ROUTINE_STATUSES = new Set([404, 405]);

/** An answer's problem code (RFC 9457 `code`), or null for an answer that is not a problem. */
async function problemCodeOf(response) {
    if (!String(response.headers.get("content-type") ?? "").includes("problem+json")) {
        return null;
    }
    const body = await response.clone().json().catch(() => null);
    return typeof body?.code === "string" && /^[A-Z_]{1,40}$/.test(body.code) ? body.code : null;
}

/**
 * The HTTP edge's last check: an error answer (4xx or 5xx; it carries an X-Request-Id) whose request
 * wrote no line of its own gets a `refused` line: its reason the answer's problem code, else its
 * status's; at debug for 404 and 405 (`notFound` raises a 404's), at warn for another 4xx, at error
 * for a 5xx. A refusal the SDK reported (noteProtocolRefusal) is written here, with its class and
 * name. So every refusal can be found by its id: a route nobody serves, a method a route does not
 * take, a body or a header the MCP SDK refused.
 * @param {{ level: string, refused(entry: Record<string, any>, how?: { level?: string }): void, warn(message: string, extra?: Record<string, unknown>): void }} log
 * @param {import("./request-id.js").RequestScope | null | undefined} scope  the request's (requestScopeFor's)
 * @param {Response | null | undefined} response
 * @param {{ path?: string, notFound?: "info" }} [fields]  path: the route family that answered; notFound: the level of a 404 there (a download link: a person asks the operator about it)
 * @returns {Promise<Response | null | undefined>} the response
 */
export async function logUnanswered(log, scope, response, fields = {}) {
    const status = Number(response?.status);
    const answer = scope?.answer;
    if (!scope || !answer || !response || answer.logged || !(status >= 400 && status < 600)) {
        return response;
    }
    const code = (await problemCodeOf(response)) ?? STATUS_CODES[/** @type {keyof typeof STATUS_CODES} */ (status)] ?? (status >= 500 ? "INTERNAL" : "INVALID_INPUT");
    const protocol = answer.protocol;
    const entry = { status, ...(fields.path ? { path: fields.path } : {}), reason: refusalReason(code), ...(protocol ? { error: protocol.error, ...(protocol.refusal ? { refusal: protocol.refusal } : {}), ...(log.level === "debug" ? { detail: protocol.detail } : {}) } : {}) };
    const level = status === 404 && fields.notFound ? fields.notFound : ROUTINE_STATUSES.has(status) ? "debug" : undefined;
    withRequestScope(/** @type {any} */ (scope), () => log.refused(entry, level ? { level } : {}));
    return response;
}

/** The events whose level and outcome follow their status (or `ok`). */
const OUTCOME_EVENTS = new Set(["call", "request", "download", "records", "refused"]);

/**
 * A log on a stream.
 * @param {"debug" | "info" | "warn" | "error" | "off" | Partial<LogSettings>} settings  a level (the short form) or the settings
 * @param {{ write(text: string): unknown, isTTY?: boolean }} stream
 * @param {{ service?: string, version?: string, env?: Record<string, string | undefined> }} [about]  service and version: the program on every line; env: NO_COLOR is read from it
 */
export function createLog(settings, stream, { service = "pivotkit-server", version = "", env = process.env } = {}) {
    const { level, format: wanted, address } = logSettingsOf(settings);
    const format = formatOf(wanted, stream);
    const colour = format === "text" && Boolean(stream?.isTTY) && !env.NO_COLOR;
    const threshold = RANK[level] ?? RANK.info;

    /**
     * Writes one line when its level reaches the setting (`always`: at every level but off).
     * @param {"debug" | "info" | "warn" | "error"} lineLevel
     * @param {string} msg
     * @param {Record<string, unknown>} entry
     * @param {boolean} [always]
     */
    const write = (lineLevel, msg, entry, always = false) => {
        if (level === "off" || (!always && RANK[lineLevel] < threshold)) {
            return;
        }
        // every line written inside a request names it (an entry's own requestId wins)
        const scope = requestScope();
        /** @type {Array<[string, unknown]>} */
        const pairs = [
            ["time", new Date().toISOString()],
            ["level", lineLevel],
            ["severity", SEVERITY[lineLevel]],
            ["event", entry.event],
            ["msg", plainText(String(msg)).slice(0, 500)],
            ["service", service],
            ["version", version],
            ...(scope ? /** @type {Array<[string, unknown]>} */ ([["requestId", scope.id], ["traceId", scope.traceId], ...(scope.upstreamRequestId ? [["upstreamRequestId", scope.upstreamRequestId]] : [])]) : [])
        ];
        const keyed = new Map(pairs);
        for (const [key, value] of Object.entries(entry)) {
            if (key === "event" || value === undefined || (address === "off" && (key === "address" || key === "peerAddress"))) {
                continue;
            }
            const shown = key === "source" && typeof value === "string" ? plainText(value).slice(0, SOURCE_LOG_TEXT) : value;
            if (keyed.has(key)) {
                pairs[pairs.findIndex(([k]) => k === key)][1] = shown;
            } else {
                pairs.push([key, shown]);
            }
            keyed.set(key, shown);
        }
        if (address === "on" && scope && !keyed.has("address")) {
            insertAfter(pairs, ["client", "subject"], /** @type {Array<[string, unknown]>} */ ([...(scope.address ? [["address", scope.address]] : []), ...(scope.peerAddress ? [["peerAddress", scope.peerAddress]] : [])]));
        }
        if (OUTCOME_EVENTS.has(String(entry.event)) && !keyed.has("outcome")) {
            insertAfter(pairs, ["status", "ok"], [["outcome", entry.event !== "refused" && entry.ok !== false && !(Number(entry.status) >= 400) ? "ok" : "error"]]);
        }
        const fields = Object.fromEntries(pairs);
        stream.write(`${format === "text" ? textLine(fields, colour) : JSON.stringify(fields, jsonValue)}\n`);
    };

    /**
     * A line of an event whose level follows its status (or `ok`): call, request, download, records, refused.
     * @param {string} event
     * @param {(entry: Record<string, any>, ok: boolean) => string} msgOf
     * @returns {(entry: Record<string, any>, how?: { level?: "debug" | "info" }) => void}  how.level: a refusal kept to the debug log, or one at info (a download link nobody has)
     */
    const outcomeLine = (event, msgOf) => (/** @type {Record<string, any>} */ entry, /** @type {{ level?: "debug" | "info" }} */ how = {}) => {
        const status = Number(entry.status);
        const ok = event !== "refused" && entry.ok !== false && !(status >= 400);
        noteAnswered(status);
        // debug: a refusal that is routine noise (a GET of a stateless MCP endpoint, a path nobody serves)
        const lineLevel = how.level ?? (Number.isFinite(status) && status > 0 ? levelOfStatus(status, entry) : ok ? "info" : "warn");
        write(lineLevel, msgOf(entry, ok), { event, ...entry });
    };

    /** An operation's name for a message: a known word, or "operation". */
    const nameOf = (value) => (typeof value === "string" && /^[a-z_]{1,40}$/.test(value) ? value : "operation");

    return {
        level,
        /** The format lines are written in ("text" or "json"; "auto" decided). */
        format,
        /** Whether lines name addresses (log.address). */
        address,
        /** A tool call. */
        call: outcomeLine("call", (entry, ok) => `${nameOf(entry.tool)} ${ok ? "ok" : "failed"}`),
        /** A REST request that reached an operation. */
        request: outcomeLine("request", (entry, ok) => `${nameOf(entry.operation)} ${ok ? "ok" : "failed"}`),
        /** A file handed out: by a REST caller's file route or a download link. */
        download: outcomeLine("download", (_entry, ok) => (ok ? "file sent" : "download failed")),
        /** The rows of a source handed out (records.js): written once its answer ended, whole or cut. Counts only, never a value. */
        records: outcomeLine("records", (_entry, ok) => (ok ? "rows sent" : "rows cut off")),
        /** An HTTP request refused before it reached a tool (Host, Origin, token, size, limits): its `reason`. */
        refused: outcomeLine("refused", (entry) => `request refused${typeof entry.reason === "string" ? `: ${entry.reason}` : ""}`),
        /** The server is serving: written at every level but off. */
        started: (extra = {}) => write("info", "started", { event: "info", message: "started", ...extra }, true),
        /** The server has stopped, after running requests finished or the grace time ended: written at every level but off. */
        stopped: (extra = {}) => write("info", "stopped", { event: "info", message: "stopped", ...extra }, true),
        info: (message, extra = {}) => write("info", message, { event: "info", message, ...extra }),
        warn: (message, extra = {}) => write("warn", message, { event: "warning", message, ...extra }),
        /** Only with log.level debug: details an operator needs to set up (why a token was refused). */
        debug: (message, extra = {}) => write("debug", message, { event: "debug", message, ...extra }),
        /** An unexpected error: its name and message only with log.level debug, its stack never. */
        error: (error, extra = {}) => {
            noteAnswered(500);
            write("error", "unexpected error", { event: "error", ...extra, ...(level === "debug" ? { error: String(error?.message ?? error).slice(0, 500) } : { error: error?.name ?? "Error" }) });
        }
    };
}

/**
 * A line said before a log exists (a configuration that cannot be read at start), in the format
 * the flags or the environment ask for: JSON with the fields every line has, so a JSON log stays
 * JSON; null for text, which the runner writes as it always has.
 * @param {"text" | "json"} format
 * @param {string} message
 * @param {{ service: string, version: string, code?: string }} about
 * @returns {string | null}
 */
export function startErrorLine(format, message, { service, version, code = "CONFIG" }) {
    if (format !== "json") {
        return null;
    }
    const msg = plainText(message).slice(0, 500);
    return `${JSON.stringify({ time: new Date().toISOString(), level: "error", severity: SEVERITY.error, event: "error", msg, service, version, message: msg, code })}\n`;
}

/**
 * What the `started` line adds to the version, transport and address: the configured source ids, the
 * log's own settings (logAddress only over HTTP, where there are addresses) and, with static tokens,
 * their names (never a value); ids and names at most SOURCE_LOG_TEXT characters, control characters removed.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ ids(): string[] }} registry
 * @param {{ level: string, format: string, address: string }} log
 * @param {{ http?: boolean }} [how]  http: the server serves HTTP (default true)
 */
export function startFields(options, registry, log, { http = true } = {}) {
    const named = (text) => plainText(String(text)).slice(0, SOURCE_LOG_TEXT);
    const tokens = (options.auth?.mode ?? "none") === "token" ? (options.auth?.tokens?.length ? options.auth.tokens.map((t) => named(t.name)) : ["token"]) : null;
    return { sourceIds: registry.ids().map(named), logLevel: log.level, logFormat: log.format, ...(http ? { logAddress: log.address } : {}), ...(tokens ? { tokens } : {}) };
}

/**
 * Why a request was refused, by the code of its answer: the `reason` of a `refused` line. The token's
 * reasons are told apart by the request (a token in the address, which auth.js bearerOf refuses
 * first: token_in_address; no Authorization header: no_token; one that did not pass: bad_token).
 */
const REFUSAL_REASONS = Object.freeze({
    RATE_LIMITED: "rate_limited",
    BODY_TOO_LARGE: "body_too_large",
    FORBIDDEN_HOST: "host",
    FORBIDDEN_ORIGIN: "origin",
    INSUFFICIENT_SCOPE: "insufficient_scope",
    NOT_ALLOWED: "not_allowed",
    AUTH_NOT_READY: "not_ready",
    BUSY: "busy",
    INVALID_INPUT: "bad_request",
    TOKEN_IN_ADDRESS: "token_in_address",
    METHOD_NOT_ALLOWED: "method_not_allowed",
    NOT_FOUND: "not_found",
    NOT_ACCEPTABLE: "not_acceptable",
    UNSUPPORTED_MEDIA_TYPE: "unsupported_media_type",
    INTERNAL: "internal"
});

/** Every reason a `refused` line may give. */
export const REFUSED_REASONS = Object.freeze(["no_token", "bad_token", ...Object.values(REFUSAL_REASONS)]);

/**
 * The `reason` of a refusal: its answer's code (REST's problem codes; MCP's refusals use the same),
 * INVALID_TOKEN by whether the request carried a token; a code without a reason of its own is its
 * own name in lower case (a test keeps every code the servers refuse with in REFUSED_REASONS).
 * @param {string} code
 * @param {Request | null} [request]
 * @returns {string}
 */
export function refusalReason(code, request = null) {
    if (code === "INVALID_TOKEN") {
        if (request && URL.canParse(request.url) && new URL(request.url).searchParams.has("access_token")) {
            return REFUSAL_REASONS.TOKEN_IN_ADDRESS;
        }
        return (request?.headers.get("authorization") ?? "").trim() ? "bad_token" : "no_token";
    }
    return REFUSAL_REASONS[/** @type {keyof typeof REFUSAL_REASONS} */ (code)] ?? String(code).toLowerCase();
}

/**
 * Resolves once what was written to the stream is out (a pipe's writes are asynchronous on some
 * systems, and process.exit does not wait for them), or after a second for a stream that never says.
 * @param {{ write(text: string, done?: () => void): unknown }} stream
 * @returns {Promise<void>}
 */
export function flushed(stream) {
    return new Promise((resolve) => {
        // a timer that holds the process while it waits (an unref'd one would let it end before the
        // line is out), cleared as soon as the stream says the write is done
        const fallback = setTimeout(resolve, 1000);
        stream.write("", () => {
            clearTimeout(fallback);
            resolve(undefined);
        });
    });
}

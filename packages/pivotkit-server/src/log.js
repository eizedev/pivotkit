/*
 * The log: one JSON line per event on stderr (stdout is the protocol on stdio). A tool call (MCP) or
 * a request (REST) logs its operation, the source (an id, or a file by its base name), the client (a
 * token's name or an OAuth client id), the person only where the operator asked for it (audit.subject:
 * a keyed hash or the claim's text, `subject`), the request's id (requestId: on every line written
 * inside the request, its refusal and error lines too), whether it worked (REST: the status), its
 * error code and its time; a downloaded file is an event of its own. Never a view, a value, a token,
 * a person's groups or other claims, or a full path, and a client's address only where the operator
 * trusts a proxy to name it (http.trustProxy).
 */

import { createHmac } from "node:crypto";

/** The caller's fields a log line may hold; a person's groups, claims or issuer never, the subject only as audit gives it (callerFields). */
export const CALLER_LOG_FIELDS = Object.freeze(["client"]);

/** The most characters of a subject logged as text (audit.subject "plain"). */
export const AUDIT_PLAIN_TEXT = 128;

/** The hex characters of a subject logged as a keyed hash (audit.subject "hash"). */
export const AUDIT_HASH_TEXT = 16;

/**
 * How a log line names a signed-in person, or null for none: "hash", the first AUDIT_HASH_TEXT hex
 * characters of HMAC-SHA256(key, JSON of [issuer, subject]); "plain", the subject without control
 * characters, at most AUDIT_PLAIN_TEXT characters; "off" or no subject, null.
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
    // C0 and C1 controls, and the format characters that turn text around (bidi), never reach a line
    const text = subject.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, AUDIT_PLAIN_TEXT);
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

import { requestId } from "./request-id.js";

/**
 * @param {"info" | "debug" | "off"} level
 * @param {{ write(text: string): unknown }} stream
 */
export function createLog(level, stream) {
    const write = (entry) => {
        if (level !== "off") {
            // every line written inside a request names it (an entry's own requestId wins)
            const id = requestId();
            stream.write(`${JSON.stringify({ time: new Date().toISOString(), ...(id ? { requestId: id } : {}), ...entry })}\n`);
        }
    };
    return {
        level,
        /** A tool call. */
        call: (entry) => write({ event: "call", ...entry }),
        /** A REST request that reached an operation. */
        request: (entry) => write({ event: "request", ...entry }),
        /** A file handed to a REST caller (POST /api/v1/views/render/file). */
        download: (entry) => write({ event: "download", ...entry }),
        /** An HTTP request refused before it reached a tool (Host, Origin, token). */
        refused: (entry) => write({ event: "refused", ...entry }),
        info: (message, extra = {}) => write({ event: "info", message, ...extra }),
        warn: (message, extra = {}) => write({ event: "warning", message, ...extra }),
        /** Only with --log debug: details an operator needs to set up (why a token was refused). */
        debug: (message, extra = {}) => level === "debug" && write({ event: "debug", message, ...extra }),
        /** An unexpected error: its name and message only with --log debug, its stack never. */
        error: (error, extra = {}) => write({ event: "error", ...extra, ...(level === "debug" ? { error: String(error?.message ?? error).slice(0, 500) } : { error: error?.name ?? "Error" }) })
    };
}

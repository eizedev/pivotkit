/*
 * The answer of the file route (POST /views/render/file): the rendered file itself, with a name a
 * browser saves safely and a sandbox for an HTML report. A view with errors is a VIEW_HAS_ERRORS
 * problem with its findings.
 */

import { RENDER_FORMATS } from "pivotkit-report";
import { renderFile } from "../present.js";
import { callerFields } from "../log.js";
import { SAFE_HEADERS } from "./problem.js";

/** The direction controls a name could hide its real extension with ("gnp.exe" shown as "exe.png"). */
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

/** A file's name without a path, a reserved or a control character, at most 80 characters. */
const safeName = (name) =>
    // by code point, so a cut never splits a character in two; a lone surrogate is no character
    [.../** @type {any} */ (String(name ?? "report")).toWellFormed()]
        .slice(0, 80)
        .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || BIDI.test(c) || '\\/:*?"<>|'.includes(c) ? "_" : c))
        .join("") || "report";

/** A file's name for Content-Disposition: its own characters as filename*, a plain ASCII copy as filename. */
function disposition(name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    // RFC 5987: encodeURIComponent leaves ' ( ) * as they are, which attr-char does not allow
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Renders the view and answers with the file, writing the download's log line.
 * @param {any} context  createContext's
 * @param {Record<string, any>} input  the checked input
 * @param {import("../registry.js").Caller} caller
 * @param {{ signal: AbortSignal, upload: any | null, entry: Record<string, unknown>, operation: string, problem: import("./problem.js").Problem }} how  upload: a file sent in a multipart body, or null; entry: the request's log line; problem: the handler's (bound to its docs)
 * @returns {Promise<Response>}
 */
export async function answerFile(context, input, caller, { signal, upload, entry, operation, problem }) {
    const { result, file } = await renderFile(context, input, caller, { signal, ...(upload ? { upload } : {}) });
    if (!file) {
        return problem("VIEW_HAS_ERRORS", "the view has errors; fix them (see findings) and render again", { extra: { findings: result.findings } });
    }
    const format = RENDER_FORMATS[result.format] ?? RENDER_FORMATS.xlsx;
    const name = `${safeName(file.name)}.${format.extension}`;
    context.log.download({ operation, ...callerFields(caller), requestId: entry.requestId, source: entry.source, format: result.format, bytes: file.bytes.length, status: 200 });
    return new Response(/** @type {any} */ (file.bytes), {
        status: 200,
        headers: { ...SAFE_HEADERS, "content-type": format.mediaType, "content-disposition": disposition(name), "content-security-policy": "sandbox; default-src 'none'", "content-length": String(file.bytes.length) }
    });
}

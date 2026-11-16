/*
 * A REST request with its data as a file: a multipart/form-data body on a route whose operation takes
 * a source, with a part `data` (the file: csv, tsv, json or xlsx, its format from the file name's
 * extension, else the part's content type) and an optional part `input` (the operation's input as
 * JSON, whatever its content type says). The input is checked against its own schema
 * (multipartInputSchema): its `data` holds only `name`, `asOf`, `sheet` and `sha256`, the SHA-256 of
 * the file's bytes (hex), which must match; its `source` may be left out and is "inline:" either way.
 * The body is parsed in memory (the caller's body cap bounds it); the file's name is read for its
 * extension only, never used in a path or a header. The file itself is parsed in a worker
 * (sources/inline.js), not here.
 */

import { createHash } from "node:crypto";
import { OperationError, checkInput } from "pivotkit-report/operations";
import { INPUT_DEPTH, jsonDepth, presentedInput } from "../present.js";
import { INLINE_ID, UPLOAD_FORMATS } from "../sources/inline.js";

/** The parts a multipart body may have. */
const PARTS = Object.freeze(["data", "input"]);

/** `input.data` of a multipart body: what the caller says about the file. */
export const MULTIPART_DATA = Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: {
        name: { type: "string", maxLength: 200, description: "What the data is, for the report's title." },
        asOf: { type: "string", maxLength: 40, description: "When the data is from, as you state it (ISO 8601)." },
        sheet: { type: "string", minLength: 1, maxLength: 200, description: "xlsx: the sheet to read (default the first)." },
        sha256: { type: "string", pattern: "^[0-9a-fA-F]{64}$", description: "The SHA-256 of the data part's bytes, in hex: a file that differs is refused." }
    }
});

/**
 * The schema of the `input` part for an operation: its input on REST without a required source, with
 * `data` as MULTIPART_DATA.
 * @param {string} operation
 * @param {import("../sources/input.js").SurfaceOffers} [offers]
 * @param {boolean} [fileRoute]  REST's file route (no `save`)
 */
export function multipartInputSchema(operation, offers, fileRoute = false) {
    const schema = /** @type {any} */ (presentedInput(operation, { files: false, offers, fileRoute }));
    return { ...schema, required: (schema.required ?? []).filter((/** @type {string} */ key) => key !== "source"), properties: { ...schema.properties, data: MULTIPART_DATA } };
}

/**
 * The parts of a multipart body, counted by its boundary lines without parsing it, at most one past
 * PARTS.length (counting stops there); null when the content type names no boundary.
 * @param {Uint8Array} bytes
 * @param {string} contentType
 * @returns {number | null}
 */
export function multipartParts(bytes, contentType) {
    const boundary = /;\s*boundary=(?:"([^"]{1,70})"|([^\s;]{1,70}))/i.exec(contentType);
    if (!boundary) {
        return null;
    }
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
    // each part starts with a delimiter; the last delimiter (with "--") ends the body
    let found = 0;
    for (let at = buffer.indexOf(delimiter); at >= 0 && found <= PARTS.length + 1; at = buffer.indexOf(delimiter, at + delimiter.length)) {
        found++;
    }
    return Math.max(0, found - 1);
}

/** A REST problem other than an operation's error (handler.js answers it). */
const problemError = (code, detail) => Object.assign(new Error(detail), { problem: code, detail });

/** The format of the file of a `data` part: by its name's extension, else by its content type; null when neither is read. */
export function uploadFormatOf(file) {
    const extension = /\.([a-z0-9]{1,8})$/i.exec(String(file.name ?? ""))?.[1]?.toLowerCase();
    if (extension && Object.hasOwn(UPLOAD_FORMATS, extension)) {
        return extension;
    }
    const type = String(file.type ?? "").split(";")[0].trim().toLowerCase();
    return Object.entries(UPLOAD_FORMATS).find(([, types]) => types.includes(type))?.[0] ?? null;
}

/**
 * A multipart body as the operation's input and the file it carries. Throws OperationError
 * (INVALID_INPUT, DATA_MISMATCH) or an error with `problem` UNSUPPORTED_MEDIA_TYPE.
 * @param {Uint8Array} bytes  the body, read under the caller's cap
 * @param {string} contentType  the request's Content-Type, with its boundary
 * @param {string} operation
 * @param {import("../sources/input.js").SurfaceOffers} [offers]
 * @param {boolean} [fileRoute]  REST's file route (no `save`)
 * @returns {Promise<{ input: Record<string, any>, upload: { bytes: Uint8Array, format: string, sheet?: string, name?: string, asOf?: string } }>}
 */
export async function readMultipart(bytes, contentType, operation, offers, fileRoute = false) {
    // counted before the parts are parsed: thousands of small parts cost the parser
    const parts = multipartParts(bytes, contentType);
    if (parts === null) {
        throw new OperationError("INVALID_INPUT", "a multipart body names its boundary in Content-Type (multipart/form-data; boundary=...)");
    }
    if (parts > PARTS.length) {
        throw new OperationError("INVALID_INPUT", "a multipart body has at most two parts: data (the file) and input (the operation's input as JSON)");
    }
    let form;
    try {
        form = await new Response(/** @type {any} */ (bytes), { headers: { "content-type": contentType } }).formData();
    } catch {
        throw new OperationError("INVALID_INPUT", "the multipart body cannot be read");
    }
    const entries = [...form.entries()];
    if (entries.length > PARTS.length) {
        throw new OperationError("INVALID_INPUT", "a multipart body has at most two parts: data (the file) and input (the operation's input as JSON)");
    }
    const names = entries.map(([name]) => name);
    const unknown = names.find((name) => !PARTS.includes(name));
    if (unknown !== undefined) {
        throw new OperationError("INVALID_INPUT", `a multipart body has no part "${unknown.slice(0, 40)}": its parts are data (the file) and input (the operation's input as JSON)`);
    }
    if (new Set(names).size !== names.length) {
        throw new OperationError("INVALID_INPUT", "a multipart body has each part once: data (the file) and input");
    }
    const file = form.get("data");
    if (file === null) {
        throw new OperationError("INVALID_INPUT", "a multipart body needs a part data: the file (csv, tsv, json or xlsx)");
    }
    if (typeof file === "string") {
        throw new OperationError("INVALID_INPUT", "the part data is a file: send it with a file name (curl -F data=@sales.csv)");
    }
    const format = uploadFormatOf(file);
    if (!format) {
        throw problemError("UNSUPPORTED_MEDIA_TYPE", "the part data is read as csv, tsv, json or xlsx: give its file name that extension, or the part that content type");
    }
    const part = form.get("input");
    /** @type {any} */
    let input = {};
    if (part !== null) {
        const text = typeof part === "string" ? part : await part.text();
        if (jsonDepth(text, INPUT_DEPTH) > INPUT_DEPTH) {
            throw new OperationError("INVALID_INPUT", `the part input is nested deeper than ${INPUT_DEPTH} levels`);
        }
        try {
            input = text.trim() ? JSON.parse(text) : {};
        } catch {
            throw new OperationError("INVALID_INPUT", "the part input is not valid JSON");
        }
        if (input === null || typeof input !== "object" || Array.isArray(input)) {
            throw new OperationError("INVALID_INPUT", "the part input is a JSON object: the operation's input without data");
        }
    }
    checkInput(multipartInputSchema(operation, offers, fileRoute), input);
    if (input.source !== undefined && input.source !== INLINE_ID) {
        throw new OperationError("INVALID_INPUT", `a multipart body's source is the file it carries: leave source out or give "${INLINE_ID}"`);
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const meta = input.data ?? {};
    if (meta.sha256 !== undefined && createHash("sha256").update(data).digest("hex") !== meta.sha256.toLowerCase()) {
        throw new OperationError("DATA_MISMATCH", "the SHA-256 of the part data differs from input.data.sha256: the file changed or was cut on the way; send it again");
    }
    const rest = { ...input };
    delete rest.data;
    return {
        input: { ...rest, source: INLINE_ID },
        upload: { bytes: data, format, ...(meta.sheet ? { sheet: meta.sheet } : {}), ...(meta.name !== undefined ? { name: meta.name } : {}), ...(meta.asOf !== undefined ? { asOf: meta.asOf } : {}) }
    };
}

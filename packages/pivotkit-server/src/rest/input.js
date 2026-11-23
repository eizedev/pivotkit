/*
 * A REST request's input: read from its body (JSON, or a file with its input as multipart/form-data)
 * or its path, then checked in the order whose refusal says most, before the operation runs.
 */

import { OperationError, checkInput } from "pivotkit-report/operations";
import { BODY_BYTES } from "../listen.js";
import { presentedInput } from "../present.js";
import { bodyTooLargeText, restBodyBytesFor } from "../limits.js";
import { INLINE_ID, checkTableSize, dataRefusal, maySendData, restDataOffered } from "../sources/inline.js";
import { checkParamsOffered } from "../sources/input.js";
import { BodyError, readBytes, readJson } from "./body.js";
import { readMultipart } from "./multipart.js";

/**
 * A request's input: a POST's body (JSON, or for a route that takes a source and a caller that may
 * send data, multipart/form-data with a file), a GET's source id from the path, else none.
 * @param {any} context
 * @param {import("./match.js").RouteMatch} match
 * @param {Request} request
 * @param {import("../registry.js").Caller} caller
 * @returns {Promise<{ input: Record<string, any>, upload: Awaited<ReturnType<typeof readMultipart>>["upload"] | null }>}  upload: a file sent in a multipart body
 */
export async function readInput(context, { route, params }, request, caller) {
    const options = context.options;
    /** @type {any} */
    let input = {};
    let upload = null;
    if (route.method === "POST") {
        const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        const cap = route.takesSource ? restBodyBytesFor(options, caller) : BODY_BYTES;
        const detail = bodyTooLargeText(options, cap);
        if (type === "multipart/form-data" && route.takesSource) {
            if (!maySendData(options, caller, "rest")) {
                throw dataRefusal("rest", { offered: restDataOffered(options) });
            }
            ({ input, upload } = await readMultipart(await readBytes(request, cap, detail), request.headers.get("content-type") ?? "", route.operation, context.offers?.rest, route.answer === "file"));
        } else if (type !== "application/json") {
            throw new BodyError("UNSUPPORTED_MEDIA_TYPE", `send the input as JSON (Content-Type: application/json)${route.takesSource && maySendData(options, caller, "rest") ? ", or a file with it as multipart/form-data" : ""}`);
        } else {
            input = await readJson(request, cap, detail);
        }
    } else if (params?.id !== undefined) {
        try {
            input = { source: decodeURIComponent(params.id) };
        } catch {
            throw new OperationError("INVALID_INPUT", "the source id is not a valid address part");
        }
    }
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new OperationError("INVALID_INPUT", "the body must be a JSON object");
    }
    return { input, upload };
}

/**
 * The checks of an operation's input, in the order whose refusal says most: no file path, data only
 * from a caller that may send it, a table's size before its cells, the params on offer, the schema.
 * A multipart body's input was checked against its own schema (multipart.js).
 * @param {any} context
 * @param {any} route
 * @param {Record<string, any>} input
 * @param {import("../registry.js").Caller} caller
 * @param {unknown} upload
 */
export function checkOperationInput(context, route, input, caller, upload) {
    const options = context.options;
    // before the schema's pattern says the same in fewer words
    if (typeof input.source === "string" && input.source.startsWith("file:")) {
        throw new OperationError("FILES_NOT_ALLOWED", "this service reads no files by path: use a source id from GET /sources");
    }
    // a caller that may not send data is refused as such, before the schema (which offers no
    // data on a server that offers it to nobody) answers with a key it does not know
    if (input.source === INLINE_ID && !maySendData(options, caller, "rest")) {
        throw dataRefusal("rest", { offered: restDataOffered(options) });
    }
    if (upload) {
        return;
    }
    // a table too large is refused by its size, before the schema goes through its cells
    if (input.source === INLINE_ID) {
        checkTableSize(input.data, { limits: context.registry.limits });
    }
    checkParamsOffered(route.operation, input, context.offers?.rest);
    checkInput(presentedInput(route.operation, { files: false, offers: context.offers?.rest, fileRoute: route.answer === "file" }), input);
}

/**
 * GET /sources/{id} of a source whose params are missing: the route takes none, so the refusal
 * names the one that does.
 * @param {unknown} e
 * @param {string} id
 */
export function withDescribeHint(e, id) {
    if (!(e instanceof OperationError) || e.code !== "INVALID_INPUT" || !/ needs params\./.test(e.message)) {
        return e;
    }
    return new OperationError("INVALID_INPUT", `${e.message}. GET /sources/{id} takes no params: send them with POST /sources/describe, {"source": ${JSON.stringify(id)}, "params": {...}}`, e.details);
}

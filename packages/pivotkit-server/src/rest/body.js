/*
 * A REST request's body: read while it streams, capped before it is parsed. A body the service
 * cannot take is a BodyError, which the handler answers as a problem of its code.
 */

import { CodedError } from "pivotkit-core/internal";
import { OperationError } from "pivotkit-report/operations";
import { INPUT_DEPTH, jsonDepth } from "../input-depth.js";

/**
 * A body the REST service does not take: its code is a REST problem's (pivotkit-node/rest
 * REST_ERRORS), its message the problem's detail, written to be shown.
 * @extends {CodedError<"BODY_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE", undefined>}
 */
export class BodyError extends CodedError {
    /**
     * @param {"BODY_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE"} code
     * @param {string} detail
     */
    constructor(code, detail) {
        super(code, detail);
        this.name = "BodyError";
    }
}

/**
 * Reads a body, at most `max` bytes, while it streams.
 * @param {Request} request
 * @param {number} max
 * @param {string} detail  what a body over it is told
 */
export async function readBytes(request, max, detail) {
    if (Number(request.headers.get("content-length") ?? 0) > max) {
        throw new BodyError("BODY_TOO_LARGE", detail);
    }
    const chunks = [];
    let size = 0;
    if (request.body) {
        const reader = request.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            size += value.length;
            if (size > max) {
                await reader.cancel().catch(() => undefined);
                throw new BodyError("BODY_TOO_LARGE", detail);
            }
            chunks.push(value);
        }
    }
    return Buffer.concat(chunks);
}

/**
 * Reads a JSON body, at most `max` bytes, while it streams. Its nesting is counted on the bytes before
 * it is parsed: JSON.parse of a body of millions of brackets would hold the thread and gigabytes.
 * An empty body is an empty object.
 * @param {Request} request
 * @param {number} max
 * @param {string} detail  what a body over `max` is told
 */
export async function readJson(request, max, detail) {
    const bytes = await readBytes(request, max, detail);
    if (jsonDepth(bytes, INPUT_DEPTH) > INPUT_DEPTH) {
        throw new OperationError("INVALID_INPUT", `the input is nested deeper than ${INPUT_DEPTH} levels`);
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!text.trim()) {
        return {};
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new OperationError("INVALID_INPUT", "the body is not valid JSON");
    }
}

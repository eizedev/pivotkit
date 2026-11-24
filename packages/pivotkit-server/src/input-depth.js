/*
 * How deep an input may nest, and the one count of a JSON text's depth: a request's body (rest/body.js,
 * rest/multipart.js), an operation's input (present.js, records.js) and an HTTP source's answer
 * (sources/http.js). One place, because each guards the same limit against a stack overflow.
 */

import { OperationError } from "pivotkit-report/operations";

/**
 * How deep an input may nest (objects and arrays, also inside a view given as JSON text). A view is a
 * few levels deep; far deeper input would overflow a stack somewhere between here and the worker,
 * at a depth that differs by platform, so it is refused here, before anything else, at a fixed one.
 */
export const INPUT_DEPTH = 64;

/**
 * The deepest nesting of an input (counted without recursion), and of the JSON text a string holds
 * (a view or a layout given as text). The strings of `data` (a table sent in the request) are values,
 * never JSON: a cell of brackets is data, so only its structure counts.
 */
function depthOf(value) {
    let deepest = 0;
    /** @type {Array<[unknown, number, boolean]>} the node, its depth, whether its strings may be JSON text */
    const stack = [[value, 0, true]];
    while (stack.length) {
        const [node, depth, text] = /** @type {[unknown, number, boolean]} */ (stack.pop());
        if (typeof node === "string") {
            deepest = text ? Math.max(deepest, depth + jsonDepth(node, INPUT_DEPTH)) : deepest;
        } else if (node && typeof node === "object") {
            deepest = Math.max(deepest, depth + 1);
            if (deepest > INPUT_DEPTH) {
                return deepest;
            }
            for (const [key, child] of Object.entries(node)) {
                stack.push([child, depth + 1, text && !(depth === 0 && key === "data")]);
            }
        }
    }
    return deepest;
}

/** The character codes of a JSON text's quote, backslash and brackets (one byte each in UTF-8). */
const QUOTE = 34;
const BACKSLASH = 92;
const OPEN = new Set([91, 123]);
const CLOSE = new Set([93, 125]);

/**
 * The deepest bracket nesting of a JSON text, outside its strings, counted without parsing it: a text
 * or its UTF-8 bytes (a request's body, before JSON.parse is given it), linear, no allocation. Stops at
 * the first level over `max` and says that level.
 * @param {string | Uint8Array} text
 * @param {number} [max]
 * @returns {number}
 */
export function jsonDepth(text, max = Infinity) {
    const code = typeof text === "string" ? (i) => text.charCodeAt(i) : (i) => text[i];
    let depth = 0;
    let deepest = 0;
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const c = code(i);
        if (inString) {
            if (c === BACKSLASH) {
                i++;
            } else if (c === QUOTE) {
                inString = false;
            }
        } else if (c === QUOTE) {
            inString = true;
        } else if (OPEN.has(c)) {
            deepest = Math.max(deepest, ++depth);
            if (deepest > max) {
                return deepest;
            }
        } else if (CLOSE.has(c)) {
            depth--;
        }
    }
    return deepest;
}

/** Refuses an input nested deeper than INPUT_DEPTH. */
export function checkDepth(input) {
    if (depthOf(input) > INPUT_DEPTH) {
        throw new OperationError("INVALID_INPUT", `the input is nested deeper than ${INPUT_DEPTH} levels`);
    }
}

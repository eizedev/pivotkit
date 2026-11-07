/*
 * Inflating raw DEFLATE bytes with a cap that holds while inflating (pivotkit-core/link): internal.
 */

import { Inflate } from "fflate";

/** Compressed bytes given to the inflater at a time: one slice inflates to at most about 1 MB (DEFLATE's ratio is at most 1032:1). */
const SLICE = 1024;

/**
 * Raw DEFLATE bytes inflated up to `max` bytes. Stops at the first slice of input whose output
 * passes `max`, so neither the memory nor the work grows with what the bytes would inflate to.
 * Throws on damaged data.
 * @param {Uint8Array} bytes
 * @param {number} max
 * @returns {{ bytes: Uint8Array | null, inflated: number }}  `bytes` null when larger than max;
 *   `inflated`: the bytes produced before it stopped
 */
export function inflateCapped(bytes, max) {
    /** @type {Uint8Array[]} */
    const chunks = [];
    let inflated = 0;
    let over = false;
    let done = false;
    const inflater = new Inflate((chunk, final) => {
        inflated += chunk.length;
        if (inflated > max) {
            over = true;
        } else {
            chunks.push(chunk);
        }
        done = done || final;
    });
    for (let i = 0; i < bytes.length && !over; i += SLICE) {
        inflater.push(bytes.subarray(i, i + SLICE), i + SLICE >= bytes.length);
    }
    if (over) {
        return { bytes: null, inflated };
    }
    if (!done) {
        throw new Error("unexpected end of data");
    }
    const out = new Uint8Array(inflated);
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.length;
    }
    return { bytes: out, inflated };
}

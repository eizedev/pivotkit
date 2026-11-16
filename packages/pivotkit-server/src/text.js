/*
 * Small text helpers the server's modules share: a number of bytes in KiB or MiB, and a count with
 * its noun in the singular or the plural.
 */

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

/**
 * "1 day", "30 days": a count with its noun, which takes an "s" in the plural.
 * @param {number} n
 * @param {string} noun  in the singular
 */
export const countText = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

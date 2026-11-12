/*
 * "Did you mean": the closest of a list of names to a name that matched none, for the hints of
 * normalize() and validate() (an unknown field, an item spelled in another case). Bounded: at most
 * HINT_LIMITS.candidates names are looked at, names longer than HINT_LIMITS.length are skipped, and
 * the edit distance stops at HINT_LIMITS.distance, so a hint never costs more than a few thousand
 * steps per name, whatever the view or the data hold.
 */

import { foldText } from "./text-match.js";

export const HINT_LIMITS = Object.freeze({ candidates: 1_000, length: 64, distance: 3 });

/**
 * The edit distance of two texts (insert, delete or replace one character, or swap two neighbours:
 * "lable" is one edit from "label"), or `max + 1` as soon as it is known to exceed `max`.
 * @param {string} a
 * @param {string} b
 * @param {number} max
 */
function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) {
        return max + 1;
    }
    let before = /** @type {number[]} */ ([]);
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    let prevBest = 0;
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let best = i;
        for (let j = 1; j <= b.length; j++) {
            let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d = Math.min(d, before[j - 2] + 1);
            }
            row.push(d);
            best = Math.min(best, d);
        }
        // a swap reaches back two rows: stop only when neither of the last two can lead within max
        if (best > max && prevBest >= max) {
            return max + 1;
        }
        prevBest = best;
        before = prev;
        prev = row;
    }
    return prev[b.length];
}

/**
 * The name of `candidates` closest to `name` as text filters fold text (case and whitespace do not
 * count), within an edit distance of a third of its length (at least 1, at most
 * HINT_LIMITS.distance); null when none is that close. A name that folds to the same text wins.
 * @param {unknown} name
 * @param {Iterable<string>} candidates
 * @returns {string | null}
 */
export function closest(name, candidates) {
    if (typeof name !== "string" || name.length > HINT_LIMITS.length) {
        return null;
    }
    const target = foldText(name);
    if (target === "") {
        return null;
    }
    const max = Math.min(HINT_LIMITS.distance, Math.max(1, Math.floor(target.length / 3)));
    let best = null;
    let bestDistance = max + 1;
    let looked = 0;
    for (const candidate of candidates) {
        if (looked++ >= HINT_LIMITS.candidates) {
            break;
        }
        if (typeof candidate !== "string" || candidate.length > HINT_LIMITS.length) {
            continue;
        }
        const d = distance(target, foldText(candidate), Math.min(max, bestDistance - 1));
        if (d < bestDistance) {
            best = candidate;
            bestDistance = d;
            if (d === 0) {
                break;
            }
        }
    }
    return best;
}

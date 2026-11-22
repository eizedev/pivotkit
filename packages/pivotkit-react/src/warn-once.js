/*
 * A developer's mistake (a prop with a value the report does not know, a tips table that did not
 * load) said in the console once per page, however many reports or renders meet it.
 */

/** What the console was told already. */
const warned = new Set();

/** @param {string} text */
export function warnOnce(text) {
    if (!warned.has(text)) {
        warned.add(text);
        console.warn(text);
    }
}

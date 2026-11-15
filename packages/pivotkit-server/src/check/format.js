/*
 * check-config's layout, shared by every section (check/<feature>.js): a section says what it found
 * as items, and render() puts them on the page the same way for all of them.
 *
 *   pivotkit-server: the server starts, but not everything will work.
 *   1 problem, 1 warning.
 *
 *   PROBLEM: httpSources.backends.platform.auth.clientCredentials.clientSecret:
 *       the file secrets/backend-secret cannot be read (no such file) -> the
 *       server starts; vms answers SOURCE_UNAVAILABLE
 *
 *   WARNING (Sources): sources.sales.policy.fields.Custmer: no column of
 *       sales.csv has this name; did you mean "Customer"?
 *
 *   Sources (2):
 *     sales:
 *         /srv/pivotkit/data/a-long-folder-name/and-another-one/sales-2026.csv
 *     ...
 *
 *   New in this version: data in the request (inline:; mcp.data: false switches
 *       it off)
 *       -> https://pivotkit.eize.dev/getting-started/upgrading/
 *
 * Three markers: PROBLEM (counted; keeps the server from starting, or a source or feature from
 * working, and says which), WARNING (counted, not an error) and plain. The verdict and the counts
 * come first, then every PROBLEM line, then every WARNING line named by its heading, then the
 * sections in their order with their facts, a blank line before each heading. One fact per line,
 * wrapped at WIDTH columns at spaces; a word longer than a line (a path) stands alone on its line.
 * A fact under another is two spaces further in; a wrapped line goes on four spaces further in, so
 * the two are never confused.
 */

import { pathOf } from "../config.js";

/** The width check-config wraps its lines at. */
export const WIDTH = 78;

/**
 * @typedef {{ kind: "heading", text: string, label?: string }
 *   | { kind: "plain", text: string, depth: number }
 *   | { kind: "warning", text: string }
 *   | { kind: "problem", text: string, stops: boolean, effect: string | null }} Item
 */

/**
 * A section's heading ("Sources (2):", "Auth: oauth"), at the left margin. `label`: the name its
 * warnings carry when it is not the heading's own (where the operator looks for them).
 * @param {string} text
 * @param {string} [label]
 */
export const heading = (text, label) => /** @type {Item} */ ({ kind: "heading", text, ...(label ? { label } : {}) });

/** A fact, under its heading (depth 1) or under another fact (depth 2, 3). */
export const plain = (text, depth = 1) => /** @type {Item} */ ({ kind: "plain", text, depth });

/** A warning: something to look at; the server works as configured. */
export const warning = (text) => /** @type {Item} */ ({ kind: "warning", text });

/**
 * A problem. `stops`: the server does not start (createContext refuses it); otherwise `effect` says
 * what does not work while the server runs ("the server starts; vms answers SOURCE_UNAVAILABLE").
 * @param {string} text
 * @param {{ stops: true } | { stops?: false, effect: string }} how
 */
export const problem = (text, how) => /** @type {Item} */ ({ kind: "problem", text, stops: how.stops === true, effect: how.stops === true ? null : /** @type {any} */ (how).effect });

/**
 * A text cut into lines of at most `width` columns at spaces: the first line starts at `indent`, the
 * others at `hang`. A word longer than a line (an address, a path) stays whole, on a line of its
 * own.
 * @param {string} text
 * @param {number} indent
 * @param {number} [hang]
 * @param {number} [width]
 * @returns {string[]}
 */
export function wrap(text, indent, hang = indent + 4, width = WIDTH) {
    const out = [];
    let line = " ".repeat(indent);
    let empty = true;
    for (const word of text.split(" ")) {
        // a word that does not fit starts a new line; one longer than any line (a path, an address)
        // stands alone on its own, never cut
        if (!empty && line.length + 1 + word.length > width) {
            out.push(line);
            line = " ".repeat(hang) + word;
            continue;
        }
        line += empty ? word : ` ${word}`;
        empty = false;
    }
    out.push(line);
    return out;
}

/** A file the configuration names (a secret, a token) as check-config prints it: the path as written and, where it differs, the full one. */
export const fileText = (options, file) => {
    const full = pathOf(options, file);
    return full === file ? file : `${file} (${full})`;
};

/**
 * A section's items cut into blocks, one per heading (a section may print two: Delivery: and
 * Retention:), without its problems (printed first); a block holds nothing but a heading's facts and
 * warnings, so a warning stays under its own heading.
 * @param {Item[]} items
 * @returns {Item[][]}
 */
function blocksOf(items) {
    const blocks = [];
    for (const item of items) {
        if (item.kind === "problem") {
            continue;
        }
        if (item.kind === "heading" || !blocks.length) {
            blocks.push([]);
        }
        blocks[blocks.length - 1].push(item);
    }
    return blocks;
}

/** Where a secret comes from, as check-config names it (never its value): $NAME, or the file as written and its full path. */
export const secretText = (options, ref) => (ref.env ? `$${ref.env}` : `the file ${fileText(options, /** @type {string} */ (ref.file))}`);

/** Up to six ids, then how many more. */
export const idsText = (ids) => (ids.length > 6 ? `${ids.slice(0, 6).join(", ")} and ${ids.length - 6} more` : ids.join(", "));

/** A block's heading as a warning names it: "Sources (2):" -> Sources, "Auth: oauth" -> Auth. */
const headingName = (item) => (item?.kind === "heading" ? (item.label ?? /^([^:(]+?)\s*[:(]/.exec(item.text)?.[1] ?? item.text) : "check-config");

/** "1 problem", "2 warnings". */
const count = (n, what) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** A problem's line: its text, then what it does. */
const problemText = (item) => `PROBLEM: ${item.text} -> ${item.stops ? "the server does not start" : item.effect}`;

/**
 * The page: the verdict, the counts, the PROBLEM lines, the sections, and the one line of what is new
 * in this version.
 * @param {string} name  the program ("pivotkit-server", "pivotkit-mcp")
 * @param {Item[][]} sections  each section's items, in the order printed
 * @param {string[]} upgrade  short names of this version's changes that apply
 * @param {string} upgradingUrl
 * @returns {{ text: string, problems: number, warnings: number, stops: number }}
 */
export function render(name, sections, upgrade, upgradingUrl) {
    const all = sections.flat();
    const problems = all.filter((i) => i.kind === "problem");
    const warnings = all.filter((i) => i.kind === "warning").length;
    const stops = problems.filter((i) => /** @type {any} */ (i).stops).length;
    // one line a script can read: the server starts or not (any problem exits with 1 all the same)
    const verdict = stops ? "the server does not start with this configuration." : problems.length ? "the server starts, but not everything will work." : "the configuration is valid.";
    const lines = [...wrap(`${name}: ${verdict}`, 0), `${count(problems.length, "problem")}, ${count(warnings, "warning")}.`];
    if (problems.length) {
        // the ones that stop the start first
        lines.push("", ...[...problems].sort((a, b) => Number(/** @type {any} */ (b).stops) - Number(/** @type {any} */ (a).stops)).flatMap((p) => wrap(problemText(p), 0)));
    }
    // every warning next, named by the heading it belongs to, so none is missed deep in a section
    const blocks = sections.flatMap(blocksOf);
    const warned = blocks.flatMap((block) => block.filter((i) => i.kind === "warning").map((i) => `WARNING (${headingName(block[0])}): ${i.text}`));
    if (warned.length) {
        lines.push("", ...warned.flatMap((text) => wrap(text, 0)));
    }
    for (const block of blocks) {
        const facts = block.filter((i) => i.kind !== "warning");
        if (!facts.length) {
            continue;
        }
        lines.push("");
        for (const item of facts) {
            lines.push(...wrap(item.text, item.kind === "plain" ? 2 * item.depth : 0));
        }
    }
    if (upgrade.length) {
        lines.push("", ...wrap(`New in this version: ${upgrade.join(", ")}`, 0), `    -> ${upgradingUrl}`);
    }
    return { text: `${lines.join("\n")}\n`, problems: problems.length, warnings, stops };
}

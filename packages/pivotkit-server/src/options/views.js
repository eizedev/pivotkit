/*
 * The options of named views (views.js): views an operator publishes per source, by name, for
 * render_view, create_link and draft_schedule.
 *
 *   "sources": { "sales": {
 *       "views": { "by-region": "views/by-region.pivotkit.json", "top-5": { "rows": ["Region"], ... } },
 *       "viewsDir": "views/sales"
 *   } }
 *
 * `views` maps a name to a view file's path (relative to the configuration file) or to a view written
 * in place: a view file, a template ({ name, view }) or a bare view. `viewsDir` is a folder of view
 * files; each file's name without ".pivotkit.json" or ".json" is its view's name. Both are read on
 * every request, as a print template is; the start and check-config check them first.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses a
 * second declaration).
 */

import { fromViewFile } from "pivotkit-core";

export const NAME = "views";

/** A view's name: what a caller passes as `view`. It can never be JSON text of a view. */
export const VIEW_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/** The most views a source publishes, in the configuration and its folder together. */
export const MAX_VIEWS = 100;

/** The largest view file, and the largest view written in the configuration, in bytes (limits.view in messages). */
export const VIEW_BYTES = 262_144;

/** What is wrong with a view written in place, or null: too large, or no view. */
export function inlineViewProblem(value) {
    const text = JSON.stringify(value);
    if (text.length > VIEW_BYTES) {
        return `${text.length.toLocaleString("en-US")} characters exceed the limit of ${VIEW_BYTES.toLocaleString("en-US")} (limits.view)`;
    }
    const read = fromViewFile(value);
    return read.failed ? `not a view (${read.issues.at(-1)?.message ?? read.failed})` : null;
}

/** What is wrong with sources.<id>.views, each "<name>: <what>". */
function viewsProblems(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return ["must be an object of view names, each a view file's path or a view"];
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_VIEWS) {
        return [`has ${entries.length} views; at most ${MAX_VIEWS}`];
    }
    const problems = [];
    for (const [name, entry] of entries) {
        if (!VIEW_NAME.test(name)) {
            problems.push(`${JSON.stringify(name.slice(0, 80))} is no view name: letters, digits, - and _, at most 80, starting with a letter or digit`);
        } else if (typeof entry === "string" ? entry === "" : entry === null || typeof entry !== "object" || Array.isArray(entry)) {
            problems.push(`${name}: must be a view file's path or a view`);
        } else if (typeof entry === "object") {
            const problem = inlineViewProblem(entry);
            if (problem) {
                problems.push(`${name}: ${problem}`);
            }
        }
    }
    return problems;
}

export const KEYS = Object.freeze({ source: { views: { custom: viewsProblems }, viewsDir: "string" } });

/** The schema says it all; the files are checked at start (context.js) and by check-config. */
export function validate() {}

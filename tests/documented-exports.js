// The check that every export of a public entry point is named on a reference page of the docs
// (docs/versioning.md: every JS export is public interface). Each package's api test calls it with
// its entry points. A name counts as named when it stands in code font: `name`, `name(`, `name.` or
// `name,` on any page of docs/reference/.
import { readFileSync, readdirSync } from "node:fs";

const REFERENCE = new URL("../docs/reference/", import.meta.url);

/** The text of every reference page, once per process. */
let text;

/**
 * The exports of `entries` that no reference page names, as "entry: name".
 * @param {Record<string, object>} entries  entry point name, its module namespace
 * @returns {string[]}
 */
export function undocumentedExports(entries) {
    text ??= readdirSync(REFERENCE).filter((f) => f.endsWith(".md")).map((f) => readFileSync(new URL(f, REFERENCE), "utf8")).join("\n");
    return Object.entries(entries).flatMap(([entry, mod]) => Object.keys(mod).filter((name) => !new RegExp(`\`${name}[\`(.,]`).test(text)).map((name) => `${entry}: ${name}`));
}

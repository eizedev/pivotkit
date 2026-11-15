/*
 * pivotkit example: the example files this package ships (examples/, built by the repository's
 * scripts/examples.js from the playground's data: the data as the report's Export → Source data writes
 * it, the views as Views → Download view writes them), listed from examples/examples.json and
 * written into a directory, never over a file there. A CSV is shipped gzipped and written unpacked.
 */

import { lstat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { CliError, printable } from "./errors.js";
import { writeSafe } from "./safe-files.js";

const DIR = new URL("../examples/", import.meta.url);

/**
 * @typedef {object} Example
 * @property {string} name
 * @property {string} text  one line: what it holds
 * @property {string[]} files  the files it writes
 * @property {string} data  its data file
 * @property {string} view  its first view file
 * @property {Record<string, string>} about  what each file is
 * @property {boolean} [default]  written by `pivotkit example` without a name
 * @property {string} [credit]  the attribution its data's licence asks for
 * @property {string} [uses]  the example whose data and view it renders (`data`, `view` are that one's)
 * @property {string[]} [templates]  its print templates, rendered with --template
 */

/** @type {Example[] | null} */
let list = null;

/** The examples of examples/examples.json. */
export function examples() {
    list ??= /** @type {{ examples: Example[] }} */ (JSON.parse(readFileSync(new URL("examples.json", DIR), "utf8"))).examples;
    return list;
}

/** The examples' names (for the completions). */
export const exampleNames = () => examples().map((e) => e.name);

/** What to run on an example's files: its first view as a report, or its first print template over its view. */
export const tryLine = (e) => (e.templates?.length ? templateLine(e, e.templates[0]) : `pivotkit render ${e.view} --data ${e.data} -o ${e.view.replace(/\.pivotkit\.json$/, "")}.html`);

/** A print template of an example rendered over its view: <name>.template.html writes <name>-report.html. */
export const templateLine = (e, template) => `pivotkit render ${e.view} --data ${e.data} --template ${template} -o ${template.replace(/(\.template)?\.html$/, "")}-report.html`;

/** A shipped file's bytes: <name>, or <name>.gz unpacked. */
function shipped(name) {
    try {
        return readFileSync(new URL(name, DIR));
    } catch {
        try {
            return gunzipSync(readFileSync(new URL(`${name}.gz`, DIR)));
        } catch {
            throw new CliError("internal", "EXAMPLE_MISSING", `the example file ${printable(name)} is missing from this installation of pivotkit-cli (in its repository: npm run build -w pivotkit-cli)`);
        }
    }
}

/**
 * Writes an example's files into `cwd`: refused, with nothing written, when one of them is there.
 * @param {Example} example
 * @param {{ cwd: string, allow: string[] }} where
 * @returns {Promise<string[]>}  the files written
 */
export async function writeExample(example, { cwd, allow }) {
    const there = [];
    for (const name of example.files) {
        try {
            await lstat(resolve(cwd, name));
            there.push(name);
        } catch {
            // not there: it may be written
        }
    }
    if (there.length) {
        throw new CliError("io", "EXISTS", `${there.map(printable).join(", ")} ${there.length === 1 ? "is" : "are"} already here; nothing written (pivotkit example never replaces a file: run it in another directory)`);
    }
    // every file read before the first is written: a missing one writes nothing
    const bodies = example.files.map((name) => ({ name, body: shipped(name) }));
    // linked into place: a file that appeared since the check is never replaced
    for (const { name, body } of bodies) {
        await writeSafe(name, body, { cwd, allow, exclusive: true });
    }
    return example.files;
}

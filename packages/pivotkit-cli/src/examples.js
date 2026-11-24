/*
 * pivotkit example: the example files this package ships (examples/, built by the repository's
 * scripts/examples.js from the playground's data: the data as the report's Export → Source data writes
 * it, the views as Views → Download view writes them), listed from examples/examples.json and
 * written into a directory, never over a file there. A CSV is shipped gzipped and written unpacked.
 * `pivotkit example [name]` writes one and says what each file is and what to run next; --list names
 * them all.
 */

import { lstat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { CliError, printable, writeSafe } from "pivotkit-node/files";
import { didYouMean } from "./options.js";

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
function examples() {
    list ??= /** @type {{ examples: Example[] }} */ (JSON.parse(readFileSync(new URL("examples.json", DIR), "utf8"))).examples;
    return list;
}

/** The examples' names (for the completions). */
export const exampleNames = () => examples().map((e) => e.name);

/** What to run on an example's files: its first view as a report, or its first print template over its view. */
const tryLine = (e) => (e.templates?.length ? templateLine(e, e.templates[0]) : `pivotkit render ${e.view} --data ${e.data} -o ${e.view.replace(/\.pivotkit\.json$/, "")}.html`);

/** A print template of an example rendered over its view: <name>.template.html writes <name>-report.html. */
const templateLine = (e, template) => `pivotkit render ${e.view} --data ${e.data} --template ${template} -o ${template.replace(/(\.template)?\.html$/, "")}-report.html`;

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
async function writeExample(example, { cwd, allow }) {
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

/**
 * pivotkit example [name] [--list]: the example's files written into the working directory (the
 * default example without a name), what each one is and what to run next (stderr); --list names them
 * all (stdout) and writes nothing.
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
export async function exampleCommand(positionals, values, ctx) {
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `example takes one name, not ${positionals.length}`);
    }
    const all = examples();
    if (values.list && positionals.length) {
        throw new CliError("usage", "EXTRA_ARGUMENT", "--list writes nothing: give it without a name");
    }
    if (values.list) {
        return listExamples(all, values, ctx);
    }
    const name = positionals[0] ?? all.find((e) => e.default)?.name ?? all[0].name;
    const example = all.find((e) => e.name === name);
    if (!example) {
        throw new CliError("usage", "UNKNOWN_EXAMPLE", `no example ${printable(JSON.stringify(name))}${didYouMean(name, all.map((e) => e.name))}; run "pivotkit example --list"`);
    }
    const written = await writeExample(example, { cwd: ctx.io.cwd, allow: ctx.allow });
    const steps = nextSteps(example);
    const width = Math.max(...written.map((f) => f.length));
    const others = all.filter((e) => e !== example).map((e) => e.name);
    const note = [
        `Wrote ${written.length} files into this directory:`,
        ...written.map((f) => `  ${f.padEnd(width)}  ${example.about?.[f] ?? ""}`.trimEnd()),
        "Next:",
        ...steps.map((s) => `  ${s.line}${s.note ? `    ${s.note}` : ""}`),
        ...(example.credit ? [`Data: ${example.credit}`] : []),
        ...(others.length ? [`Other examples: ${others.map((n) => `pivotkit example ${n}`).join(", ")}`] : [])
    ].join("\n");
    return { findings: [], extra: { example: example.name, written, next: steps.map((s) => s.line), ...(example.credit ? { credit: example.credit } : {}) }, note };
}

/**
 * --list: every example's name, what it holds and its files on stdout (not with --json).
 * @param {Example[]} all
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
function listExamples(all, values, ctx) {
    if (!values.json) {
        const width = Math.max(...all.map((e) => e.name.length));
        const lines = all.map((e) => `  ${e.name.padEnd(width)}  ${e.text}${e.default ? " (the default)" : ""}\n  ${" ".repeat(width)}  ${e.files.join(", ")}`);
        ctx.io.stdout.write(`Examples (pivotkit example <name> writes one into this directory):\n${lines.join("\n")}\n`);
    }
    return { findings: [], extra: { examples: all.map((e) => ({ name: e.name, text: e.text, files: e.files, default: Boolean(e.default), ...(e.credit ? { credit: e.credit } : {}) })) } };
}

/**
 * What to run next on an example's files, each with what it gives: an example of print templates
 * renders another one's data, that one first, then each template; any other its first view as a
 * report, its other views validated, and its data described.
 * @param {Example} example
 * @returns {Array<{ line: string, note?: string }>}
 */
function nextSteps(example) {
    const report = (/** @type {string} */ line, /** @type {string} */ what) => ({ line, note: `(${what}: open it in a browser)` });
    if (example.templates?.length) {
        return [...(example.uses ? [{ line: `pivotkit example ${example.uses}`, note: "(its data and views, if they are not here yet)" }] : []), ...example.templates.map((t) => report(templateLine(example, t), "an HTML report in that design"))];
    }
    const views = example.files.filter((f) => f.endsWith(".pivotkit.json"));
    return [report(tryLine(example), "an HTML report"), ...views.slice(1).map((v) => ({ line: `pivotkit validate ${v} --data ${example.data} --strict` })), { line: `pivotkit describe ${example.data}` }];
}

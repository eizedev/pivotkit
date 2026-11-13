/*
 * pivotkit: the command line of pivotkit-report. `main()` runs one command with its input and output
 * streams given (bin/pivotkit.js passes the process's), so tests can run it in the process too.
 *
 * Contract (docs/reference/cli.md): exit code 0 done, 1 findings (an error in the view, or a warning
 * with --strict), 2 a usage, file, limit or template error. --json writes one object on stdout:
 * { ok, exitCode, command, findings: [{ severity, code, path, message, suggestion }], error?: { kind,
 * code, message }, output?, ... }. No network; with --now the output is the same on every run.
 */

import { createRequire } from "node:module";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";
import { LIMITS, OUTSIDE_LIMITS, VIEW_FILE_FORMAT, describeSource, describeView, encode, fromViewFile, outsideLimits, validate } from "pivotkit-core";
import { readFile } from "pivotkit-core/import";
import { readViewLink } from "pivotkit-core/link";
import { RENDER_FORMATS, render } from "pivotkit-report";
import xlsxReader from "pivotkit-xlsx";
import { COMMANDS, SHELLS, optionsOf } from "./commands.js";
import { CliError, asCliError, printable, shortName } from "./errors.js";
import { completionScript, helpText } from "./help.js";
import { allowedDirs, readSafe, readStdin, writeSafe } from "./safe-files.js";

/**
 * @typedef {object} Io
 * @property {AsyncIterable<Uint8Array> & { isTTY?: boolean }} stdin
 * @property {{ write(chunk: string | Uint8Array): unknown, isTTY?: boolean }} stdout
 * @property {{ write(chunk: string | Uint8Array): unknown }} stderr
 * @property {Record<string, string | undefined>} env
 * @property {string} cwd
 */

/** The most bytes a view or a template file may have (a view file's characters as UTF-8). */
const VIEW_BYTES = OUTSIDE_LIMITS.json * 4;
const TEMPLATE_BYTES = 262_144 * 4;

/** The versions of this package and the two it renders with. */
export function versions() {
    const require = createRequire(import.meta.url);
    const of = (name) => require(`${name}/package.json`).version;
    return { "pivotkit-cli": of("pivotkit-cli"), "pivotkit-report": of("pivotkit-report"), "pivotkit-core": of("pivotkit-core") };
}

/** The edit distance of two short words, for "did you mean". */
function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const keep = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = keep;
        }
    }
    return row[b.length];
}

/** The closest of `known` to `word`, when it is close. */
function closest(word, known) {
    const best = known.map((k) => [k, distance(word.toLowerCase(), k.toLowerCase())]).sort((a, b) => a[1] - b[1])[0];
    return best && best[1] <= Math.max(1, Math.floor(best[0].length / 2)) ? best[0] : null;
}

/** "; did you mean --x?" or "". */
const didYouMean = (word, known, prefix = "") => {
    const near = closest(word, known);
    return near ? `; did you mean ${prefix}${near}?` : "";
};

/** Parses a command's arguments with the table's options; unknown ones are a usage error with a hint. */
function parse(command, args) {
    const specs = optionsOf(command);
    /** @type {Record<string, any>} */
    const options = Object.fromEntries(Object.entries(specs).map(([name, s]) => [name, { type: s.type, ...(s.short ? { short: s.short } : {}), ...(s.multiple ? { multiple: true } : {}) }]));
    try {
        return parseArgs({ args, options, allowPositionals: true, strict: true });
    } catch (e) {
        const flag = /'(-{1,2}[^'\s]+)'/.exec(String(e.message))?.[1] ?? "";
        if (e.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
            throw new CliError("usage", "UNKNOWN_OPTION", `unknown option ${printable(flag)} for "${command}"${didYouMean(flag.replace(/^-+/, ""), Object.keys(specs), "--")}`);
        }
        throw new CliError("usage", "BAD_OPTION", printable(String(e.message).split("\n")[0]));
    }
}

/** Checks the values of options that take one of a list. */
function checkChoices(command, values) {
    for (const [name, spec] of Object.entries(optionsOf(command))) {
        if (spec.choices && values[name] !== undefined && !spec.choices.includes(values[name])) {
            throw new CliError("usage", "BAD_VALUE", `--${name} takes ${spec.choices.join(", ")}, not ${printable(JSON.stringify(values[name]))}${didYouMean(String(values[name]), spec.choices)}`);
        }
    }
}

/** --limit key=n, checked against pivotkit-core's LIMITS. */
function limitsOf(list) {
    /** @type {Record<string, number>} */
    const limits = {};
    for (const entry of list ?? []) {
        const m = /^([A-Za-z]+)=(\d+)$/.exec(entry);
        if (!m) {
            throw new CliError("usage", "BAD_LIMIT", `--limit takes key=number, not ${printable(JSON.stringify(entry))}`);
        }
        if (!Object.hasOwn(LIMITS, m[1])) {
            throw new CliError("usage", "UNKNOWN_LIMIT", `unknown limit "${printable(m[1])}"${didYouMean(m[1], Object.keys(LIMITS))} (one of ${Object.keys(LIMITS).join(", ")})`);
        }
        const value = Number(m[2]);
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new CliError("usage", "BAD_LIMIT", `--limit ${m[1]} must be a whole number of 1 or more`);
        }
        limits[m[1]] = value;
    }
    return limits;
}

/** A whole number option within bounds. */
function intOption(name, value, min, max) {
    if (value === undefined) {
        return undefined;
    }
    const n = Number(value);
    if (!/^\d+$/.test(value) || n < min || n > max) {
        throw new CliError("usage", "BAD_VALUE", `--${name} takes a whole number from ${min} to ${max}`);
    }
    return n;
}

/** The findings of a run, in the --json shape. */
const findingOf = (issue) => ({
    severity: issue.severity === "warning" ? "warning" : "error",
    code: issue.code ?? "issue",
    path: printable(issue.path ?? ""),
    message: printable(issue.message ?? ""),
    ...(issue.params?.suggestion ? { suggestion: printable(issue.params.suggestion) } : {})
});

/**
 * Runs one command. Never throws: every error ends in its exit code and message.
 * @param {string[]} argv  the arguments after "pivotkit"
 * @param {Io} io
 * @returns {Promise<number>}  the exit code
 */
export async function main(argv, io) {
    const json = argv.includes("--json");
    /** @type {any[]} */
    let findings = [];
    let command = argv.find((a) => !a.startsWith("-")) ?? "";
    const say = (text) => io.stderr.write(`${text}\n`);
    try {
        if (argv.length === 0) {
            io.stdout.write(helpText());
            return 0;
        }
        if (argv[0] === "--version" || argv[0] === "-v") {
            const v = versions();
            io.stdout.write(json ? `${JSON.stringify(v)}\n` : `pivotkit-cli ${v["pivotkit-cli"]} (pivotkit-report ${v["pivotkit-report"]}, pivotkit-core ${v["pivotkit-core"]})\n`);
            return 0;
        }
        if (argv[0] === "--help" || argv[0] === "-h") {
            io.stdout.write(helpText());
            return 0;
        }
        command = argv[0];
        if (!Object.hasOwn(COMMANDS, command)) {
            throw new CliError("usage", "UNKNOWN_COMMAND", `unknown command ${printable(JSON.stringify(command))}${didYouMean(command, Object.keys(COMMANDS))}; run "pivotkit help"`);
        }
        const { values, positionals } = parse(command, argv.slice(1));
        if (values.help) {
            io.stdout.write(helpText(command));
            return 0;
        }
        checkChoices(command, values);
        if (command === "help") {
            if (positionals[0] && !Object.hasOwn(COMMANDS, positionals[0])) {
                throw new CliError("usage", "UNKNOWN_COMMAND", `unknown command ${printable(JSON.stringify(positionals[0]))}${didYouMean(positionals[0], Object.keys(COMMANDS))}`);
            }
            io.stdout.write(helpText(positionals[0]));
            return 0;
        }
        if (command === "completion") {
            const shell = positionals[0];
            if (!SHELLS.includes(shell)) {
                throw new CliError("usage", "BAD_VALUE", `completion takes one of ${SHELLS.join(", ")}`);
            }
            io.stdout.write(completionScript(/** @type {any} */ (shell)));
            return 0;
        }
        // defaults from the environment; an option given wins
        for (const [name, spec] of Object.entries(optionsOf(command))) {
            if (spec.env && values[name] === undefined && io.env[spec.env]) {
                values[name] = io.env[spec.env];
            }
        }
        const ctx = await context(values, io);
        const outcome = command === "render" ? await renderCommand(positionals, values, ctx) : command === "validate" ? await validateCommand(positionals, values, ctx) : await describeCommand(positionals, values, ctx);
        findings = outcome.findings;
        const failing = findings.filter((f) => f.severity === "error" || (values.strict && f.severity === "warning"));
        const exitCode = failing.length > 0 ? 1 : 0;
        if (json) {
            io.stdout.write(`${JSON.stringify({ ok: exitCode === 0, exitCode, command, findings, ...outcome.extra })}\n`);
        } else {
            for (const f of findings) {
                if (f.severity === "error" || (f.severity === "warning" && !values.quiet)) {
                    say(`${f.severity} ${f.code}${f.path ? ` at ${f.path}` : ""}: ${f.message}${f.suggestion ? ` (did you mean "${f.suggestion}"?)` : ""}`);
                }
            }
            if (outcome.note && !values.quiet) {
                say(outcome.note);
            }
        }
        return exitCode;
    } catch (e) {
        const error = asCliError(e);
        if (json) {
            io.stdout.write(`${JSON.stringify({ ok: false, exitCode: 2, command, findings, error: { kind: error.kind, code: error.code, message: error.message } })}\n`);
        } else {
            say(`pivotkit: ${error.message}`);
        }
        return 2;
    }
}

/** What every command needs: the limits, the allowed directories and how to read a file. */
async function context(values, io) {
    const limits = limitsOf(values.limit);
    const allow = await allowedDirs(values["allow-dir"] ?? [], io.cwd);
    let stdinUsed = null;
    /** Reads a file or stdin ("-"), at most one input from stdin. */
    const readInput = async (path, what, maxBytes, limit) => {
        if (path === "-") {
            if (stdinUsed) {
                throw new CliError("usage", "STDIN_TWICE", `only one input can come from stdin (${stdinUsed} does already)`);
            }
            stdinUsed = what;
            return readStdin(io.stdin, maxBytes, limit);
        }
        try {
            return await readSafe(path, { cwd: io.cwd, allow, maxBytes, limit });
        } catch (e) {
            throw asCliError(e, path);
        }
    };
    const fileLimits = { ...LIMITS, ...limits };
    return { limits, allow, readInput, io, fileLimits, now: values.now, locale: values.locale, timeZone: values["time-zone"] };
}

/**
 * Reader notes that only say how a file was read (its encoding, separator, sheet): "info", in --json
 * only. The others say the data differs from the file (a column renamed or dropped, text cut, values
 * not converted): warnings.
 */
const INFO_NOTES = new Set(["ENCODING", "SEPARATOR", "SHEET", "USED_RANGE", "JSON_FLATTENED", "LINES_SKIPPED", "ROWS_EMPTY"]);

/** The text of a view or template file, as UTF-8. */
const textOf = (bytes) => new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");

/** The view of a command: from --link, a file, stdin or JSON text. */
async function readView(positionals, values, ctx) {
    if (values.link !== undefined) {
        const url = String(values.link);
        const hash = url.includes("#") ? url.slice(url.indexOf("#")) : url;
        const read = readViewLink(hash, values.key ?? null, { limits: ctx.limits });
        if (!read.view) {
            throw new CliError("usage", "BAD_LINK", `--link: not a pivotkit link (${read.failed})`);
        }
        return { view: read.view, name: read.name, source: "link" };
    }
    const arg = positionals[0];
    if (arg === undefined) {
        throw new CliError("usage", "MISSING_VIEW", "a view is needed: a file, - for stdin, JSON text or --link");
    }
    if (arg.trimStart().startsWith("{")) {
        return { view: arg, name: "", source: "argument" };
    }
    const text = textOf(await ctx.readInput(arg, "the view", VIEW_BYTES, "json"));
    return { view: text, name: "", source: arg };
}

/** The data of --data as an import table, with the reader's notes as warnings. */
async function readData(values, ctx) {
    const path = values.data;
    if (path === undefined) {
        return null;
    }
    const format = values["data-format"] ?? (path === "-" ? null : extname(path).slice(1).toLowerCase());
    if (!format || !["csv", "json", "xlsx", "tsv", "txt"].includes(format)) {
        throw new CliError("usage", "DATA_FORMAT", path === "-" ? "--data - needs --data-format csv, json or xlsx" : `${shortName(path)}: unknown kind of data file; give --data-format csv, json or xlsx`);
    }
    const bytes = await ctx.readInput(path, "the data", ctx.fileLimits.fileBytes, "fileBytes");
    const name = path === "-" ? `stdin.${format}` : basename(path).endsWith(`.${format}`) ? basename(path) : `${basename(path)}.${format}`;
    try {
        const table = await readFile(new File([/** @type {BlobPart} */ (bytes)], name), { plugins: [xlsxReader], limits: ctx.limits, ...(values.sheet ? { sheet: values.sheet } : {}), ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}) });
        return { table, name: path === "-" ? "stdin" : basename(path), notes: table.notes.map((n) => ({ severity: INFO_NOTES.has(n.code) ? "info" : "warning", code: n.code, path: "", message: printable(`${shortName(path)}: ${n.message}`) })) };
    } catch (e) {
        throw asCliError(e, path);
    }
}

/** The render options common to the commands. */
const renderBase = (ctx) => ({ ...(ctx.locale ? { locale: ctx.locale } : {}), ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}), ...(ctx.now ? { now: ctx.now } : {}), ...(Object.keys(ctx.limits).length ? { limits: ctx.limits } : {}) });

async function renderCommand(positionals, values, ctx) {
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `render takes one view, not ${positionals.length}`);
    }
    if (values.json && !values.output) {
        throw new CliError("usage", "JSON_NEEDS_OUTPUT", "--json writes the result on stdout: give the output a file with -o");
    }
    const format = values.format ?? (values.output && Object.hasOwn(RENDER_FORMATS, extname(values.output).slice(1).toLowerCase()) ? extname(values.output).slice(1).toLowerCase() : "html");
    if (!values.output && format === "xlsx" && ctx.io.stdout.isTTY) {
        throw new CliError("usage", "BINARY_TO_TERMINAL", "an XLSX file is not shown in a terminal: write it to a file with -o, or redirect stdout");
    }
    const view = await readView(positionals, values, ctx);
    const data = await readData(values, ctx);
    if (!data) {
        throw new CliError("usage", "MISSING_DATA", "render needs data: --data <file> or --data -");
    }
    const template = values.template !== undefined ? textOf(await ctx.readInput(values.template, "the template", TEMPLATE_BYTES, "template")) : undefined;
    const echarts = format === "svg" || format === "html" ? await import("echarts") : undefined;
    const width = intOption("width", values.width, 100, 8000);
    const height = intOption("height", values.height, 100, 8000);
    let result;
    try {
        result = await render(view.view, data.table, {
            ...renderBase(ctx),
            format: /** @type {any} */ (format),
            strict: !values.lenient,
            source: data.name,
            ...(values.title !== undefined ? { title: values.title } : {}),
            ...(template !== undefined ? { template } : {}),
            ...(values.chart ? { chart: values.chart === "auto" ? "auto" : values.chart === "on" } : {}),
            ...(echarts ? { echarts } : {}),
            ...(width || height ? { size: { ...(width ? { width } : {}), ...(height ? { height } : {}) } } : {})
        });
    } catch (e) {
        throw asCliError(e, values.template);
    }
    const findings = [...data.notes, ...result.issues.map(findingOf)];
    const failed = findings.some((f) => f.severity === "error" || (values.strict && f.severity === "warning"));
    /** @type {any} */
    const extra = { summary: result.summary };
    if (result.body && !(failed && !values.lenient)) {
        if (values.output) {
            try {
                await writeSafe(values.output, result.body, { cwd: ctx.io.cwd, allow: ctx.allow });
            } catch (e) {
                throw asCliError(e, values.output);
            }
            extra.output = { file: shortName(values.output), format, mediaType: result.mediaType, bytes: result.body.length };
        } else {
            ctx.io.stdout.write(result.body);
        }
    } else {
        extra.output = null;
    }
    return { findings, extra, note: extra.output === null ? "nothing written: the view has errors (--lenient writes it as the report shows it)" : null };
}

async function validateCommand(positionals, values, ctx) {
    const view = await readView(positionals, values, ctx);
    const data = await readData(values, ctx);
    const read = fromViewFile(typeof view.view === "string" ? view.view : JSON.stringify(view.view));
    if (read.failed) {
        return { findings: [{ severity: "error", code: "viewFile", path: "", message: printable(`not a view: ${read.issues.at(-1)?.message ?? read.failed}`) }], extra: { valid: false } };
    }
    let schema;
    if (data) {
        schema = encode(data.table, { ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}), ...(Object.keys(ctx.limits).length ? { limits: ctx.limits } : {}) });
    } else if (read.source?.fields?.length) {
        schema = read.source.fields;
    } else {
        throw new CliError("usage", "MISSING_DATA", "validate needs data (--data) or a view file that lists its fields (source.fields)");
    }
    const { errors, warnings, valid } = validate(read.view, schema, { limits: outsideLimits(ctx.limits) });
    const fileNotes = read.issues.map((i) => ({ severity: "warning", code: "viewFile", path: printable(i.path ?? ""), message: printable(i.message) }));
    return { findings: [...(data?.notes ?? []), ...fileNotes, ...errors.map(findingOf), ...warnings.map(findingOf)], extra: { valid } };
}

async function describeCommand(positionals, values, ctx) {
    const input = positionals[0];
    if (input === undefined) {
        throw new CliError("usage", "MISSING_INPUT", "describe needs a view or a data file");
    }
    const items = intOption("items", values.items, 0, 1000) ?? 0;
    const ext = input === "-" ? values["data-format"] ?? "" : extname(input).slice(1).toLowerCase();
    let kind = values.as;
    let text = null;
    if (!kind) {
        if (ext === "json" || input.trimStart().startsWith("{") || (input === "-" && !values["data-format"])) {
            text = input.trimStart().startsWith("{") ? input : textOf(await ctx.readInput(input, "the input", Math.max(VIEW_BYTES, ctx.fileLimits.fileBytes), "fileBytes"));
            kind = isView(text) ? "view" : "data";
        } else {
            kind = "data";
        }
    }
    if (kind === "view") {
        const view = text ?? (input.trimStart().startsWith("{") ? input : textOf(await ctx.readInput(input, "the view", VIEW_BYTES, "json")));
        const read = fromViewFile(view);
        if (read.failed) {
            return { findings: [{ severity: "error", code: "viewFile", path: "", message: printable(`not a view: ${read.issues.at(-1)?.message ?? read.failed}`) }], extra: { kind } };
        }
        const data = await readData(values, ctx);
        if (!data && !read.source?.fields?.length) {
            throw new CliError("usage", "MISSING_DATA", "describing a view needs its data (--data) or a view file that lists its fields (source.fields)");
        }
        const schema = data ? encode(data.table, { ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}) }) : read.source?.fields;
        const described = describeView(read.view, schema, { limits: outsideLimits(ctx.limits) });
        if (!values.json) {
            ctx.io.stdout.write(`${printable(read.name || "view")}: ${printable(described.text)}\n`);
        }
        return { findings: [...(data?.notes ?? []), ...[...described.errors, ...described.warnings].map(findingOf)], extra: { kind, name: printable(read.name), description: described } };
    }
    // data: from the text read above (a JSON file that is no view), else the file
    const data = await readData({ ...values, data: input, "data-format": values["data-format"] ?? (text !== null ? "json" : undefined) }, text !== null ? withText(ctx, input, text) : ctx);
    const encoded = encode(data.table, { ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}) });
    const full = describeSource(encoded, { items });
    // what is shown by default is names, types and counts: values (items, the smallest and largest) only with --items
    const summary = items > 0 ? full : { ...full, fields: full.fields.map(({ min: _min, max: _max, ...f }) => ({ ...f, text: f.text.replace(/, from .*$/, "") })) };
    if (!values.json) {
        ctx.io.stdout.write(`${printable(summary.text)}\n`);
        for (const f of summary.fields) {
            ctx.io.stdout.write(`  ${printable(f.text)}${f.items?.length ? `; e.g. ${f.items.map((v) => printable(JSON.stringify(v))).join(", ")}` : ""}\n`);
        }
    }
    return { findings: data.notes, extra: { kind: "data", description: summary } };
}

/** A context whose reader hands back text already read (stdin is read once). */
function withText(ctx, input, text) {
    return { ...ctx, readInput: async (path) => (path === input ? new TextEncoder().encode(text) : ctx.readInput(path)) };
}

/** Whether a JSON text is a view: a view file, a template { name, view }, or an object with a view's keys. */
function isView(text) {
    let doc;
    try {
        doc = JSON.parse(text);
    } catch {
        return false;
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        return false;
    }
    if (doc.format === VIEW_FILE_FORMAT || (typeof doc.name === "string" && doc.view && typeof doc.view === "object")) {
        return true;
    }
    const viewKeys = ["rows", "cols", "values", "filters", "derived", "display", "chart", "version"];
    return Object.keys(doc).length > 0 && Object.keys(doc).every((k) => viewKeys.includes(k) || ["sort", "totals", "collapsed", "formatting"].includes(k));
}

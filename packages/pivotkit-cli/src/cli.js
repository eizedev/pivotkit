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
import { LIMITS, OUTSIDE_LIMITS, PivotkitError, VIEW_FILE_FORMAT, closest, describeSource, describeView, encode, fromViewFile, outsideLimits, validate } from "pivotkit-core";
import { IMPORT_TYPES, readFile, retype } from "pivotkit-core/import";
import { readViewLink } from "pivotkit-core/link";
import { RENDER_FORMATS, render } from "pivotkit-report";
import xlsxReader from "pivotkit-xlsx";
import { COMMANDS, SHELLS, optionsOf } from "./commands.js";
import { CliError, asCliError, printable, shortName } from "./errors.js";
import { examples, tryLine, writeExample } from "./examples.js";
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

/** "; did you mean --x?" or "" (pivotkit-core's closest(), as the view's and the template's hints). */
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
        /** @type {Record<string, string>} the options whose value came from an environment variable */
        const fromEnv = {};
        for (const [name, spec] of Object.entries(optionsOf(command))) {
            if (spec.env && values[name] === undefined && io.env[spec.env]) {
                values[name] = io.env[spec.env];
                fromEnv[name] = spec.env;
            }
        }
        checkValues(values, fromEnv);
        const ctx = await context(values, io);
        const outcome = command === "render" ? await renderCommand(positionals, values, ctx) : command === "validate" ? await validateCommand(positionals, values, ctx) : command === "example" ? await exampleCommand(positionals, values, ctx) : await describeCommand(positionals, values, ctx);
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

/**
 * Checks the options every command takes the same way, so a wrong one (or a wrong environment
 * variable) is an error in every command, not only in the one that uses it.
 * @param {Record<string, any>} values
 * @param {Record<string, string>} fromEnv
 */
function checkValues(values, fromEnv) {
    const bad = (name, what) => new CliError("usage", "BAD_VALUE", `--${name} ${printable(JSON.stringify(values[name]))} is not ${what}${fromEnv[name] ? ` (from ${fromEnv[name]})` : ""}`);
    if (values.locale !== undefined) {
        try {
            Intl.getCanonicalLocales(values.locale);
        } catch {
            throw bad("locale", "a locale tag such as en-US or de-DE");
        }
    }
    if (values["time-zone"] !== undefined) {
        try {
            new Intl.DateTimeFormat("en-US", { timeZone: values["time-zone"] });
        } catch {
            throw bad("time-zone", "a time zone such as UTC or Europe/Berlin");
        }
    }
    if (values.now !== undefined && Number.isNaN(new Date(values.now).getTime())) {
        throw bad("now", "a date or an ISO time such as 2026-11-13 or 2026-11-13T09:00:00Z");
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
        // the link's source.params.sheet is the one parameter the CLI uses: the sheet of a workbook
        const read = readViewLink(hash, values.key ?? null, { limits: ctx.limits, allowParams: ["sheet"] });
        if (!read.view) {
            throw new CliError("usage", "BAD_LINK", `--link: not a pivotkit link (${read.failed})`);
        }
        return { view: read.view, name: read.name, source: "link", sheet: read.src?.params?.sheet ?? null };
    }
    const arg = positionals[0];
    if (arg === undefined) {
        throw new CliError("usage", "MISSING_VIEW", "a view is needed: a file, - for stdin, JSON text or --link");
    }
    if (arg.trimStart().startsWith("{")) {
        return { view: arg, name: "", source: "argument", sheet: sheetOf(arg, ctx.limits) };
    }
    const text = textOf(await ctx.readInput(arg, "the view", VIEW_BYTES, "json"));
    return { view: text, name: "", source: arg, sheet: sheetOf(text, ctx.limits) };
}

/**
 * The sheet of a workbook a view file names (source.params.sheet, written by pivotkit-react for a
 * loaded workbook's sheet), or null.
 * @param {string} text
 * @param {object} limits  --limit's (srcParams and srcParamLength)
 */
function sheetOf(text, limits) {
    const sheet = fromViewFile(text, { limits }).source?.params?.sheet;
    return typeof sheet === "string" && sheet ? sheet : null;
}

/** " (read, hidden)": the words given, or "" for none. @param {...string} words */
const tags = (...words) => (words.some(Boolean) ? ` (${words.filter(Boolean).join(", ")})` : "");

/** A sheet name in a message, quoted as JSON text (a quote in it escaped). */
const quoted = (name) => JSON.stringify(printable(name));

/**
 * The sheets of a workbook for a message: "Q1", "Q2", "Hidden" (hidden). Empty when they cannot be read.
 * @param {File} file
 * @param {object} limits
 */
async function sheetList(file, limits) {
    try {
        const reader = await xlsxReader.load();
        const list = await reader.sheets(file, { name: file.name, limits });
        return list.map((s) => `${quoted(s.name)}${tags(s.visible ? "" : "hidden")}`).join(", ");
    } catch {
        return "";
    }
}

/**
 * The data of --data as an import table, with the reader's notes as warnings. A workbook's sheet:
 * --sheet, else the one the view names (`viewSheet`), else the first visible one; a sheet the
 * workbook does not have is an error that lists the sheets there are.
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {string | null} [viewSheet]  source.params.sheet of the view
 */
async function readData(values, ctx, viewSheet = null) {
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
    const file = new File([/** @type {BlobPart} */ (bytes)], name);
    const workbook = format === "xlsx";
    // an empty --sheet (an unset variable in a pipeline: --sheet "$SHEET") counts as not given
    const given = values.sheet ? String(values.sheet) : null;
    const fromView = workbook && !given && viewSheet ? viewSheet : null;
    const sheet = workbook ? (given ?? fromView) : given;
    /** @type {any[]} */
    const notes = [];
    if (fromView) {
        notes.push({ severity: "info", code: "viewSheet", path: "source.params.sheet", message: printable(`${shortName(path)}: sheet ${quoted(fromView)}, the one the view names`) });
    } else if (viewSheet && !workbook) {
        notes.push({ severity: "info", code: "viewSheet", path: "source.params.sheet", message: printable(`the view names the sheet ${quoted(viewSheet)}; ${shortName(path)} is no workbook, so it is not used`) });
    }
    try {
        const table = await readFile(file, { plugins: [xlsxReader], limits: ctx.limits, ...(sheet ? { sheet } : {}), ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}) });
        const read = table.notes.find((n) => n.code === "SHEET")?.params?.sheet;
        return {
            table,
            name: path === "-" ? "stdin" : basename(path),
            // as printed, so it matches the names of `sheets`
            sheet: typeof read === "string" ? printable(read) : null,
            // the workbook's sheets, read again only for describe (render and validate do not need them)
            sheets: workbook ? () => sheetInfo(file, ctx.limits) : null,
            notes: [...notes, ...table.notes.map((n) => ({ severity: INFO_NOTES.has(n.code) ? "info" : "warning", code: n.code, path: "", message: printable(`${shortName(path)}: ${n.message}`) }))]
        };
    } catch (e) {
        if (e instanceof PivotkitError && e.details?.reason === "NO_SHEET" && sheet) {
            const list = await sheetList(file, ctx.limits);
            const why = fromView ? " (the view's source.params.sheet; give --sheet to read another)" : "";
            throw new CliError("io", "NO_SHEET", `${shortName(path)}: the workbook has no sheet ${quoted(sheet)}${why}${list ? `; its sheets: ${list}` : ""}`);
        }
        throw asCliError(e, path);
    }
}

/**
 * The sheets of a workbook for --json: [{ name, index, visible }].
 * @param {File} file
 * @param {object} limits
 */
async function sheetInfo(file, limits) {
    const reader = await xlsxReader.load();
    return (await reader.sheets(file, { name: file.name, limits })).map((s) => ({ name: printable(s.name), index: s.index, visible: s.visible }));
}

/**
 * The fields a view file lists with their types (source.fields), or none: a view as JSON or a link
 * lists none.
 * @param {unknown} view  the view's text, or a view read from a link
 * @returns {Array<{ name: string, type: string }>}
 */
function viewFields(view) {
    const read = fromViewFile(typeof view === "string" ? view : JSON.stringify(view));
    return read.failed ? [] : (read.source?.fields ?? []);
}

/**
 * The data with the types its view file lists for its columns: a CSV cannot say that "2025" is text
 * or that a column of "true" is no boolean, a view file written with the data can. Only a column the
 * reader read as another type is read again (pivotkit-core/import's retype), each an info finding so
 * --json says why; a type that a value of the column does not fit is not applied (a view file made
 * for other data must not blank a column): the column stays as read, with a warning.
 * @param {Awaited<ReturnType<typeof readData>>} data
 * @param {Array<{ name: string, type: string }>} fields
 */
function withViewTypes(data, fields) {
    if (!data || !fields.length) {
        return data;
    }
    const byName = new Map(data.table.columns.map((name, c) => [String(name).toLowerCase(), c]));
    let table = data.table;
    const findings = [];
    for (const f of fields) {
        const c = byName.get(String(f.name).toLowerCase());
        if (c === undefined || !IMPORT_TYPES.includes(/** @type {any} */ (f.type)) || table.types[c] === f.type) {
            continue;
        }
        const name = table.columns[c];
        const next = retype(table, { [name]: /** @type {any} */ (f.type) });
        const raw = table.raw[c];
        const lost = raw.findIndex((v, i) => v !== null && String(v).trim() !== "" && (next.data[c][i] === null || next.data[c][i] === undefined));
        if (lost >= 0) {
            findings.push({ severity: "warning", code: "typeFromViewFailed", path: "", message: printable(`${data.name}: "${name}" is ${f.type} in the view file, but its value ${JSON.stringify(String(raw[lost]))} (row ${lost + 1}) is none; read as ${table.types[c]}`) });
            continue;
        }
        table = next;
        findings.push({ severity: "info", code: "typeFromView", path: "", message: printable(`${data.name}: "${name}" read as ${f.type}, the type the view file lists for it`) });
    }
    return findings.length ? { ...data, table, notes: [...data.notes, ...findings] } : data;
}

/** The render options common to the commands. */
const renderBase = (ctx) => ({ ...(ctx.locale ? { locale: ctx.locale } : {}), ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}), ...(ctx.now ? { now: ctx.now } : {}), ...(Object.keys(ctx.limits).length ? { limits: ctx.limits } : {}) });

/** The extensions -o names a format by (".htm" is HTML too). */
const EXTENSIONS = Object.freeze({ ...Object.fromEntries(Object.keys(RENDER_FORMATS).map((f) => [f, f])), htm: "html" });

/** The format of an output file by its extension; html on stdout. Another extension is an error, not HTML in a .pdf. */
function formatOf(output) {
    if (!output) {
        return "html";
    }
    const ext = extname(output).slice(1).toLowerCase();
    if (!Object.hasOwn(EXTENSIONS, ext)) {
        throw new CliError("usage", "UNKNOWN_EXTENSION", `${shortName(output)}: ${ext ? `.${printable(ext)} is no format pivotkit writes` : "no extension to take the format from"}; give -f ${COMMANDS.render.options.format.choices?.join(", ")}, or an extension of one`);
    }
    return EXTENSIONS[ext];
}

/** Warnings for options given that do nothing in the format (their `formats` in the table). */
function ignoredOptions(values, format) {
    return Object.entries(optionsOf("render"))
        .filter(([name, spec]) => spec.formats && values[name] !== undefined && !spec.formats.includes(format))
        .map(([name, spec]) => ({ severity: "warning", code: "ignoredOption", path: "", message: `--${name} does nothing in ${format} (only in ${spec.formats.join(", ")})` }));
}

async function renderCommand(positionals, values, ctx) {
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `render takes one view, not ${positionals.length}`);
    }
    if (values.json && !values.output) {
        throw new CliError("usage", "JSON_NEEDS_OUTPUT", "--json writes the result on stdout: give the output a file with -o");
    }
    const format = values.format ?? formatOf(values.output);
    if (!values.output && format === "xlsx" && ctx.io.stdout.isTTY) {
        throw new CliError("usage", "BINARY_TO_TERMINAL", "an XLSX file is not shown in a terminal: write it to a file with -o, or redirect stdout");
    }
    const view = await readView(positionals, values, ctx);
    const data = withViewTypes(await readData(values, ctx, view.sheet), viewFields(view.view));
    if (!data) {
        throw new CliError("usage", "MISSING_DATA", "render needs data: --data <file> or --data -");
    }
    const findings = [...data.notes, ...ignoredOptions(values, format)];
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
            // a byte order mark lets Excel read a CSV file as UTF-8; a program reading stdout gets none
            ...(format === "csv" ? { bom: values.bom === "on" || ((values.bom ?? "auto") === "auto" && Boolean(values.output)) } : {}),
            ...(echarts ? { echarts } : {}),
            ...(width || height ? { size: { ...(width ? { width } : {}), ...(height ? { height } : {}) } } : {})
        });
    } catch (e) {
        throw asCliError(e, values.template);
    }
    findings.push(...result.issues.map(findingOf));
    const failed = findings.some((f) => f.severity === "error" || (values.strict && f.severity === "warning"));
    /** @type {any} */
    const extra = { summary: result.summary, sheet: data.sheet };
    if (result.body && !(failed && !values.lenient)) {
        if (values.output) {
            try {
                await writeSafe(values.output, result.body, { cwd: ctx.io.cwd, allow: ctx.allow });
            } catch (e) {
                const error = asCliError(e, values.output);
                // -o /dev/stdout: a device is never replaced, and stdout is where the output goes without -o
                throw error.code === "SPECIAL_FILE" ? new CliError(error.kind, error.code, `${error.message}; to write to stdout, leave out -o`) : error;
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

/**
 * pivotkit example [name] [--list]: the example's files written into the working directory (the
 * default example without a name), what each one is and what to run next (stderr); --list names them
 * all (stdout) and writes nothing.
 */
async function exampleCommand(positionals, values, ctx) {
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `example takes one name, not ${positionals.length}`);
    }
    const all = examples();
    if (values.list && positionals.length) {
        throw new CliError("usage", "EXTRA_ARGUMENT", "--list writes nothing: give it without a name");
    }
    if (values.list) {
        if (!values.json) {
            const width = Math.max(...all.map((e) => e.name.length));
            const lines = all.map((e) => `  ${e.name.padEnd(width)}  ${e.text}${e.default ? " (the default)" : ""}\n  ${" ".repeat(width)}  ${e.files.join(", ")}`);
            ctx.io.stdout.write(`Examples (pivotkit example <name> writes one into this directory):\n${lines.join("\n")}\n`);
        }
        return { findings: [], extra: { examples: all.map((e) => ({ name: e.name, text: e.text, files: e.files, default: Boolean(e.default), ...(e.credit ? { credit: e.credit } : {}) })) } };
    }
    const name = positionals[0] ?? all.find((e) => e.default)?.name ?? all[0].name;
    const example = all.find((e) => e.name === name);
    if (!example) {
        throw new CliError("usage", "UNKNOWN_EXAMPLE", `no example ${printable(JSON.stringify(name))}${didYouMean(name, all.map((e) => e.name))}; run "pivotkit example --list"`);
    }
    const written = await writeExample(example, { cwd: ctx.io.cwd, allow: ctx.allow });
    const width = Math.max(...written.map((f) => f.length));
    const views = example.files.filter((f) => f.endsWith(".pivotkit.json"));
    const next = [tryLine(example), ...views.slice(1).map((v) => `pivotkit validate ${v} --data ${example.data} --strict`), `pivotkit describe ${example.data}`];
    const others = all.filter((e) => e !== example).map((e) => e.name);
    const note = [
        `Wrote ${written.length} files into this directory:`,
        ...written.map((f) => `  ${f.padEnd(width)}  ${example.about?.[f] ?? ""}`.trimEnd()),
        "Next:",
        `  ${next[0]}    (an HTML report: open it in a browser)`,
        ...next.slice(1).map((line) => `  ${line}`),
        ...(example.credit ? [`Data: ${example.credit}`] : []),
        ...(others.length ? [`Other examples: ${others.map((n) => `pivotkit example ${n}`).join(", ")}`] : [])
    ].join("\n");
    return { findings: [], extra: { example: example.name, written, next, ...(example.credit ? { credit: example.credit } : {}) }, note };
}

async function validateCommand(positionals, values, ctx) {
    const view = await readView(positionals, values, ctx);
    const data = withViewTypes(await readData(values, ctx, view.sheet), viewFields(view.view));
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
    return { findings: [...(data?.notes ?? []), ...fileNotes, ...errors.map(findingOf), ...warnings.map(findingOf)], extra: { valid, sheet: data?.sheet ?? null } };
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
    /** @type {Uint8Array | null} a JSON file read to tell a view from data, kept for reading it as data */
    let bytes = null;
    if (!kind) {
        if (input.trimStart().startsWith("{")) {
            text = input;
            kind = isView(text) ? "view" : "data";
        } else if (ext === "json" || (input === "-" && !values["data-format"])) {
            bytes = await ctx.readInput(input, "the input", Math.max(VIEW_BYTES, ctx.fileLimits.fileBytes), "fileBytes");
            // a file larger than a view may be is data: not decoded and parsed only to tell
            text = bytes.length <= VIEW_BYTES ? textOf(bytes) : null;
            kind = text !== null && isView(text) ? "view" : "data";
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
        const data = withViewTypes(await readData(values, ctx, typeof read.source?.params?.sheet === "string" ? read.source.params.sheet : null), read.source?.fields ?? []);
        if (!data && !read.source?.fields?.length) {
            throw new CliError("usage", "MISSING_DATA", "describing a view needs its data (--data) or a view file that lists its fields (source.fields)");
        }
        const schema = data ? encode(data.table, { ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}) }) : read.source?.fields;
        const described = describeView(read.view, schema, { limits: outsideLimits(ctx.limits) });
        if (!values.json) {
            ctx.io.stdout.write(`${printable(read.name || "view")}: ${printable(described.text)}\n`);
        }
        return { findings: [...(data?.notes ?? []), ...[...described.errors, ...described.warnings].map(findingOf)], extra: { kind, name: printable(read.name), description: described, sheet: data?.sheet ?? null } };
    }
    // data: the bytes or the text read above (JSON that is no view), else the file
    const known = bytes ?? (text !== null ? new TextEncoder().encode(text) : null);
    const data = await readData({ ...values, data: input, "data-format": values["data-format"] ?? (known ? "json" : undefined) }, known ? withBytes(ctx, input, known) : ctx);
    const encoded = encode(data.table, { ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}) });
    const full = describeSource(encoded, { items });
    // what is shown by default is names, types and counts: values (items, the smallest and largest) only with --items
    const summary = items > 0 ? full : { ...full, fields: full.fields.map(({ min: _min, max: _max, ...f }) => ({ ...f, text: f.text.replace(/, from .*$/, "") })) };
    const sheets = data.sheets ? await data.sheets() : null;
    if (!values.json) {
        ctx.io.stdout.write(`${printable(summary.text)}\n`);
        // a workbook: its sheets, the one read marked
        if (sheets && sheets.length > 0) {
            ctx.io.stdout.write(`  sheets: ${sheets.map((s) => `${quoted(s.name)}${tags(s.name === data.sheet ? "read" : "", s.visible ? "" : "hidden")}`).join(", ")}\n`);
        }
        for (const f of summary.fields) {
            ctx.io.stdout.write(`  ${printable(f.text)}${f.items?.length ? `; e.g. ${f.items.map((v) => printable(JSON.stringify(v))).join(", ")}` : ""}\n`);
        }
    }
    return { findings: data.notes, extra: { kind: "data", description: summary, sheet: data.sheet, ...(sheets ? { sheets } : {}) } };
}

/** A context whose reader hands back the bytes already read (stdin is read once). */
function withBytes(ctx, input, bytes) {
    return { ...ctx, readInput: async (path, ...rest) => (path === input ? bytes : ctx.readInput(path, ...rest)) };
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

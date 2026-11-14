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
import { DEFAULT_LABELS, LIMITS, OUTSIDE_LIMITS, PivotkitError, REPORT_LABELS, VIEW_FILE_FORMAT, closest, encode, fromViewFile, outsideLimits, renameFields, validate, viewFileFields, viewFileText } from "pivotkit-core";
import { IMPORT_TYPES, readFile, retype } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";
import { readViewLink } from "pivotkit-core/link";
import { RENDER_FORMATS } from "pivotkit-report";
import { OPERATIONS, findingOf } from "pivotkit-report/operations";
import { COMMANDS, DOCS, SHELLS, optionsOf } from "./commands.js";
import { CliError, asCliError, printable, shortName } from "./errors.js";
import { examples, tryLine, writeExample } from "./examples.js";
import { completionScript, helpText } from "./help.js";
import { INFO_NOTES } from "./files.js";
import { fromFields, hasLayoutFlags, layoutView, mapOf, normalized, pickLines, quoteArg, viewFileFor } from "./layout-view.js";
import { allowedDirs, readSafe, readStdin, writeSafe } from "./safe-files.js";
import { resolve as resolvePath } from "node:path";

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

/**
 * What a bug report or a CI log needs besides the versions: Node, the defaults the environment sets
 * (and whether Intl knows them) and pivotkit-core's limits.
 * @param {Record<string, string | undefined>} env
 */
export function environment(env) {
    const knownLocale = (tag) => {
        try {
            return Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0;
        } catch {
            return false;
        }
    };
    const knownZone = (zone) => {
        try {
            new Intl.DateTimeFormat("en-US", { timeZone: zone });
            return true;
        } catch {
            return false;
        }
    };
    const locale = env.PIVOTKIT_LOCALE || null;
    const timeZone = env.PIVOTKIT_TIME_ZONE || null;
    const now = env.PIVOTKIT_NOW || null;
    return {
        node: process.version,
        locale: { value: locale ?? "en-US", from: locale ? "PIVOTKIT_LOCALE" : "default", known: knownLocale(locale ?? "en-US") },
        timeZone: { value: timeZone ?? "UTC", from: timeZone ? "PIVOTKIT_TIME_ZONE" : "default", known: knownZone(timeZone ?? "UTC") },
        now: { value: now, from: now ? "PIVOTKIT_NOW" : "the clock" },
        limits: { ...LIMITS }
    };
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
            throw new CliError("usage", "UNKNOWN_LIMIT", `unknown limit "${printable(m[1])}"${didYouMean(m[1], Object.keys(LIMITS))} (the limits: ${DOCS}concepts/limits/)`);
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
            io.stdout.write(json ? `${JSON.stringify({ ...v, environment: environment(io.env) })}\n` : `pivotkit-cli ${v["pivotkit-cli"]} (pivotkit-report ${v["pivotkit-report"]}, pivotkit-core ${v["pivotkit-core"]})\n`);
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
                // an error that follows from another one (the fields a data mismatch is about) is counted there; --json keeps it
                if (f.followsFrom) {
                    continue;
                }
                if (f.severity === "error" || (f.severity === "warning" && !values.quiet) || (f.severity === "info" && values.verbose && !values.quiet)) {
                    say(`${f.severity} ${f.code}${f.path ? ` at ${f.path}` : ""}: ${f.message}${f.suggestion ? ` (did you mean "${f.suggestion}"?)` : ""}`);
                    for (const line of f.details ?? []) {
                        say(`  ${line}`);
                    }
                }
            }
            // what was written or checked: a line for a person (not with -q, and an error's line always)
            if (outcome.note && (!values.quiet || outcome.noteIsError)) {
                say(outcome.note);
            }
        }
        return exitCode;
    } catch (e) {
        const error = asCliError(e);
        // a usage error ends with the way to the command's help
        if (error.kind === "usage" && Object.hasOwn(COMMANDS, command) && command !== "help" && !error.message.includes("pivotkit help")) {
            error.message = `${error.message}; see "pivotkit help ${command}"`;
        }
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
            // a terminal, not a pipe: the CLI waits for what is typed, so it says so
            if (io.stdin.isTTY && !values.quiet) {
                io.stderr.write(`reading ${what} from stdin: type or paste it, then Ctrl-D (Ctrl-Z, Enter on Windows)\n`);
            }
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
 * The environment of pivotkit-report's operations for one command: the data of --data (encoded), or
 * the fields a view file lists when there is no data.
 * @param {any} ctx
 * @param {{ table: any, name: string, notes: any[] } | null} data
 * @param {Array<{ name: string, type: string }> | null} [fields]
 * @returns {import("pivotkit-report/operations").OperationEnv}
 */
function operationEnv(ctx, data, fields = null) {
    const encoded = data ? encode(data.table, { timeZone: ctx.timeZone ?? "UTC", ...(Object.keys(ctx.limits).length ? { limits: ctx.limits } : {}) }) : null;
    return {
        data: async () => (encoded ? { data: encoded, name: data.name, notes: data.notes } : { data: fields ?? [], name: "", notes: [] }),
        ...(Object.keys(ctx.limits).length ? { limits: ctx.limits } : {}),
        ...(ctx.locale ? { locale: ctx.locale } : {}),
        ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}),
        ...(ctx.now ? { now: ctx.now } : {})
    };
}

/** Runs an operation of pivotkit-report's table, its errors as the CLI's. */
async function runOperation(name, input, env, path) {
    try {
        return await OPERATIONS[name].run(input, env);
    } catch (e) {
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

/** A field name in a list of a message: at most this many characters. */
const NAME_LENGTH = 30;
/** A list of field names in a message: at most about this many characters, then "and n more". */
const LIST_LENGTH = 140;
/** A cell value in a message (what made a column text, a sign of a pivot result): at most this many characters. */
const VALUE_LENGTH = 20;

/** Text cut to `max` characters with "…". */
const cut = (text, max) => {
    const chars = Array.from(String(text));
    return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
};

/** Field names as a message lists them: each cut, as many as fit, then "and n more". */
function nameList(names) {
    const shown = [];
    let length = 0;
    for (const name of names) {
        const text = cut(name, NAME_LENGTH);
        if (shown.length && length + text.length + 2 > LIST_LENGTH) break;
        shown.push(text);
        length += text.length + 2;
    }
    return names.length > shown.length ? `${shown.join(", ")} and ${names.length - shown.length} more` : shown.join(", ");
}

/** The words of a value's name in a pivot result's header ("Sum of", "Summe von"), every language's. */
const VALUE_NAME = (() => {
    const words = new Set();
    for (const labels of [DEFAULT_LABELS, ...Object.values(REPORT_LABELS)]) {
        const joiner = labels.valueName.replace("{agg}", "").replace("{field}", "").trim();
        for (const agg of Object.values(labels.aggregators)) words.add(`${agg} ${joiner} `.toLowerCase());
    }
    return [...words];
})();
const TOTAL_NAMES = new Set([DEFAULT_LABELS.grandTotal, ...Object.values(REPORT_LABELS).map((l) => l.grandTotal)].map((t) => t.toLowerCase()));

/**
 * What says a data file is a pivot RESULT (the table's own CSV), not the rows: a grand total column,
 * a value's name ("Average of Mean °C") in its header or its first rows. Each cut for the message.
 * @param {import("pivotkit-core/import").ImportTable} table
 */
function pivotResultSigns(table) {
    const signs = [];
    const total = table.columns.find((name) => TOTAL_NAMES.has(String(name).toLowerCase()));
    if (total) signs.push(cut(total, VALUE_LENGTH));
    const valueName = (text) => typeof text === "string" && VALUE_NAME.some((w) => text.toLowerCase().startsWith(w));
    const named = table.columns.find(valueName) ?? table.raw.flatMap((values) => values.slice(0, 3)).find(valueName);
    if (named) signs.push(cut(named, VALUE_LENGTH));
    return signs;
}

/** The errors a field the data does not have brings along, when they name one of the missing fields. */
const FOLLOW_ON = new Set(["unknownField", "groupingNoSource", "aggregatorNeedsField", "filterFieldType"]);

/**
 * The findings of a view over data, explained for a person: when the data lacks fields the view uses,
 * one error first (dataMismatch: the view's fields, the data's, the missing ones with a hint, and
 * whether the file looks like a pivot result); an error that names a missing field (and, for a pivot
 * result, a grouping whose name its header has) is marked as following from it; an unknown field
 * names the data's fields; a value refused on a text field names the value (cut) and row that made it
 * text. A message holds header names and at most one cell value, cut (errors.js).
 * @param {any[]} findings
 * @param {unknown} viewText  the view as given (text or an object of a link)
 * @param {NonNullable<Awaited<ReturnType<typeof readData>>>} data
 */
function explain(findings, viewText, data) {
    const columns = data.table.columns.map(String);
    const has = new Set(columns.map((c) => c.toLowerCase()));
    const read = fromViewFile(typeof viewText === "string" ? viewText : JSON.stringify(viewText));
    // the fields the view uses; source.fields (every field of the file) only gives their types
    const wanted = read.failed ? [] : viewFileFields(read.view ?? {});
    const missing = wanted.filter((name) => !has.has(String(name).toLowerCase()));
    const out = findings.map((f) => {
        if (f.code === "unknownField") {
            return { ...f, message: printable(`${f.message}; the data has: ${nameList(columns)}`) };
        }
        if (f.code === "aggregatorType" || f.code === "filterFieldType") {
            const field = /the string field "(.+)"/.exec(f.message)?.[1];
            const c = field === undefined ? -1 : columns.findIndex((name) => name.toLowerCase() === field.toLowerCase());
            const raw = c >= 0 ? data.table.raw[c] : [];
            const row = raw.findIndex((v) => v !== null && String(v).trim() !== "" && !Number.isFinite(Number(String(v).trim().replace(",", "."))));
            if (row >= 0) {
                return { ...f, message: printable(`${f.message} (read as text: its value ${JSON.stringify(cut(raw[row], VALUE_LENGTH))} in row ${row + 1} is no number)`) };
            }
        }
        return f;
    });
    if (!missing.length) {
        return out;
    }
    const signs = pivotResultSigns(data.table);
    const lower = missing.map((m) => String(m).toLowerCase());
    const namesMissing = (f) => lower.some((m) => f.message.toLowerCase().includes(`"${m}"`));
    const followers = out.filter((f) => f.severity === "error" && ((FOLLOW_ON.has(f.code) && namesMissing(f)) || (f.code === "groupingNameTaken" && signs.length > 0)));
    // a field missing, and exactly one field of its type in the data the view does not use: renamed?
    const typeOf = new Map((read.source?.fields ?? []).map((f) => [String(f.name).toLowerCase(), f.type]));
    const wantedKeys = new Set(wanted.map((w) => String(w).toLowerCase()));
    const newOfType = (type) => columns.filter((c, i) => data.table.types[i] === type && !wantedKeys.has(c.toLowerCase()));
    const hints = missing
        .map((name) => {
            const near = closest(String(name), columns);
            if (near) return `missing: "${cut(name, NAME_LENGTH)}" (did you mean "${cut(near, NAME_LENGTH)}"?)`;
            const type = typeOf.get(String(name).toLowerCase());
            const fresh = type ? newOfType(type) : [];
            return fresh.length === 1 ? `missing: "${cut(name, NAME_LENGTH)}" (${type}); the data has a new ${type} field "${cut(fresh[0], NAME_LENGTH)}": renamed? --map ${quoteArg(`${cut(name, NAME_LENGTH)}=${cut(fresh[0], NAME_LENGTH)}`)}` : null;
        })
        .filter(Boolean);
    const signText = signs.map((s) => JSON.stringify(s)).join(", ");
    const details = [
        `the view uses: ${nameList(wanted)}`,
        `the data has: ${nameList(columns)}`,
        ...hints,
        ...(signs.length
            ? [
                  `it ${signs.length > 1 ? "looks like" : "may be"} an exported pivot result (${signText}), not the rows the report was made from:`,
                  "in the report, take Export → Source data → All rows as CSV, and give that file to --data",
                  "or give --data the file the report was made from, if you have it"
              ]
            : []),
        ...(followers.length ? [`and ${followers.length} more error${followers.length === 1 ? "" : "s"} from the missing fields (--json lists them)`] : [])
    ].map(printable);
    const mismatch = {
        severity: "error",
        code: "dataMismatch",
        path: "",
        message: printable(`${data.name} does not have the fields the view uses`),
        missing: missing.map((m) => printable(String(m))),
        dataFields: columns.map(printable),
        pivotResult: signs.length > 1,
        details
    };
    const first = out.findIndex((f) => f.severity === "error");
    const marked = out.map((f) => (followers.includes(f) ? { ...f, followsFrom: "dataMismatch" } : f));
    marked.splice(first < 0 ? marked.length : first, 0, mismatch);
    return marked;
}

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
    if (values.format && values.output) {
        // -o t.html -f csv would write CSV into an .html file: the name and the format must agree
        const ext = extname(values.output).slice(1).toLowerCase();
        if (Object.hasOwn(EXTENSIONS, ext) && EXTENSIONS[ext] !== values.format) {
            const name = shortName(values.output);
            throw new CliError("usage", "FORMAT_MISMATCH", `${name} names ${FORMAT_NAMES[EXTENSIONS[ext]]}, -f asks for ${FORMAT_NAMES[values.format]}: name it ${name.slice(0, name.length - ext.length)}${values.format}, or leave out -f`);
        }
    }
    const format = values.format ?? formatOf(values.output);
    if (!values.output && format === "xlsx" && ctx.io.stdout.isTTY) {
        throw new CliError("usage", "BINARY_TO_TERMINAL", "an XLSX file is not shown in a terminal: write it to a file with -o, or redirect stdout");
    }
    checkSaveView(values);
    const made = fromFields(values) ? await viewFromData(positionals, values, ctx, "render") : null;
    const view = made ? made.read : withMap(await readView(positionals, values, ctx), values);
    const data = made ? made.data : withViewTypes(await readData(values, ctx, view.sheet), viewFields(view.view));
    if (!data) {
        throw new CliError("usage", "MISSING_DATA", "render needs data: --data <file> or --data -");
    }
    const findings = [...data.notes, ...(made?.findings ?? /** @type {any} */ (view).findings ?? []), ...ignoredOptions(values, format)];
    const template = values.template !== undefined ? textOf(await ctx.readInput(values.template, "the template", TEMPLATE_BYTES, "template")) : undefined;
    const echarts = format === "svg" || format === "html" ? await import("echarts") : undefined;
    const width = intOption("width", values.width, 100, 8000);
    const height = intOption("height", values.height, 100, 8000);
    const env = {
        ...operationEnv(ctx, data),
        ...(echarts ? { echarts } : {}),
        // the command line's own render options: the template file, --lenient, the byte order mark, the chart's size
        renderOptions: {
            strict: !values.lenient,
            ...(template !== undefined ? { template } : {}),
            // a byte order mark lets Excel read a CSV file as UTF-8; a program reading stdout gets none
            ...(format === "csv" ? { bom: values.bom === "on" || ((values.bom ?? "auto") === "auto" && Boolean(values.output)) } : {}),
            ...(width || height ? { size: { ...(width ? { width } : {}), ...(height ? { height } : {}) } } : {})
        }
    };
    const input = { source: data.name, view: view.view, format, ...(values.title !== undefined ? { title: values.title } : {}), ...(values.chart ? { chart: values.chart } : {}) };
    const { result, file: rendered } = await runOperation("render_view", input, env, values.template);
    // the view's findings (the data's notes are in already), explained against the data
    const viewFindings = result.findings.filter((f) => !data.notes.includes(f));
    findings.push(...withJsonPosition(explain(viewFindings, view.view, data), view.view));
    const errors = findings.filter((f) => f.severity === "error").length;
    const mismatch = findings.some((f) => f.code === "dataMismatch");
    // filters that keep no row give a table of zeros: said, not left for the reader to wonder
    const s = result.summary;
    if (s && s.sourceRows > 0 && s.keptRows === 0 && errors === 0) {
        const read = fromViewFile(typeof view.view === "string" ? view.view : JSON.stringify(view.view));
        const dated = /** @type {any[]} */ (read.view?.filters ?? []).some((f) => f?.type === "relative");
        findings.push({ severity: "warning", code: "noRowsKept", path: "", message: printable(`the filters keep none of the ${s.sourceRows.toLocaleString("en-US")} rows of ${data.name}${dated ? " (a date filter counts from --now or today)" : ""}`) });
    }
    const failed = findings.some((f) => f.severity === "error" || (values.strict && f.severity === "warning"));
    /** @type {any} */
    const extra = { summary: result.summary, sheet: data.sheet, ...(made?.picks.length ? { draft: true, picks: made.picks } : {}) };
    const saved = rendered && values["save-view"] !== undefined && !(failed && !values.lenient) ? await saveView(view, data, values, ctx) : null;
    if (saved) {
        extra.savedView = saved;
    }
    if (rendered && !(failed && !values.lenient)) {
        if (values.output) {
            try {
                await writeSafe(values.output, rendered.bytes, { cwd: ctx.io.cwd, allow: ctx.allow });
            } catch (e) {
                const error = asCliError(e, values.output);
                // -o /dev/stdout: a device is never replaced, and stdout is where the output goes without -o
                throw error.code === "SPECIAL_FILE" ? new CliError(error.kind, error.code, `${error.message}; to write to stdout, leave out -o`) : error;
            }
            extra.output = { file: shortName(values.output), format, mediaType: result.mediaType, bytes: rendered.bytes.length };
        } else {
            ctx.io.stdout.write(rendered.bytes);
            if (format === "html" && ctx.io.stdout.isTTY && !values.quiet) {
                ctx.io.stderr.write("an HTML report was written to the terminal: add -o report.html to save it\n");
            }
        }
    } else {
        extra.output = null;
    }
    if (extra.output === null) {
        return { findings, extra, note: "nothing written: the view has errors.", noteIsError: true };
    }
    if (!extra.output) {
        const lines = [...(made?.lines ?? []), ...(saved ? [`wrote ${saved.file}: the view, to render again with pivotkit render ${quoteArg(saved.file)} --data ${quoteArg(data.name)}`] : [])];
        return { findings, extra, note: lines.length ? lines.join("\n") : null };
    }
    const file = extra.output.file;
    if (failed) {
        return { findings, extra, note: `wrote ${file} despite ${errors} error${errors === 1 ? "" : "s"} (--lenient)${mismatch ? ": the data lacks the view's fields, so the report shows none of them" : ""}` };
    }
    const summary = result.summary;
    const lines = [...(made?.lines ?? []), `wrote ${file}: ${FORMAT_NAMES[format]}${summary ? `, ${summary.rows} rows x ${summary.columns} columns, from ${summary.sourceRows.toLocaleString("en-US")} rows of ${data.name}` : ""}`, ...(saved ? [`wrote ${saved.file}: the view, to render again with pivotkit render ${quoteArg(saved.file)} --data ${quoteArg(data.name)}`] : [])];
    return { findings, extra, note: lines.join("\n") };
}

/** -o and --save-view naming the same file would write the view over the report: refused first. */
function checkSaveView(values) {
    const save = values["save-view"];
    if (save === undefined) {
        return;
    }
    if (values.output !== undefined && resolvePath(values.output) === resolvePath(save)) {
        throw new CliError("usage", "SAME_FILE", "-o and --save-view name the same file: give the view file another name");
    }
    if (!/\.json$/i.test(save)) {
        throw new CliError("usage", "UNKNOWN_EXTENSION", `--save-view ${shortName(save)}: a view file is JSON: name it <name>.pivotkit.json`);
    }
}

/**
 * --save-view: the view rendered (normalized) as a view file for the data it ran on, the source named
 * as the browser names the file, with the workbook's sheet.
 */
async function saveView(view, data, values, ctx) {
    const encoded = encode(data.table, { ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}), ...(Object.keys(ctx.limits).length ? { limits: ctx.limits } : {}) });
    const read = fromViewFile(typeof view.view === "string" ? view.view : JSON.stringify(view.view));
    const viewUsed = normalized(/** @type {any} */ (read.view ?? {}), encoded, outsideLimits(ctx.limits));
    const name = values.title ?? (read.name || "");
    const file = await viewFileFor(viewUsed, data, encoded, { name, ...(read.description ? { description: read.description } : {}), version: versions()["pivotkit-cli"] });
    const bytes = new TextEncoder().encode(viewFileText(file));
    try {
        await writeSafe(values["save-view"], bytes, { cwd: ctx.io.cwd, allow: ctx.allow });
    } catch (e) {
        throw asCliError(e, values["save-view"]);
    }
    return { file: shortName(values["save-view"]), bytes: bytes.length };
}

/**
 * --map on a view read from a file, a link or the argument: its fields renamed (renameFields), the
 * types its view file lists too; a name the view does not use is a warning (unusedMap).
 * @param {{ view: unknown, name: string, source: string, sheet: string | null }} view
 * @param {Record<string, any>} values
 */
function withMap(view, values) {
    if (!values.map?.length) {
        return view;
    }
    const read = fromViewFile(typeof view.view === "string" ? view.view : JSON.stringify(view.view));
    if (read.failed || !read.view) {
        return view;
    }
    const map = /** @type {Record<string, string>} */ (mapOf(values.map, [...viewFileFields(read.view), ...(read.source?.fields ?? []).map((f) => f.name)]));
    let renamed;
    try {
        renamed = renameFields(read.view, map);
    } catch (e) {
        throw new CliError("usage", "BAD_VALUE", `--map: ${printable(String(e.message).replace(/^renameFields: /, ""))}`);
    }
    const lower = new Map(Object.entries(map).map(([from, to]) => [from.toLowerCase(), to]));
    const fields = (read.source?.fields ?? []).map((f) => ({ ...f, name: lower.get(f.name.toLowerCase()) ?? f.name }));
    const unusedInFields = new Set(fields.length ? (read.source?.fields ?? []).map((f) => f.name.toLowerCase()) : []);
    const file = { format: VIEW_FILE_FORMAT, formatVersion: 2, name: read.name, ...(read.description ? { description: read.description } : {}), source: { ...(read.source ?? {}), fields }, view: renamed.view };
    const findings = renamed.unused.filter((n) => !unusedInFields.has(n.toLowerCase())).map((n) => ({ severity: "warning", code: "unusedMap", path: "", message: printable(`--map ${n}=...: the view uses no field ${JSON.stringify(n)}`) }));
    return { ...view, view: JSON.stringify(file), findings };
}

/**
 * render or describe with layout flags or --suggest: the data (the argument or --data), the view made
 * from its fields, the findings that came with it, and the lines that say what was picked.
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {"render" | "describe"} command
 */
async function viewFromData(positionals, values, ctx, command) {
    const flag = ["suggest", "rows", "cols", "values", "group", "filter", "chart-type"].find((f) => values[f] !== undefined);
    const notBoth = () => new CliError("usage", "VIEW_AND_LAYOUT", `--${flag} makes the view from the data's fields: give a view or layout flags, not both (to change a view file, edit it, or start from pivotkit describe <data> --suggest)`);
    if (values.link !== undefined) {
        throw notBoth();
    }
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `${command} takes one data file, not ${positionals.length}`);
    }
    const arg = positionals[0];
    if (arg !== undefined && values.data !== undefined) {
        const dataLike = ["csv", "tsv", "txt", "xlsx"].includes(extname(arg).slice(1).toLowerCase()) || resolvePath(arg) === resolvePath(values.data);
        throw dataLike ? new CliError("usage", "DATA_TWICE", `the data twice: give it as the argument (${shortName(arg)}) or with --data, not both`) : notBoth();
    }
    const input = arg ?? values.data;
    if (input === undefined) {
        throw new CliError("usage", "MISSING_DATA", `--${flag} needs the data: pivotkit ${command} <data> --${flag} ...`);
    }
    const data = await readData({ ...values, data: input }, ctx);
    const built = await layoutView(data, values, ctx, { sheets: data.sheets, command, input });
    const draft = Boolean(values.suggest);
    const tool = `pivotkit ${command} --suggest`;
    const name = draft ? `Draft: ${built.name}` : built.name;
    const description = draft ? `A draft suggested by ${tool} from the fields of ${data.name}: check what it shows, then change it in the report or with the layout flags.` : "";
    const fields = data.table.columns.map((c, i) => ({ name: String(c), type: data.table.types[i] }));
    const lines = draft ? pickLines(built.view, `pivotkit ${command} ${quoteArg(shortName(input))} --suggest`, fields) : [];
    const file = { format: VIEW_FILE_FORMAT, formatVersion: 2, name, ...(description ? { description } : {}), view: built.view };
    return { data, built, findings: built.findings, picks: built.picks, lines, name, description, read: { view: JSON.stringify(file), name, source: "layout", sheet: data.sheet } };
}

/** What each output format is, for the line that says what was written. */
const FORMAT_NAMES = Object.freeze({ html: "an HTML report", csv: "a CSV file", json: "a JSON file", xlsx: "an Excel workbook", svg: "an SVG chart" });

/**
 * A view that is not JSON: where its JSON stops ("at line 2, column 30"), added to the finding that
 * says so.
 * @param {any[]} findings
 * @param {unknown} viewText
 */
function withJsonPosition(findings, viewText) {
    if (typeof viewText !== "string" || !findings.some((f) => /not valid JSON/.test(f.message))) {
        return findings;
    }
    let at = "";
    try {
        JSON.parse(viewText);
    } catch (e) {
        const position = Number(/position (\d+)/.exec(String(e.message))?.[1]);
        if (Number.isInteger(position)) {
            const before = viewText.slice(0, position).split("\n");
            at = ` at line ${before.length}, column ${before.at(-1).length + 1}`;
        }
    }
    return findings.map((f) => (at && /not valid JSON/.test(f.message) ? { ...f, message: printable(f.message.replace("not valid JSON", `not valid JSON${at}`)) } : f));
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
    const fields = data ? null : listedFields(view);
    if (!data && fields === null) {
        throw new CliError("usage", "MISSING_DATA", "validate needs data (--data) or a view file that lists its fields (source.fields)");
    }
    const { result } = await runOperation("validate_view", { source: data?.name || "view file", view: view.view }, operationEnv(ctx, data, fields));
    const { findings: all, ...extra } = result;
    const notes = data?.notes ?? [];
    const fileFindings = all.filter((f) => !notes.includes(f) && f.code === "viewFile");
    const viewFindings = all.filter((f) => !notes.includes(f) && f.code !== "viewFile");
    if (fileFindings.some((f) => f.severity === "error")) {
        return { findings: withJsonPosition(fileFindings, view.view), extra };
    }
    const findings = [...notes, ...fileFindings, ...(data ? explain(viewFindings, view.view, data) : viewFindings)];
    // what was checked, said when it is valid (an invalid view says so through its errors)
    const warnings = viewFindings.filter((f) => f.severity === "warning").length;
    const counted = (n, word) => (n === 0 ? `no ${word}s` : `${n} ${word}${n === 1 ? "" : "s"}`);
    const note = !result.valid ? null : data ? `valid: no errors, ${counted(warnings, "warning")} (with ${data.name})` : "valid against the fields the view file lists (source.fields), not against data: give --data to check it with the data";
    return { findings, extra: { ...extra, sheet: data?.sheet ?? null }, note };
}

/** The fields a view file lists (source.fields), or null: a view's schema when there is no data. */
function listedFields(view) {
    const read = fromViewFile(typeof view.view === "string" ? view.view : JSON.stringify(view.view));
    // a view that cannot be read has no fields, but its finding comes from the operation
    return read.failed ? [] : read.source?.fields?.length ? read.source.fields : null;
}

async function describeCommand(positionals, values, ctx) {
    if (values.suggest) {
        return suggestCommand(positionals, values, ctx);
    }
    const onlySuggest = ["output", "lenient", "map", "save-view"].find((f) => values[f] !== undefined) ?? (hasLayoutFlags(values) ? ["rows", "cols", "values", "group", "filter", "chart-type"].find((f) => values[f] !== undefined) : undefined);
    if (onlySuggest) {
        throw new CliError("usage", "NEEDS_SUGGEST", `--${onlySuggest} acts with --suggest only: pivotkit describe <data> --suggest --${onlySuggest} ...`);
    }
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
        // the sheet the view was made on (source.params.sheet), read from its view file
        const viewFile = fromViewFile(view);
        const sheetOfView = !viewFile.failed && typeof viewFile.source?.params?.sheet === "string" ? viewFile.source.params.sheet : null;
        const data = withViewTypes(await readData(values, ctx, sheetOfView), viewFields(view));
        const fields = data ? null : listedFields({ view });
        if (!data && fields === null) {
            throw new CliError("usage", "MISSING_DATA", "describing a view needs its data (--data) or a view file that lists its fields (source.fields)");
        }
        const { result } = await runOperation("describe_view", { source: data?.name || "view file", view }, operationEnv(ctx, data, fields));
        const { findings, ...extra } = result;
        if (!values.json && result.description) {
            ctx.io.stdout.write(`${printable(result.name || "view")}: ${printable(result.description.text)}\n`);
        }
        const notes = data?.notes ?? [];
        const viewFindings = findings.filter((f) => !notes.includes(f));
        return { findings: [...notes, ...(data ? explain(viewFindings, view, data) : viewFindings)], extra: { kind, ...extra, sheet: data?.sheet ?? null } };
    }
    // data: the bytes or the text read above (JSON that is no view), else the file
    const known = bytes ?? (text !== null ? new TextEncoder().encode(text) : null);
    const data = await readData({ ...values, data: input, "data-format": values["data-format"] ?? (known ? "json" : undefined) }, known ? withBytes(ctx, input, known) : ctx);
    const { result } = await runOperation("describe_source", { source: data.name, items }, operationEnv(ctx, data));
    // what describeSource gives (the examples are for a model, not for a log)
    const summary = { rows: result.rows, fields: result.fields, text: result.text };
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

/**
 * describe <data> --suggest: a draft view of the data as a view file, on stdout or into -o; what was
 * picked and what to run next on stderr. Nothing to group by is an error (noSuggestion): no file
 * without --lenient.
 */
async function suggestCommand(positionals, values, ctx) {
    if (values.as === "view") {
        throw new CliError("usage", "BAD_VALUE", "--suggest makes a view from data: leave out --as view");
    }
    if (values["save-view"] !== undefined) {
        throw new CliError("usage", "BAD_VALUE", "describe --suggest writes the view with -o; --save-view is render's");
    }
    const made = await viewFromData(positionals, values, ctx, "describe");
    const { data, built } = made;
    const { errors, warnings } = validate(built.view, built.encoded, { limits: outsideLimits(ctx.limits) });
    const findings = [...data.notes, ...made.findings, ...errors.map(findingOf), ...warnings.map(findingOf)];
    const failed = findings.some((f) => f.severity === "error" || (values.strict && f.severity === "warning"));
    const file = await viewFileFor(normalized(built.view, built.encoded, ctx.limits), data, built.encoded, { name: made.name, description: made.description, version: versions()["pivotkit-cli"] });
    const text = viewFileText(file);
    const sheets = data.sheets ? await data.sheets() : null;
    /** @type {any} */
    const extra = { kind: "data", draft: true, picks: built.picks, sheet: data.sheet, ...(sheets ? { sheets } : {}) };
    const input = shortName(positionals[0] ?? values.data);
    if (failed && !values.lenient) {
        return { findings, extra: { ...extra, output: null }, note: "nothing written: the draft has errors.", noteIsError: true };
    }
    if (values.output !== undefined) {
        const bytes = new TextEncoder().encode(text);
        try {
            await writeSafe(values.output, bytes, { cwd: ctx.io.cwd, allow: ctx.allow });
        } catch (e) {
            throw asCliError(e, values.output);
        }
        const out = shortName(values.output);
        extra.output = { file: out, bytes: bytes.length };
        const report = out.replace(/(\.pivotkit)?\.json$/i, "") + ".html";
        return { findings, extra, note: [...made.lines, `wrote ${out}: a draft view of ${data.name}${failed ? " despite its errors (--lenient)" : ""}`, `next: pivotkit render ${quoteArg(out)} --data ${quoteArg(input)}${data.sheet ? "" : ""} -o ${quoteArg(report)}`].join("\n") };
    }
    if (values.json) {
        extra.view = file;
    } else {
        ctx.io.stdout.write(text);
    }
    const save = input.replace(/\.[^.]+$/, "") + ".pivotkit.json";
    return { findings, extra, note: [...made.lines, `next: pivotkit describe ${quoteArg(input)} --suggest -o ${quoteArg(save)}`].join("\n") };
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

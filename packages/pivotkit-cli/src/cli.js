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
import { DEFAULT_LABELS, LIMITS, OUTSIDE_LIMITS, REPORT_LABELS, VIEW_FILE_FORMAT, closest, encode, fromViewFile, viewFileFields } from "pivotkit-core";
import { IMPORT_TYPES, retype } from "pivotkit-core/import";
import { readViewLink } from "pivotkit-core/link";
import { RENDER_FORMATS } from "pivotkit-report";
import { OPERATIONS } from "pivotkit-report/operations";
import { COMMANDS, DOCS, SHELLS, optionsOf } from "./commands.js";
import { CliError, asCliError, printable, shortName } from "./errors.js";
import { examples, tryLine, writeExample } from "./examples.js";
import { completionScript, helpText } from "./help.js";
import { readTable } from "./files.js";
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
    try {
        const { table, notes } = await readTable(bytes, path === "-" ? "stdin" : basename(path), { format, ...(values.sheet ? { sheet: values.sheet } : {}), ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}), ...(Object.keys(ctx.limits).length ? { limits: ctx.limits } : {}) });
        return { table, name: path === "-" ? "stdin" : basename(path), notes };
    } catch (e) {
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
            return fresh.length === 1 ? `missing: "${cut(name, NAME_LENGTH)}" (${type}); the data has a new ${type} field "${cut(fresh[0], NAME_LENGTH)}": renamed?` : null;
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
    const view = await readView(positionals, values, ctx);
    const data = withViewTypes(await readData(values, ctx), viewFields(view.view));
    if (!data) {
        throw new CliError("usage", "MISSING_DATA", "render needs data: --data <file> or --data -");
    }
    const findings = [...data.notes, ...ignoredOptions(values, format)];
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
    const extra = { summary: result.summary };
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
        return { findings, extra, note: null };
    }
    const file = extra.output.file;
    if (failed) {
        return { findings, extra, note: `wrote ${file} despite ${errors} error${errors === 1 ? "" : "s"} (--lenient)${mismatch ? ": the data lacks the view's fields, so the report shows none of them" : ""}` };
    }
    const summary = result.summary;
    return { findings, extra, note: `wrote ${file}: ${FORMAT_NAMES[format]}${summary ? `, ${summary.rows} rows x ${summary.columns} columns, from ${summary.sourceRows.toLocaleString("en-US")} rows of ${data.name}` : ""}` };
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
    const data = withViewTypes(await readData(values, ctx), viewFields(view.view));
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
    return { findings, extra, note };
}

/** The fields a view file lists (source.fields), or null: a view's schema when there is no data. */
function listedFields(view) {
    const read = fromViewFile(typeof view.view === "string" ? view.view : JSON.stringify(view.view));
    // a view that cannot be read has no fields, but its finding comes from the operation
    return read.failed ? [] : read.source?.fields?.length ? read.source.fields : null;
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
        const data = withViewTypes(await readData(values, ctx), viewFields(view));
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
        return { findings: [...notes, ...(data ? explain(viewFindings, view, data) : viewFindings)], extra: { kind, ...extra } };
    }
    // data: the bytes or the text read above (JSON that is no view), else the file
    const known = bytes ?? (text !== null ? new TextEncoder().encode(text) : null);
    const data = await readData({ ...values, data: input, "data-format": values["data-format"] ?? (known ? "json" : undefined) }, known ? withBytes(ctx, input, known) : ctx);
    const { result } = await runOperation("describe_source", { source: data.name, items }, operationEnv(ctx, data));
    // what describeSource gives (the examples are for a model, not for a log)
    const summary = { rows: result.rows, fields: result.fields, text: result.text };
    if (!values.json) {
        ctx.io.stdout.write(`${printable(summary.text)}\n`);
        for (const f of summary.fields) {
            ctx.io.stdout.write(`  ${printable(f.text)}${f.items?.length ? `; e.g. ${f.items.map((v) => printable(JSON.stringify(v))).join(", ")}` : ""}\n`);
        }
    }
    return { findings: data.notes, extra: { kind: "data", description: summary } };
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

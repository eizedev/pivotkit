/*
 * The runners' flags: one table per runner (pivotkit-mcp's FLAGS, pivotkit-server's SERVER_FLAGS),
 * the help made from it, and optionsFrom(), which reads the configuration file and the flags into
 * options (a flag wins; lists add to the file's).
 */

import { parseArgs } from "node:util";
import { closest } from "pivotkit-core";
import { ConfigError, loadConfig, validateOptions } from "./config.js";

/**
 * @typedef {{ type: "string" | "boolean", multiple?: boolean, short?: string, value?: string, text: string }} Flag
 * @typedef {Readonly<Record<string, Flag>>} FlagTable
 */

/**
 * The flags both runners take, defined once: the HTTP ones (`http`) say what they set, without the
 * runner's own words around them (pivotkit-mcp puts "HTTP: " before them, since it serves stdio by
 * default).
 */
/** @type {Readonly<{ source: Flag, output: Flag, http: FlagTable, log: Flag, "check-config": Flag, help: Flag }>} */
export const SHARED_FLAGS = Object.freeze({
    source: { type: "string", multiple: true, value: "id=file", text: "A source: its id and a CSV, TSV, JSON or XLSX file (may be given more than once)." },
    output: { type: "string", value: "dir", text: "Write reports and drafts into this directory (made at start if missing)." },
    http: /** @type {FlagTable} */ (Object.freeze({
        host: { type: "string", value: "address", text: "The address to listen on (default 127.0.0.1)." },
        port: { type: "string", value: "n", text: "The port (default 3333)." },
        "public-url": { type: "string", value: "url", text: "The server's address as clients reach it (behind a proxy)." },
        auth: { type: "string", value: "mode", text: "none, token or oauth (oauth settings are in the configuration file)." },
        "allow-unauthenticated": { type: "boolean", text: "Allow auth none on an address other than loopback." },
        "allow-host": { type: "string", multiple: true, value: "name", text: "A host name clients use (besides localhost and the public URL's)." },
        "allow-origin": { type: "string", multiple: true, value: "name", text: "A browser origin's host name allowed to call MCP (none by default)." }
    })),
    log: { type: "string", value: "level", text: "info (default), debug or off; the log is JSON lines on stderr." },
    "check-config": { type: "boolean", text: "Print whether the server starts and what it would expose, then exit (1 when there is a PROBLEM)." },
    help: { type: "boolean", short: "h", text: "Print this help and exit." }
});

/**
 * The shared HTTP flags with a prefix before each text ("HTTP: ").
 * @param {string} prefix
 */
/** @returns {Record<string, Flag>} */
export const httpFlags = (prefix = "") => Object.fromEntries(Object.entries(SHARED_FLAGS.http).map(([name, f]) => [name, { ...f, text: prefix ? `${prefix}${f.text[0].toLowerCase()}${f.text.slice(1)}` : f.text }]));

/** The flags of `pivotkit-server serve` and `check-config`. */
/** @type {FlagTable} */
export const SERVER_FLAGS = Object.freeze({
    config: { type: "string", value: "file", text: "The configuration file (JSON); default $PIVOTKIT_CONFIG." },
    source: SHARED_FLAGS.source,
    output: SHARED_FLAGS.output,
    enable: { type: "string", value: "list", text: "What to serve: rest, mcp or rest,mcp (default rest, and mcp when pivotkit-mcp is installed)." },
    ...httpFlags(),
    log: SHARED_FLAGS.log,
    "check-config": SHARED_FLAGS["check-config"],
    help: SHARED_FLAGS.help
});

/** The modes --auth takes. */
const AUTH_MODES = Object.freeze(["none", "token", "oauth"]);

/** The end of a usage error, the same in every program: where its help is. */
export const helpPointer = (program) => `run "${program} --help"`;

/** A flag table as help lines. */
export const flagLines = (flags) => Object.entries(flags).map(([name, f]) => `  --${name}${f.value ? ` <${f.value}>` : ""}`.padEnd(32) + f.text);

/**
 * The options from the configuration file and the flags (a flag wins; lists add to the file's).
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 * @param {{ flags: FlagTable, configEnv: string, program?: string }} runner  its flags, the variable that names its configuration file, its name for the pointer to --help
 */
export async function optionsFrom(argv, env, { flags, configEnv, program = "pivotkit-server" }) {
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: /** @type {any} */ (flags), allowPositionals: false, strict: true });
    } catch (e) {
        const flag = /'(-{1,2}[^'\s]+)'/.exec(String(e.message))?.[1] ?? "";
        const near = closest(flag.replace(/^-+/, ""), Object.keys(flags));
        const what = e.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? `unknown option ${JSON.stringify(flag.slice(0, 40))}` : String(e.message).split("\n")[0].replace(/^./, (c) => c.toLowerCase());
        throw new ConfigError(`${what}; ${near ? `did you mean --${near}? ` : ""}${helpPointer(program)}`);
    }
    const values = /** @type {Record<string, any>} */ (parsed.values);
    // the flag's own words (auth.mode's, from a file, name the key)
    if (values.auth !== undefined && !AUTH_MODES.includes(values.auth)) {
        throw new ConfigError(`--auth must be ${AUTH_MODES.slice(0, -1).join(", ")} or ${AUTH_MODES.at(-1)}; ${helpPointer(program)}`);
    }
    const file = values.config ?? env[configEnv];
    /** @type {any} */
    const options = file ? await loadConfig(file) : {};
    for (const entry of values.source ?? []) {
        const at = entry.indexOf("=");
        if (at < 1) {
            throw new ConfigError(`--source takes id=file, not ${JSON.stringify(entry.slice(0, 80))}`);
        }
        options.sources = { ...options.sources, [entry.slice(0, at)]: { file: entry.slice(at + 1) } };
    }
    if (values["allow-dir"] || values["list-files"]) {
        options.files = { ...options.files, allowDirs: [...(options.files?.allowDirs ?? []), ...(values["allow-dir"] ?? [])], ...(values["list-files"] ? { list: true } : {}) };
    }
    if (values.output) {
        options.output = { ...options.output, dir: values.output };
    }
    const http = { ...options.http };
    if (values.host) http.host = values.host;
    if (values.port) {
        if (!/^\d{1,5}$/.test(values.port) || Number(values.port) > 65535) {
            throw new ConfigError("--port takes a port number");
        }
        http.port = Number(values.port);
    }
    if (values["public-url"]) http.publicUrl = values["public-url"];
    if (values["allow-host"]) http.allowHosts = [...(http.allowHosts ?? []), ...values["allow-host"]];
    if (values["allow-origin"]) http.allowOrigins = [...(http.allowOrigins ?? []), ...values["allow-origin"]];
    if (values.enable) http.enable = String(values.enable).split(",").map((s) => s.trim()).filter(Boolean);
    if (Object.keys(http).length) options.http = http;
    if (values.auth || values["allow-unauthenticated"]) {
        options.auth = { ...options.auth, ...(values.auth ? { mode: values.auth } : {}), ...(values["allow-unauthenticated"] ? { allowUnauthenticated: true } : {}) };
    }
    if (values.log) options.log = values.log;
    options.baseDir ??= process.cwd();
    validateOptions(options);
    return { options, values };
}

/*
 * The runners' flags: one table per runner (pivotkit-mcp's FLAGS, pivotkit-server's SERVER_FLAGS),
 * the help made from it, and optionsFrom(), which reads the configuration file and the flags into
 * options (a flag wins; lists add to the file's).
 */

import { parseArgs } from "node:util";
import { closest } from "pivotkit-core";
import { ConfigError, loadConfig, validateOptions } from "./config.js";

/**
 * @typedef {Readonly<Record<string, { type: "string" | "boolean", multiple?: boolean, short?: string, value?: string, text: string }>>} FlagTable
 */

/** The flags of `pivotkit-server serve` and `check-config`. */
/** @type {FlagTable} */
export const SERVER_FLAGS = Object.freeze({
    config: { type: "string", value: "file", text: "The configuration file (JSON); default $PIVOTKIT_CONFIG." },
    source: { type: "string", multiple: true, value: "id=file", text: "A source: its id and a CSV, TSV, JSON or XLSX file (may be given more than once)." },
    output: { type: "string", value: "dir", text: "Write reports and drafts into this directory." },
    enable: { type: "string", value: "list", text: "What to serve: rest, mcp or rest,mcp (default rest, and mcp when pivotkit-mcp is installed)." },
    host: { type: "string", value: "address", text: "The address to listen on (default 127.0.0.1)." },
    port: { type: "string", value: "n", text: "The port (default 3333)." },
    "public-url": { type: "string", value: "url", text: "The server's address as clients reach it (behind a proxy)." },
    auth: { type: "string", value: "mode", text: "none, token or oauth (oauth settings are in the configuration file)." },
    "allow-unauthenticated": { type: "boolean", text: "Allow auth none on an address other than loopback." },
    "allow-host": { type: "string", multiple: true, value: "name", text: "A host name clients use (besides localhost and the public URL's)." },
    "allow-origin": { type: "string", multiple: true, value: "name", text: "MCP: a browser origin's host name allowed to call (none by default)." },
    log: { type: "string", value: "level", text: "info (default), debug or off; the log is JSON lines on stderr." },
    "check-config": { type: "boolean", text: "Print what the server would expose and exit (1 when a file or directory it names is missing)." },
    help: { type: "boolean", short: "h", text: "Print this help and exit." }
});

/** A flag table as help lines. */
export const flagLines = (flags) => Object.entries(flags).map(([name, f]) => `  --${name}${f.value ? ` <${f.value}>` : ""}`.padEnd(32) + f.text);

/**
 * The options from the configuration file and the flags (a flag wins; lists add to the file's).
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 * @param {{ flags: FlagTable, configEnv: string }} runner  its flags and the variable that names its configuration file
 */
export async function optionsFrom(argv, env, { flags, configEnv }) {
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: /** @type {any} */ (flags), allowPositionals: false, strict: true });
    } catch (e) {
        const flag = /'(-{1,2}[^'\s]+)'/.exec(String(e.message))?.[1] ?? "";
        const near = closest(flag.replace(/^-+/, ""), Object.keys(flags));
        throw new ConfigError(`${String(e.message).split("\n")[0]}${near ? `; did you mean --${near}?` : ""}`);
    }
    const values = /** @type {Record<string, any>} */ (parsed.values);
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

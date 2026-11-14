/*
 * The runner `pivotkit-mcp`: reads the configuration file and the flags into options, then serves
 * over stdio (default) or Streamable HTTP (--http). `--check-config` prints what the server would
 * expose and exits. The flags are one table (FLAGS): the parser and the help are made from it.
 */

import { ConfigError, flagLines, optionsFrom as sharedOptionsFrom } from "pivotkit-server";
import { VERSION, createMcpContext } from "./context.js";

/** @type {Readonly<Record<string, { type: "string" | "boolean", multiple?: boolean, value?: string, text: string }>>} */
export const FLAGS = Object.freeze({
    config: { type: "string", value: "file", text: "The configuration file (JSON); default $PIVOTKIT_MCP_CONFIG." },
    source: { type: "string", multiple: true, value: "id=file", text: "A source: its id and a CSV, TSV, JSON or XLSX file (may be given more than once)." },
    "allow-dir": { type: "string", multiple: true, value: "dir", text: 'Let the model read data files in this directory by path ("file:..."); may be given more than once.' },
    "list-files": { type: "boolean", text: "List the data files of the allowed directories in list_sources." },
    output: { type: "string", value: "dir", text: "Write reports and drafts into this directory." },
    http: { type: "boolean", text: "Serve Streamable HTTP instead of stdio." },
    host: { type: "string", value: "address", text: "HTTP: the address to listen on (default 127.0.0.1)." },
    port: { type: "string", value: "n", text: "HTTP: the port (default 3333)." },
    "public-url": { type: "string", value: "url", text: "HTTP: the server's address as clients reach it (behind a proxy)." },
    auth: { type: "string", value: "mode", text: "HTTP: none, token or oauth (oauth settings are in the configuration file)." },
    "allow-unauthenticated": { type: "boolean", text: "HTTP: allow auth none on an address other than loopback." },
    "allow-host": { type: "string", multiple: true, value: "name", text: "HTTP: a host name clients use (besides localhost and the public URL's)." },
    "allow-origin": { type: "string", multiple: true, value: "name", text: "HTTP: a browser origin's host name allowed to call (none by default)." },
    log: { type: "string", value: "level", text: "info (default), debug or off; the log is JSON lines on stderr." },
    "check-config": { type: "boolean", text: "Print what the server would expose and exit (1 when a file or directory it names is missing)." },
    version: { type: "boolean", short: "v", text: "Print the version and exit." },
    help: { type: "boolean", short: "h", text: "Print this help and exit." }
});

/** The help text, from the table. */
export function helpText() {
    const lines = flagLines(FLAGS);
    return `pivotkit-mcp ${VERSION}: an MCP server for pivotkit reports.\n\nUsage: pivotkit-mcp [options]\n\n${lines.join("\n")}\n\nDocs: https://pivotkit.eize.dev/reference/mcp/\n`;
}

/**
 * The options from the configuration file and the flags (a flag wins; lists add to the file's).
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 */
export async function optionsFrom(argv, env) {
    return sharedOptionsFrom(argv, env, { flags: FLAGS, configEnv: "PIVOTKIT_MCP_CONFIG" });
}

/**
 * Runs the server; resolves when it has started (stdio, HTTP) or with the exit code (help, version,
 * check-config, an error).
 * @param {string[]} argv
 * @param {{ env: Record<string, string | undefined>, stdout: { write(t: string): unknown }, stderr: { write(t: string): unknown } }} io
 * @returns {Promise<number | null>}  an exit code, or null while it serves
 */
export async function run(argv, io) {
    try {
        if (argv.includes("--help") || argv.includes("-h")) {
            io.stdout.write(helpText());
            return 0;
        }
        if (argv.includes("--version") || argv.includes("-v")) {
            io.stdout.write(`pivotkit-mcp ${VERSION}\n`);
            return 0;
        }
        const { options, values } = await optionsFrom(argv, io.env);
        if (values["check-config"]) {
            const { checkConfig } = await import("pivotkit-server");
            const { text, problems } = await checkConfig(options, { http: Boolean(values.http), env: io.env });
            io.stdout.write(text);
            return problems ? 1 : 0;
        }
        if (values.http) {
            const { listen } = await import("./http.js");
            const server = await listen(options, { env: io.env, stderr: io.stderr });
            const stop = async () => {
                try {
                    await server.close();
                } finally {
                    process.exit(0);
                }
            };
            process.once("SIGINT", stop);
            process.once("SIGTERM", stop);
            return null;
        }
        const context = await createMcpContext(options, { showPaths: true, stderr: io.stderr });
        if ((options.auth?.mode ?? "none") !== "none" || options.http?.host || options.http?.port) {
            // stdio takes no credentials and listens nowhere (the authorization spec: from the environment)
            context.log.warn("auth and http settings do nothing over stdio; add --http to serve HTTP");
        }
        const { serveStdio } = await import("@modelcontextprotocol/server/stdio");
        context.log.info("started", { version: VERSION, transport: "stdio", sources: context.registry.ids().length, files: context.registry.allow.length > 0, output: Boolean(context.output) });
        serveStdio((ctx) => context.server(ctx), { legacy: "serve", onerror: (e) => context.log.error(e, { where: "stdio" }) });
        return null;
    } catch (e) {
        io.stderr.write(`pivotkit-mcp: ${e instanceof ConfigError ? e.message : `could not start: ${String(e?.message ?? e).slice(0, 300)}`}\n`);
        return 2;
    }
}

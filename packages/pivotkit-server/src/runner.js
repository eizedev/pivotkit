/*
 * The runner `pivotkit-server`: one command for the CLI, the REST service and the MCP server, as the
 * container image runs them.
 *
 *   pivotkit-server serve [flags]          HTTP: REST at /api/v1 (and MCP at /mcp with pivotkit-mcp)
 *   pivotkit-server check-config [flags]   what serve would expose, then exit
 *   pivotkit-server check-source <id> [--param name=value ...] [flags]   load an HTTP source once and say what came back
 *   pivotkit-server source-from-openapi <file or URL> --operation <id>    propose an HTTP source from an OpenAPI document
 *   pivotkit-server mcp [flags]            pivotkit-mcp's runner (stdio by default)
 *   pivotkit-server cli <command> ...      the command line pivotkit (pivotkit-cli)
 *   pivotkit-server healthcheck [url] [--port n]   exit 0 when the server answers /healthz (the image's HEALTHCHECK)
 *   pivotkit-server token new|show, key new   make and show credentials (credentials.js)
 */

import { ConfigError } from "./config.js";
import { configFrom } from "./state.js";
import { VERSION } from "./context.js";
import { CONFIG_ENV, SERVER_FLAGS, flagLines, helpPointer, optionsFrom, startFormatOf } from "./flags.js";
import { startErrorLine } from "./log.js";
import { stopOnSignals } from "./stop.js";
import { DEFAULT_PORT, TOKEN_ENV, loadMcp } from "./serve.js";

/** The variable that names the configuration file (flags.js's). */
export { CONFIG_ENV };

/** The subcommands, for the help. */
const COMMANDS = Object.freeze({
    serve: "Serve REST (and MCP, when pivotkit-mcp is installed) over HTTP.",
    "check-config": "Print whether serve starts and what it would expose, then exit (1 when there is a PROBLEM).",
    "check-source <id>": "Load an HTTP source once (--param name=value for its parameters) and print the backend's status, pages, rows and fields, never a value (1 when it fails).",
    "source-from-openapi <file|url>": "Propose an HTTP source block from one GET operation of an OpenAPI 3.0 or 3.1 document in JSON (--operation <operationId or 'GET /path'>, --id, --backend); TODO values for you to fill in.",
    mcp: "Run pivotkit-mcp (stdio by default; its own flags, pivotkit-mcp --help).",
    cli: "Run the command line pivotkit (pivotkit-server cli --help).",
    "healthcheck [url]": `Exit 0 when the server answers GET /healthz (default http://127.0.0.1:${DEFAULT_PORT}/healthz; pivotkit-server healthcheck --help).`,
    // credentials.js (loaded only for these)
    "token new": "Make a token for auth.tokens (--file, --add to put it into --config; pivotkit-server token --help).",
    "token show <name>": "Print the value of a token of auth.tokens (1 when it cannot be used).",
    "key new --for downloads|audit": "Make a key for output.downloads.key or audit.key (pivotkit-server key --help)."
});

/** --version, which the runner takes in place of a command (not one of serve's flags). */
const VERSION_FLAG = Object.freeze({ type: "boolean", text: "Print the version and exit." });

/** The flags as the help lists them: --version before --help, as pivotkit-mcp's. */
const FLAG_ORDER = (({ help, ...rest }) => ({ ...rest, version: VERSION_FLAG, help }))(SERVER_FLAGS);

/** The help text. */
export function helpText() {
    const commands = Object.entries(COMMANDS).map(([name, text]) => `  ${name.padEnd(34)}${text}`);
    return `pivotkit-server ${VERSION}: pivotkit's REST service, its MCP server and its command line in one.\n\nUsage: pivotkit-server <command> [options]\n       pivotkit-server --version\n\nCommands:\n${commands.join("\n")}\n\nOptions of serve, check-config and check-source:\n${flagLines(FLAG_ORDER).join("\n")}\n\nThe static token, when the configuration names none: $${TOKEN_ENV}.\nDocs: https://pivotkit.eize.dev/reference/rest/\n`;
}

/**
 * pivotkit-mcp's runner with this command's configuration variable passed on.
 * @param {string[]} argv
 * @param {any} io
 */
async function runMcp(argv, io) {
    const mcp = await loadMcp();
    if (!mcp) {
        io.stderr.write("pivotkit-server: mcp needs the package pivotkit-mcp beside pivotkit-server (npm install pivotkit-mcp)\n");
        return 2;
    }
    const env = io.env.PIVOTKIT_MCP_CONFIG || !io.env[CONFIG_ENV] ? io.env : { ...io.env, PIVOTKIT_MCP_CONFIG: io.env[CONFIG_ENV] };
    return mcp.run(argv, { ...io, env });
}

/**
 * $PIVOTKIT_PORT, or undefined when it is not set. A ConfigError when it holds what Kubernetes'
 * service links put there for a Service named pivotkit (tcp://<address>:<port>), which would
 * otherwise read as a port that is not a number.
 * @param {Record<string, string | undefined>} env
 */
function portOfEnv(env) {
    const value = env.PIVOTKIT_PORT;
    if (value && /^tcp:\/\//i.test(value)) {
        throw new ConfigError(`PIVOTKIT_PORT is "${value.slice(0, 80)}", which Kubernetes sets for a Service named pivotkit; set enableServiceLinks: false in the pod, or PIVOTKIT_PORT to the port number`);
    }
    return value || undefined;
}

/**
 * The port serve listens on (one rule for serve, check-config and healthcheck): the options' http.port
 * (--port, else the configuration file's), else $PIVOTKIT_PORT, else undefined (DEFAULT_PORT).
 * @param {{ http?: { port?: number } }} options
 * @param {Record<string, string | undefined>} env
 * @returns {number | undefined}
 */
function servePort(options, env) {
    if (options.http?.port !== undefined) {
        return options.http.port;
    }
    const fromEnv = portOfEnv(env);
    return fromEnv === undefined ? undefined : Number(fromEnv);
}

/** healthcheck's help. */
const HEALTHCHECK_HELP = `Usage: pivotkit-server healthcheck [url] [--port <port>]\n\nExit 0 when the server answers GET /healthz, else 1.\nWithout a url it asks http://127.0.0.1:<port>/healthz. The port: --port, then http.port of $${CONFIG_ENV}'s file, then $PIVOTKIT_PORT, then ${DEFAULT_PORT}.\n`;

/**
 * healthcheck: its arguments, then one GET. Every failure is 1: a container's health check reserves 2.
 * @param {string[]} argv
 * @param {any} io
 */
async function healthcheckCommand(argv, io) {
    if (argv.includes("--help") || argv.includes("-h")) {
        io.stdout.write(HEALTHCHECK_HELP);
        return 0;
    }
    const usage = (why) => {
        io.stderr.write(`pivotkit-server: healthcheck: ${why}; pivotkit-server healthcheck --help\n`);
        return 1;
    };
    let url;
    let port;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--port" || arg.startsWith("--port=")) {
            const value = arg === "--port" ? argv[++i] : arg.slice("--port=".length);
            if (!/^\d{1,5}$/.test(value ?? "") || Number(value) > 65535) {
                return usage("--port takes a port number");
            }
            port = Number(value);
        } else if (arg.startsWith("-")) {
            return usage(`unknown option ${JSON.stringify(arg.slice(0, 40))}`);
        } else if (url === undefined) {
            url = arg;
        } else {
            return usage("one url at most");
        }
    }
    if (url !== undefined) {
        return healthcheck(url, io);
    }
    if (port === undefined) {
        try {
            const configured = io.env[CONFIG_ENV] ? await configFrom({ fromEnv: io.env[CONFIG_ENV], stateDir: null }).then((c) => c?.options ?? {}, () => ({})) : {};
            port = servePort(configured, io.env);
        } catch (e) {
            io.stderr.write(`pivotkit-server: ${e.message}\n`);
            return 1;
        }
    }
    return healthcheck(`http://127.0.0.1:${port ?? DEFAULT_PORT}/healthz`, io);
}

/** GET a health address; 0 when it answers 200. */
async function healthcheck(url, io) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
        await response.body?.cancel().catch(() => undefined);
        if (response.ok) {
            return 0;
        }
        io.stderr.write(`pivotkit-server: ${url} answered ${response.status}\n`);
    } catch (e) {
        io.stderr.write(`pivotkit-server: ${url}: ${String(e?.cause?.code ?? e?.message ?? e).slice(0, 200)}\n`);
    }
    return 1;
}

/**
 * check-source: one load of an HTTP source; 0 when it worked, 1 when not.
 * @param {string[]} argv  the source's id, --param name=value, and the flags of serve
 * @param {any} io
 */
async function checkSourceCommand(argv, io) {
    if (argv.includes("--help") || argv.includes("-h")) {
        io.stdout.write(helpText());
        return 0;
    }
    const { checkSource, paramFlags, sourceArgs } = await import("./check-source.js");
    let parts;
    let given;
    try {
        parts = paramFlags(argv);
        given = sourceArgs(parts.rest, SERVER_FLAGS);
    } catch (e) {
        throw new ConfigError(/** @type {Error} */ (e).message);
    }
    if (!given.id) {
        throw new ConfigError("check-source takes a source's id: pivotkit-server check-source <id> [--param name=value ...] [--config file]");
    }
    const { options } = await optionsFrom(given.flags, io.env, { flags: SERVER_FLAGS, configEnv: CONFIG_ENV });
    const { text, ok, usage } = await checkSource(options, given.id, parts.params, { env: io.env });
    (usage ? io.stderr : io.stdout).write(usage ? `pivotkit-server: ${text}` : text);
    return ok ? 0 : usage ? 2 : 1;
}

/**
 * Runs a subcommand; resolves when it has started (serve, mcp) or with the exit code.
 * @param {string[]} argv
 * @param {{ env: Record<string, string | undefined>, stdout: { write(t: string): unknown }, stderr: { write(t: string): unknown, isTTY?: boolean }, stdin?: any, cwd?: string }} io
 * @returns {Promise<number | null>}  an exit code, or null while it serves
 */
export async function run(argv, io) {
    const [command, ...rest] = argv;
    try {
        if (!command || command === "--help" || command === "-h" || command === "help") {
            io.stdout.write(helpText());
            return command ? 0 : 2;
        }
        if (command === "--version" || command === "-v" || command === "version") {
            io.stdout.write(`pivotkit-server ${VERSION}\n`);
            return 0;
        }
        if (command === "cli") {
            const { main } = await import("pivotkit-cli");
            return main(rest, { stdin: io.stdin ?? process.stdin, stdout: io.stdout, stderr: io.stderr, env: io.env, cwd: io.cwd ?? process.cwd(), program: "pivotkit-server cli" });
        }
        if (command === "mcp") {
            return await runMcp(rest, io);
        }
        if (command === "healthcheck") {
            return await healthcheckCommand(rest, io);
        }
        if (command === "token" || command === "key") {
            const { credentialsCommand } = await import("./credentials.js");
            return await credentialsCommand(command, rest, io);
        }
        if (command === "check-source") {
            return await checkSourceCommand(rest, io);
        }
        if (command === "source-from-openapi") {
            // the generator is loaded only for this command, never by the server
            const { HELP, sourceFromOpenApiCommand } = await import("./openapi-source.js");
            if (rest.includes("--help") || rest.includes("-h")) {
                io.stdout.write(HELP);
                return 0;
            }
            return await sourceFromOpenApiCommand(rest, io);
        }
        if (command !== "serve" && command !== "check-config") {
            throw new ConfigError(`unknown ${command.startsWith("-") ? "option" : "command"} ${JSON.stringify(command.slice(0, 40))}; ${helpPointer("pivotkit-server")}`);
        }
        if (rest.includes("--help") || rest.includes("-h")) {
            io.stdout.write(helpText());
            return 0;
        }
        const { options, values, stateDir } = await optionsFrom(rest, io.env, { flags: SERVER_FLAGS, configEnv: CONFIG_ENV });
        const port = servePort(options, io.env);
        if (port !== undefined) {
            options.http = { ...options.http, port };
        }
        if (command === "check-config" || values["check-config"]) {
            const { checkConfig } = await import("./check.js");
            const { discover } = await import("./auth.js");
            const { text, problems } = await checkConfig(options, { http: true, env: io.env, name: "pivotkit-server", tokenEnv: TOKEN_ENV, stateDir, rest: (options.http?.enable ?? ["rest"]).includes("rest"), mcp: (options.http?.enable ?? ["rest", "mcp"]).includes("mcp"), discover });
            io.stdout.write(text);
            return problems ? 1 : 0;
        }
        const { serve } = await import("./serve.js");
        const server = await serve(options, { env: io.env, stderr: io.stderr, stateDir });
        stopOnSignals(server, { log: server.context.log, stderr: io.stderr, before: () => server.context.log.info("stopping: running requests may finish", { graceMs: options.http?.graceMs ?? 25_000 }) });
        return null;
    } catch (e) {
        const text = e instanceof ConfigError ? e.message : `could not start: ${String(e?.message ?? e).slice(0, 300)}`;
        // serve's error before its log exists: a JSON line where the log is asked to be JSON
        const line = command === "serve" ? startErrorLine(startFormatOf(rest, io.env, io.stderr), text, { service: "pivotkit-server", version: VERSION, code: e instanceof ConfigError ? "CONFIG" : "START" }) : null;
        io.stderr.write(line ?? `pivotkit-server: ${text}\n`);
        return 2;
    }
}

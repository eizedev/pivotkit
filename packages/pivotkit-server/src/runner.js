/*
 * The runner `pivotkit-server`: one command for the CLI, the REST service and the MCP server, as the
 * container image runs them.
 *
 *   pivotkit-server serve [flags]          HTTP: REST at /api/v1 (and MCP at /mcp with pivotkit-mcp)
 *   pivotkit-server check-config [flags]   what serve would expose, then exit
 *   pivotkit-server mcp [flags]            pivotkit-mcp's runner (stdio by default)
 *   pivotkit-server cli <command> ...      the command line pivotkit (pivotkit-cli)
 *   pivotkit-server healthcheck [url]      exit 0 when the server answers /healthz (the image's HEALTHCHECK)
 */

import { ConfigError, loadConfig } from "./config.js";
import { VERSION } from "./context.js";
import { SERVER_FLAGS, flagLines, optionsFrom } from "./flags.js";
import { DEFAULT_PORT, TOKEN_ENV, loadMcp } from "./serve.js";

/** The variable that names the configuration file. */
export const CONFIG_ENV = "PIVOTKIT_CONFIG";

/** The subcommands, for the help. */
const COMMANDS = Object.freeze({
    serve: "Serve REST (and MCP, when pivotkit-mcp is installed) over HTTP.",
    "check-config": "Print what serve would expose and exit (1 when a file or directory it names is missing).",
    mcp: "Run pivotkit-mcp (stdio by default; its own flags, pivotkit-mcp --help).",
    cli: "Run the command line pivotkit (pivotkit-server cli --help).",
    healthcheck: `Exit 0 when the server answers GET /healthz (default http://127.0.0.1:${DEFAULT_PORT}/healthz).`
});

/** The help text. */
export function helpText() {
    const commands = Object.entries(COMMANDS).map(([name, text]) => `  ${name.padEnd(30)}${text}`);
    return `pivotkit-server ${VERSION}: pivotkit's REST service, its MCP server and its command line in one.\n\nUsage: pivotkit-server <command> [options]\n\nCommands:\n${commands.join("\n")}\n\nOptions of serve and check-config:\n${flagLines(SERVER_FLAGS).join("\n")}\n\nThe static token, when the configuration names none: $${TOKEN_ENV}.\nDocs: https://pivotkit.eize.dev/reference/rest/\n`;
}

/**
 * pivotkit-mcp's runner with this command's configuration variable passed on.
 * @param {string[]} argv
 * @param {any} io
 */
async function runMcp(argv, io) {
    const mcp = await loadMcp().catch(() => null);
    if (!mcp) {
        io.stderr.write("pivotkit-server: mcp needs the package pivotkit-mcp beside pivotkit-server (npm install pivotkit-mcp)\n");
        return 2;
    }
    const env = io.env.PIVOTKIT_MCP_CONFIG || !io.env[CONFIG_ENV] ? io.env : { ...io.env, PIVOTKIT_MCP_CONFIG: io.env[CONFIG_ENV] };
    return mcp.run(argv, { ...io, env });
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
 * Runs a subcommand; resolves when it has started (serve, mcp) or with the exit code.
 * @param {string[]} argv
 * @param {{ env: Record<string, string | undefined>, stdout: { write(t: string): unknown }, stderr: { write(t: string): unknown }, stdin?: any, cwd?: string }} io
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
            return main(rest, { stdin: io.stdin ?? process.stdin, stdout: io.stdout, stderr: io.stderr, env: io.env, cwd: io.cwd ?? process.cwd() });
        }
        if (command === "mcp") {
            return runMcp(rest, io);
        }
        if (command === "healthcheck") {
            // the port serve listens on: $PIVOTKIT_PORT, else the configuration file's, else the default
            const configured = io.env[CONFIG_ENV] ? await loadConfig(io.env[CONFIG_ENV]).then((o) => o.http?.port, () => undefined) : undefined;
            const port = io.env.PIVOTKIT_PORT ?? String(configured ?? DEFAULT_PORT);
            return healthcheck(rest[0] ?? `http://127.0.0.1:${port}/healthz`, io);
        }
        if (command !== "serve" && command !== "check-config") {
            throw new ConfigError(`unknown command "${command.slice(0, 40)}"; the commands are ${Object.keys(COMMANDS).join(", ")}`);
        }
        if (rest.includes("--help") || rest.includes("-h")) {
            io.stdout.write(helpText());
            return 0;
        }
        const { options, values } = await optionsFrom(rest, io.env, { flags: SERVER_FLAGS, configEnv: CONFIG_ENV });
        if (io.env.PIVOTKIT_PORT && !values.port && options.http?.port === undefined) {
            options.http = { ...options.http, port: Number(io.env.PIVOTKIT_PORT) };
        }
        if (command === "check-config" || values["check-config"]) {
            const { checkConfig } = await import("./check.js");
            const { text, problems } = await checkConfig(options, { http: true, env: io.env, name: "pivotkit-server", tokenEnv: TOKEN_ENV, rest: (options.http?.enable ?? ["rest"]).includes("rest") });
            io.stdout.write(text);
            return problems ? 1 : 0;
        }
        const { serve } = await import("./serve.js");
        const server = await serve(options, { env: io.env, stderr: io.stderr });
        const stop = async () => {
            server.context.log.info("stopping: running requests may finish", { graceMs: options.http?.graceMs ?? 25_000 });
            try {
                await server.close();
            } finally {
                process.exit(0);
            }
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        return null;
    } catch (e) {
        io.stderr.write(`pivotkit-server: ${e instanceof ConfigError ? e.message : `could not start: ${String(e?.message ?? e).slice(0, 300)}`}\n`);
        return 2;
    }
}

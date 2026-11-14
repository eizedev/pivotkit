/*
 * The server's context: what every request of every front end shares (the options, the source
 * registry, the compute pool with its caches, the output directory, the log, the authentication).
 * Build it once; the MCP server (pivotkit-mcp) and the REST service (pivotkit-server/rest) both take
 * it.
 *
 *   const context = await createContext(options);
 *   const rest = await createRestHandler(context);   // pivotkit-server/rest
 */

import { createRequire } from "node:module";
import { access, constants, realpath, stat } from "node:fs/promises";
import { isInside } from "pivotkit-cli/files";
import { ConfigError, pathOf, validateOptions } from "./config.js";
import { createComputer } from "./compute.js";
import { createLog } from "./log.js";
import { createRegistry } from "./registry.js";
import { createAuthCore, profileOf } from "./auth.js";

/** The package's version. */
export const VERSION = createRequire(import.meta.url)("../package.json").version;

/**
 * @typedef {object} ContextRuntime
 * @property {boolean} [showPaths]  tell the caller a written file's full path (a local stdio server)
 * @property {{ write(text: string): unknown }} [stderr]  where the log goes (default process.stderr)
 * @property {string} [tokenEnv]  the variable of the one static token when auth.tokens is empty (default PIVOTKIT_MCP_TOKEN)
 */

/**
 * @typedef {object} ServerContext
 * @property {import("./config.js").ServerOptions} options
 * @property {any} registry  the sources (registry.js)
 * @property {any} computer  the compute pool (compute.js)
 * @property {{ dir: string, baseUrl: string | null, maxFiles: number, maxAgeDays: number, showPath: boolean } | null} output
 * @property {any} log  the log (log.js)
 * @property {string} authMode
 * @property {string} version
 * @property {(how: { env?: Record<string, string | undefined>, loopback: boolean }) => Promise<any>} auth
 * @property {() => Promise<{ ok: boolean, checks: Record<string, boolean> }>} ready
 * @property {() => Promise<void>} close
 */

/**
 * Builds the shared context.
 * @param {import("./config.js").ServerOptions} options
 * @param {ContextRuntime} [runtime]
 * @returns {Promise<ServerContext>}
 */
export async function createContext(options, runtime = {}) {
    validateOptions(options);
    const log = createLog(options.log ?? "info", runtime.stderr ?? process.stderr);
    const registry = await createRegistry(options).catch((e) => {
        throw e?.code === "ALLOW_DIR_NOT_FOUND" || e?.code === "ALLOW_DIR_NOT_DIRECTORY" ? new ConfigError(`files.allowDirs: ${e.message.replace(/^--allow-dir /, "")}`) : e;
    });
    let output = null;
    if (options.output?.dir) {
        const dir = await realpath(pathOf(options, options.output.dir)).catch(() => null);
        if (!dir || !(await stat(dir)).isDirectory()) {
            throw new ConfigError("output.dir: not found or not a directory (create it first)");
        }
        // a directory the model may read files from must not hold what it may not see: the results
        if (registry.allow.some((allowed) => isInside(dir, allowed) || isInside(allowed, dir))) {
            throw new ConfigError("output.dir: lies inside a directory of files.allowDirs (or holds one): the model could read the reports it was not shown; use a directory outside them");
        }
        output = { dir, baseUrl: options.output.baseUrl ?? null, maxFiles: options.output.maxFiles ?? 1000, maxAgeDays: options.output.maxAgeDays ?? 0, showPath: runtime.showPaths ?? false };
    }
    const computer = createComputer(options.compute);
    /** @type {Promise<any> | null} */
    let auth = null;
    return {
        options,
        registry,
        computer,
        output,
        log,
        authMode: options.auth?.mode ?? "none",
        version: VERSION,

        /**
         * The authentication every HTTP front end of this context shares, built on first use.
         * @param {{ env?: Record<string, string | undefined>, loopback: boolean }} how
         */
        auth(how) {
            auth ??= createAuthCore(options, { env: how.env ?? process.env, log, loopback: how.loopback, tokenEnv: runtime.tokenEnv ?? "PIVOTKIT_MCP_TOKEN" }).catch((e) => {
                auth = null;
                throw e;
            });
            return auth;
        },

        /** Whether the server can take work: the issuer loaded (OAuth), workers up, output writable. */
        async ready() {
            const core = auth ? await auth.catch(() => null) : null;
            const checks = {
                auth: core ? core.ready() : !auth,
                workers: computer.size() > 0,
                output: output ? await access(output.dir, constants.W_OK).then(() => true, () => false) : true
            };
            return { ok: Object.values(checks).every(Boolean), checks };
        },

        async close() {
            if (auth) {
                (await auth.catch(() => null))?.close();
            }
            await computer.close();
        }
    };
}

/**
 * Who calls, from the request's verified token: its scopes, how the log names it and its policy
 * profile.
 * @param {string} mode
 * @param {any} authInfo
 * @param {import("./config.js").AuthOptions} [authOptions]  for the OAuth client's and scopes' profiles
 * @returns {import("./registry.js").Caller}
 */
export function callerOf(mode, authInfo, authOptions = undefined) {
    if (mode === "none") {
        return { scopes: null, client: "local", profile: null };
    }
    if (!authInfo) {
        // a request that reached an operation without a verified token holds no scope: closed, not open
        return { scopes: new Set(), client: "unknown", profile: null };
    }
    const profile = profileOf(authOptions, authInfo);
    if (authInfo.extra?.allScopes) {
        return { scopes: null, client: String(authInfo.clientId ?? "token"), profile };
    }
    return { scopes: new Set(authInfo.scopes ?? []), client: String(authInfo.clientId ?? "client").slice(0, 80), profile };
}

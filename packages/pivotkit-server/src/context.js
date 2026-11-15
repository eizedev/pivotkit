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
import { access, constants, lstat, mkdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isInside } from "pivotkit-cli/files";
import { ConfigError, OUTPUT_DEFAULTS, pathOf, validateOptions } from "./config.js";
import { createComputer } from "./compute.js";
import { createLog } from "./log.js";
import { createRegistry } from "./registry.js";
import { callerOf, createAuthCore, identityKey } from "./auth.js";
import { offersOf } from "./sources/input.js";
import { prune } from "./output.js";

/** Why an output directory inside (or holding) an allowed directory is refused. */
export const OUTPUT_INSIDE_ALLOWED = "output.dir: lies inside a directory of files.allowDirs (or holds one): the model could read the reports it was not shown; use a directory outside them";

export { callerOf, identityKey };

/** The variable of the one static token when auth.tokens is empty. */
export const TOKEN_ENV = "PIVOTKIT_TOKEN";

/** The package's version. */
export const VERSION = createRequire(import.meta.url)("../package.json").version;

/**
 * @typedef {object} ContextRuntime
 * @property {boolean} [showPaths]  tell the caller a written file's full path (a local stdio server)
 * @property {{ write(text: string): unknown }} [stderr]  where the log goes (default process.stderr)
 * @property {string} [tokenEnv]  the variable of the one static token when auth.tokens is empty (default PIVOTKIT_TOKEN; pivotkit-mcp: PIVOTKIT_MCP_TOKEN)
 */

/**
 * @typedef {object} ServerContext
 * @property {import("./config.js").ServerOptions} options
 * @property {any} registry  the sources (registry.js)
 * @property {any} computer  the compute pool (compute.js)
 * @property {{ dir: string, baseUrl: string | null, maxFiles: number, maxMb: number, maxAgeDays: number, cleanUp: boolean, showPath: boolean } | null} output  cleanUp: the oldest reports may be deleted to make room (not where the operator's own files lie)
 * @property {any} log  the log (log.js)
 * @property {import("./sources/input.js").Offers} offers  the extra inputs each surface offers (fixed at start)
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
        const wanted = pathOf(options, options.output.dir);
        const missing = !(await stat(wanted).catch(() => null));
        if (missing && (await lstat(wanted).catch(() => null))) {
            throw new ConfigError("output.dir: a symbolic link to nothing (its target does not exist)");
        }
        if (missing && options.output.create === false) {
            throw new ConfigError("output.dir: not found (create it first, or leave output.create on)");
        }
        // where the directory is or will be, checked before anything is made, so a refused start
        // leaves nothing behind
        const planned = missing ? await plannedPath(wanted) : await realpath(wanted).catch(() => null);
        if (!planned || (!missing && !(await stat(planned)).isDirectory())) {
            throw new ConfigError("output.dir: not a directory");
        }
        // a directory the model may read files from must not hold what it may not see: the results
        const insideAllowed = (path) => registry.allow.some((allowed) => isInside(path, allowed) || isInside(allowed, path));
        if (insideAllowed(planned)) {
            throw new ConfigError(OUTPUT_INSIDE_ALLOWED);
        }
        if (missing) {
            const why = await cannotCreate(wanted);
            if (why) {
                throw new ConfigError(`output.dir: cannot be created: ${whyNot(why)}`);
            }
            // reports may hold what a model may not see: only the server's user reads them (0700),
            // unless a web server serves the directory (output.baseUrl): 0755, which the umask can
            // only narrow, never widen to others' writing. The log names no path (it never does): the
            // operator knows output.dir
            await mkdir(wanted, { recursive: true, mode: options.output.baseUrl ? 0o755 : 0o700 }).catch((e) => {
                throw new ConfigError(`output.dir: cannot be created: ${whyNot(e?.code)}`);
            });
            log.warn(`the output directory did not exist and was created (${options.output.baseUrl ? "mode 0755 narrowed by the umask: output.baseUrl is served" : "mode 0700"}); check output.dir if that was not meant`);
        }
        const dir = await realpath(wanted);
        // what was made may have come out elsewhere (a link changed in between): checked again
        if (insideAllowed(dir)) {
            throw new ConfigError(OUTPUT_INSIDE_ALLOWED);
        }
        // old reports are deleted by their extension (.csv, .json, ...): never where the operator's
        // own files lie, which have such names too
        const shared = (await ownFileDirs(options)).includes(dir);
        if (options.output.maxAgeDays && shared) {
            throw new ConfigError("output.dir: is the configuration's directory or holds a source, template or token file, which output.maxAgeDays could delete with the old reports; give the reports a directory of their own");
        }
        if (shared) {
            log.warn("output.dir is the configuration's directory or holds a source, template or token file: reports there are never deleted to make room, so a full directory refuses new ones; give the reports a directory of their own");
        }
        if (!(await writable(dir))) {
            log.warn("output.dir is not writable by the server's user: every report will fail with NO_OUTPUT until its owner or mode is fixed");
        }
        output = { dir, baseUrl: options.output.baseUrl ?? null, maxFiles: options.output.maxFiles ?? OUTPUT_DEFAULTS.maxFiles, maxMb: options.output.maxMb ?? OUTPUT_DEFAULTS.maxMb, maxAgeDays: options.output.maxAgeDays ?? 0, cleanUp: !shared, showPath: runtime.showPaths ?? false };
    }
    const computer = createComputer(options.compute);
    /** @type {Promise<any> | null} */
    let auth = null;
    /** @type {any} */
    let pruning = null;
    const context = {
        options,
        registry,
        computer,
        output,
        log,
        offers: offersOf(options),
        authMode: options.auth?.mode ?? "none",
        version: VERSION,

        /**
         * The authentication every HTTP front end of this context shares, built on first use.
         * @param {{ env?: Record<string, string | undefined>, loopback: boolean }} how
         */
        auth(how) {
            auth ??= createAuthCore(options, { env: how.env ?? process.env, log, loopback: how.loopback, tokenEnv: runtime.tokenEnv ?? TOKEN_ENV }).catch((e) => {
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
                output: output ? await writable(output.dir) : true
            };
            return { ok: Object.values(checks).every(Boolean), checks };
        },

        async close() {
            if (pruning) {
                clearInterval(pruning);
            }
            if (auth) {
                (await auth.catch(() => null))?.close();
            }
            await computer.close();
        }
    };
    if (output?.maxAgeDays) {
        // old reports go at start and every hour, also while nobody renders
        await prune(context);
        pruning = setInterval(() => prune(context).catch(() => undefined), 3_600_000);
        pruning.unref();
    }
    return context;
}

/** Why a directory cannot be made or read, in words, from a file system error's code. */
export const whyNot = (code) => (code === "EACCES" || code === "EPERM" ? `permission denied for the user ${process.getuid?.() ?? ""} the server runs as` : code === "ENOTDIR" || code === "EEXIST" ? "a part of the path is a file" : code === "EROFS" ? "the file system is read-only" : code === "ENOENT" ? "a symbolic link in the path points to nothing" : String(code ?? "unknown error"));

/**
 * Whether a missing directory can be made with mkdir -p: the code that keeps it from being made
 * (its nearest existing ancestor not a writable directory), or null.
 * @param {string} path
 * @returns {Promise<string | null>}
 */
export async function cannotCreate(path) {
    for (let dir = dirname(path); ; ) {
        const info = await stat(dir).catch(() => null);
        if (info) {
            return !info.isDirectory() ? "ENOTDIR" : (await writable(dir)) ? null : "EACCES";
        }
        // a link whose target is missing: mkdir -p cannot go through it
        if (await lstat(dir).catch(() => null)) {
            return "ENOENT";
        }
        const up = dirname(dir);
        if (up === dir) {
            return "ENOENT";
        }
        dir = up;
    }
}

/**
 * Where a missing directory will be once made: the real path of its nearest existing ancestor with
 * the rest of the path after it.
 * @param {string} path
 */
export async function plannedPath(path) {
    const rest = [];
    for (let dir = path; ; ) {
        const real = await realpath(dir).catch(() => null);
        if (real) {
            return join(real, ...rest.reverse());
        }
        const up = dirname(dir);
        if (up === dir) {
            return path;
        }
        rest.push(basename(dir));
        dir = up;
    }
}

/** Whether the server's user may create files in a directory. */
export const writable = (dir) => access(dir, constants.W_OK).then(() => true, () => false);

/**
 * The real directories that hold the operator's own files: each source file, print template and
 * token file, and the base directory (a configuration file's directory, unless it sets baseDir).
 * @param {import("./config.js").ServerOptions} options
 * @returns {Promise<string[]>}
 */
export async function ownFileDirs(options) {
    const files = [...Object.values(options.sources ?? {}).flatMap((s) => [s.file, s.template]), ...(options.auth?.tokens ?? []).map((t) => t.file)].filter((f) => typeof f === "string");
    const dirs = await Promise.all(files.map((f) => realpath(pathOf(options, f)).then(dirname, () => null)));
    const base = options.baseDir ? await realpath(options.baseDir).catch(() => null) : null;
    return [...dirs, base].filter((d) => d !== null);
}

/*
 * The server's context: what every request of every front end shares (the options, the source
 * registry, the compute pool with its caches, the output directory, the log, the authentication).
 * Build it once; the MCP server (pivotkit-mcp) and the REST service (pivotkit-server/rest) both take
 * it.
 *
 *   const context = await createContext(options);
 *   const rest = await createRestHandler(context);   // pivotkit-server/rest
 */

import { brandingOf } from "./branding.js";
import { createRequire } from "node:module";
import { access, constants, lstat, mkdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isInside } from "pivotkit-cli/files";
import { ConfigError, OUTPUT_DEFAULTS, maxAgeDaysOf, pathOf, validateOptions } from "./config.js";
import { COMPUTE_HOOKS, createComputer } from "./compute.js";
import { createLog } from "./log.js";
import { createRegistry } from "./registry.js";
import { checkTemplates } from "./print-template.js";
import { checkViews } from "./views.js";
import { callerOf, createAuthCore, identityKey } from "./auth.js";
import { offersOf } from "./sources/input.js";
import { httpSettingsOf } from "./options/http.js";
import { sourceCacheOf } from "./options/code.js";
import { loadRunner } from "./sources/run.js";
import { warnUnreadableSecrets } from "./sources/auth.js";
import { prune } from "./output.js";
import { autoValuesFields, noteAutoValues } from "./present.js";
import { resolvePolicy, withStats } from "./policy.js";

/** Why the server cannot take work yet, by /readyz check: fixed texts, never an address. */
const NOT_READY = Object.freeze({ auth: "the OAuth issuer's metadata is not loaded", workers: "no compute worker is running", output: "the output directory is not writable" });

/**
 * Why an output directory inside (or holding) an allowed directory is refused: the reason alone,
 * which the start's ConfigError and check-config's PROBLEM line each put their own prefix before.
 */
export const OUTPUT_INSIDE_ALLOWED = "lies inside a directory of files.allowDirs (or holds one): the model could read the reports it was not shown; use a directory outside them";

export { callerOf, identityKey };

/** The variable of the one static token when auth.tokens is empty. */
export const TOKEN_ENV = "PIVOTKIT_TOKEN";

/** pivotkit-mcp's variable of its one static token, defined here so `token show` knows it too. */
export const MCP_TOKEN_ENV = "PIVOTKIT_MCP_TOKEN";

/** The package's version. */
export const VERSION = createRequire(import.meta.url)("../package.json").version;

/**
 * @typedef {object} ContextRuntime
 * @property {boolean} [showPaths]  tell the caller a written file's full path (a local stdio server)
 * @property {{ write(text: string): unknown }} [stderr]  where the log goes (default process.stderr)
 * @property {string} [tokenEnv]  the variable of the one static token when auth.tokens is empty (default PIVOTKIT_TOKEN; pivotkit-mcp: PIVOTKIT_MCP_TOKEN)
 * @property {{ name: string, version: string }} [service]  the program every log line names (default pivotkit-server and its version)
 * @property {Record<string, string | undefined>} [env]  the environment the log reads NO_COLOR from (default process.env)
 */

/**
 * @typedef {object} ServerContext
 * @property {import("./config.js").ServerOptions} options
 * @property {any} registry  the sources (registry.js)
 * @property {any} computer  the compute pool (compute.js)
 * @property {{ dir: string, baseUrl: string | null, maxFiles: number, maxMb: number, maxAgeDays: number, draftMaxAgeDays: number, cleanUp: boolean, showPath: boolean } | null} output  cleanUp: the oldest reports may be deleted to make room (not where the operator's own files lie)
 * @property {any} log  the log (log.js)
 * @property {import("./sources/input.js").Offers} offers  the extra inputs each surface offers (fixed at start)
 * @property {import("./branding.js").Branding} branding  the operator's name, documentation links, icon and page (fixed at start)
 * @property {string} authMode
 * @property {string} version
 * @property {(how: { env?: Record<string, string | undefined>, loopback: boolean }) => Promise<any>} auth
 * @property {() => Promise<{ ok: boolean, checks: Record<string, boolean> }>} ready
 * @property {() => Promise<void>} countAutoValues  after start: read each file source the automatic rule applies to and log its "values" fields
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
    const service = runtime.service ?? { name: "pivotkit-server", version: VERSION };
    const log = createLog(options.log ?? "info", runtime.stderr ?? process.stderr, { service: service.name, version: service.version, env: runtime.env ?? process.env });
    // the icon is read now: a file that is missing or no PNG stops the start, as check-config says
    const branding = await brandingOf(options);
    const registry = await createRegistry(options, { log }).catch((e) => {
        throw e?.code === "ALLOW_DIR_NOT_FOUND" || e?.code === "ALLOW_DIR_NOT_DIRECTORY" ? new ConfigError(`files.allowDirs: ${e.message.replace(/^--allow-dir /, "")}`) : e;
    });
    // a source's print template the parser refuses: refused now, not first on an html report; one
    // that is not there yet (a deploy that copies it later) is a warning, as a missing source file
    for (const { id, missing, problem } of await checkTemplates(options)) {
        if (problem) {
            throw new ConfigError(`sources.${id}.template: ${problem}`);
        }
        if (missing) {
            log.warn(`sources.${id}.template: ${missing}; html reports of ${id} fail until it can be read`);
        }
    }
    // a source's named views that are no view: refused now, not first when a caller asks for one; a
    // file or folder that is not there yet is a warning, as a missing template
    for (const { id, problems } of await checkViews(options)) {
        for (const { key, text, missing } of problems) {
            if (!missing) {
                throw new ConfigError(`sources.${id}.${key}: ${text}`);
            }
            log.warn(`sources.${id}.${key}: ${text}; those views are left out; check-config says more`);
        }
    }
    // a backend's sign-in whose secret cannot be read: said at start, not first to a caller
    await warnUnreadableSecrets(options, log, (source) => httpSettingsOf(source).auth);
    let output = null;
    if (options.output?.dir) {
        const wanted = pathOf(options, options.output.dir);
        // only ENOENT is a missing directory: any other error (a name too long, a symbolic link
        // loop) is refused with its reason, as check-config reports it
        const found = await entryOf(wanted);
        if (found.code) {
            throw new ConfigError(`output.dir: ${outputRefusal(found.code, options.output.create !== false)}`);
        }
        const missing = !found.info;
        if (missing && (await entryOf(wanted, lstat)).info) {
            throw new ConfigError("output.dir: a symbolic link to nothing (its target does not exist)");
        }
        if (missing && options.output.create === false) {
            throw new ConfigError("output.dir: not found (create it first, or leave output.create on)");
        }
        // where the directory is or will be, checked before anything is made, so a refused start
        // leaves nothing behind
        const planned = missing ? await plannedPath(wanted) : await realpath(wanted).catch(() => null);
        if (!planned || (!missing && !(await stat(planned).catch(() => null))?.isDirectory())) {
            throw new ConfigError("output.dir: not a directory");
        }
        // a directory the model may read files from must not hold what it may not see: the results
        const insideAllowed = (path) => registry.allow.some((allowed) => isInside(path, allowed) || isInside(allowed, path));
        if (insideAllowed(planned)) {
            throw new ConfigError(`output.dir: ${OUTPUT_INSIDE_ALLOWED}`);
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
        // a link changed between mkdir and here leaves no real path: refused with its reason
        const dir = await realpath(wanted).catch((e) => {
            throw new ConfigError(`output.dir: ${outputRefusal(e?.code, missing)}`);
        });
        // what was made may have come out elsewhere (a link changed in between): checked again. The
        // directories just made stay: deleting them here could hit something that is not ours (the
        // same link may have moved again), and empty directories hold nothing the model could read
        if (insideAllowed(dir)) {
            throw new ConfigError(`output.dir: ${OUTPUT_INSIDE_ALLOWED}`);
        }
        // old reports are deleted by their extension (.csv, .json, ...): never where the operator's
        // own files lie, which have such names too
        const shared = (await ownFileDirs(options)).includes(dir);
        for (const key of /** @type {const} */ (["maxAgeDays", "draftMaxAgeDays"])) {
            if (options.output[key] && shared) {
                throw new ConfigError(`output.dir: is the configuration's directory or holds a source, template or token file, which output.${key} could delete with the old reports; give the reports a directory of their own`);
            }
        }
        if (shared) {
            log.warn(SHARED_OUTPUT_TEXT);
        }
        const refused = await notWritable(dir);
        if (refused === "EROFS") {
            log.warn(`${notWritableText(refused)}; every report will fail with NO_OUTPUT until then`);
        } else if (refused) {
            log.warn("output.dir is not writable by the server's user: every report will fail with NO_OUTPUT until its owner or mode is fixed");
        }
        // the default age limit only where the reports have a directory of their own: a default the
        // operator did not set never keeps the server from starting
        output = { dir, baseUrl: options.output.baseUrl ?? null, maxFiles: options.output.maxFiles ?? OUTPUT_DEFAULTS.maxFiles, maxMb: options.output.maxMb ?? OUTPUT_DEFAULTS.maxMb, maxAgeDays: maxAgeDaysOf(options, shared), draftMaxAgeDays: options.output.draftMaxAgeDays ?? OUTPUT_DEFAULTS.draftMaxAgeDays, cleanUp: !shared, showPath: runtime.showPaths ?? false };
    }
    // the tests' look into the workers, by a key only code that imports compute.js can give (never a setting)
    const computer = createComputer(options.compute, runtime[COMPUTE_HOOKS] === true ? { hooks: true } : {});
    /** Gives back this context's sourceCache.maxMb (set once the context is made, below). */
    let releaseCache = () => undefined;
    /** @type {Promise<any> | null} */
    let auth = null;
    /** @type {any} */
    let pruning = null;
    /** @type {any} the one-worker pool of countAutoValues while it runs */
    let counting = null;
    const context = {
        options,
        registry,
        computer,
        output,
        log,
        offers: offersOf(options),
        branding,
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
            const ok = Object.values(checks).every(Boolean);
            // why not, in fixed words without an address: the log has the details
            const reason = Object.entries(checks)
                .filter(([, passed]) => !passed)
                .map(([name]) => NOT_READY[/** @type {keyof typeof NOT_READY} */ (name)])
                .join("; ");
            return ok ? { ok, checks } : { ok, checks, reason: `${reason}; see the log` };
        },

        /**
         * Reads each file source the automatic "values" rule applies to (no default written,
         * policy.autoValues on) in a worker pool of its own, so the requests' workers and their time
         * limits are not touched, and logs how many fields it puts at "values" and how to turn it off.
         * A source that cannot be read is skipped: its calls say why. Never rejects.
         */
        async countAutoValues() {
            // file sources the rule applies to, decided from the options before anything is resolved
            const wanted = Object.entries(options.sources ?? {}).filter(([, s]) => s.file && resolvePolicy(options.policy, s.policy).auto);
            const ids = [];
            for (const [id] of wanted) {
                const resolved = await registry.resolve(id, { scopes: null, client: "start", profile: null }).catch(() => null);
                if (resolved) {
                    ids.push(resolved);
                }
            }
            if (!ids.length) {
                return;
            }
            let fields = 0;
            try {
                counting = createComputer({ ...options.compute, workers: 1 });
                for (const resolved of ids) {
                    const ran = await counting.run("describe_source", { source: resolved.spec.id, items: 0 }, { spec: resolved.spec }).catch(() => null);
                    if (ran?.stats) {
                        const policy = withStats(resolved.policy, ran.stats);
                        // kept, so a later change of the data is logged
                        noteAutoValues(context, resolved.spec, policy);
                        fields += autoValuesFields(policy).length;
                    }
                }
                log.info(`the automatic rule puts ${fields} field${fields === 1 ? "" : "s"} of ${ids.length} source${ids.length === 1 ? "" : "s"} at values (their distinct values are listed); policy.autoValues false turns it off, check-config lists the fields`, { fields, sources: ids.length });
            } catch {
                // the count is a note for the operator, never a reason to stop
            } finally {
                await counting?.close();
                counting = null;
            }
        },

        async close() {
            await counting?.close();
            if (pruning) {
                clearInterval(pruning);
            }
            if (auth) {
                (await auth.catch(() => null))?.close();
            }
            await computer.close();
            releaseCache();
            releaseCache = () => undefined;
        }
    };
    if (output?.maxAgeDays || output?.draftMaxAgeDays) {
        // old reports and drafts go at start and every hour, also while nobody renders
        await prune(context);
        pruning = setInterval(() => prune(context).catch(() => undefined), 3_600_000);
        pruning.unref();
    }
    // one load cache per process: the largest sourceCache.maxMb of the open contexts sizes it
    releaseCache = loadRunner.claimCacheBytes(sourceCacheOf(options).bytes);
    return context;
}

/** The words for the file system error codes a directory made at start meets (permissions apart). */
const WHY_NOT = new Map([
    ["ENOTDIR", "a part of the path is a file"],
    ["EEXIST", "something that is not a directory already exists at the path"],
    ["EROFS", "the file system is read-only"],
    ["ENOENT", "a symbolic link in the path points to nothing"],
    ["ELOOP", "a symbolic link in the path leads in a loop"],
    ["ENAMETOOLONG", "a name in the path is longer than the file system allows"]
]);

/**
 * Why a directory cannot be made or read, in words, from a file system error's code; any other code
 * is kept in a neutral sentence, so the operator can still look it up.
 * @param {string | null | undefined} code
 */
export const whyNot = (code) => (code === "EACCES" || code === "EPERM" ? `permission denied for the user ${process.getuid?.() ?? ""} the server runs as` : (WHY_NOT.get(String(code)) ?? `the file system refused it (${code ?? "unknown error"})`));

/**
 * Why output.dir cannot be used, the same at start and in check-config: "cannot be created" where
 * the start would make it, "cannot be examined" where it would not (output.create false, or it
 * exists), with the reason in words.
 * @param {string | null | undefined} code
 * @param {boolean} creating
 */
export const outputRefusal = (code, creating) => `${creating ? "cannot be created" : "cannot be examined"}: ${whyNot(code)}`;

/**
 * A path's entry in the file system: its stats, or why there are none. Only ENOENT means nothing is
 * there (info and code null); any other error's code (a name too long, a symbolic link loop, a part
 * of the path a file) is a problem with its own reason, not a missing path.
 * @param {string} path
 * @param {typeof stat} [how]  stat follows symbolic links, lstat looks at the link itself
 * @returns {Promise<{ info: import("node:fs").Stats | null, code: string | null }>}
 */
export const entryOf = (path, how = stat) => how(path).then((info) => ({ info, code: null }), (e) => ({ info: null, code: e?.code === "ENOENT" ? null : String(e?.code ?? "unknown error") }));

/**
 * Whether a missing directory can be made with mkdir -p: the code that keeps it from being made
 * (its nearest existing ancestor not a writable directory), or null.
 * @param {string} path
 * @returns {Promise<string | null>}
 */
export async function cannotCreate(path) {
    for (let dir = dirname(path); ; ) {
        const { info, code } = await entryOf(dir);
        if (code) {
            return code;
        }
        if (info) {
            return !info.isDirectory() ? "ENOTDIR" : (await writable(dir)) ? null : "EACCES";
        }
        // a link whose target is missing: mkdir -p cannot go through it
        const link = await entryOf(dir, lstat);
        if (link.info || link.code) {
            return link.code ?? "ENOENT";
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

/** The file system call tests replace (a read-only file system). */
export const outputMeans = { access };

/** Why the server's user may not create files in a directory (an error code), or null. */
export const notWritable = (dir) => outputMeans.access(dir, constants.W_OK).then(() => null, (e) => String(e?.code ?? "EACCES"));

/** Whether the server's user may create files in a directory. */
export const writable = async (dir) => (await notWritable(dir)) === null;

/**
 * What the start and check-config say of an output directory the server cannot write: a read-only
 * file system (a container's --read-only root without a volume there) needs a volume, else its owner
 * or mode.
 * @param {string} code  of notWritable
 */
export const notWritableText = (code) => (code === "EROFS" ? "output.dir is on a read-only file system (for example a container started with --read-only and no volume there): mount a writable volume at output.dir" : `output.dir is not writable by the user ${process.getuid?.() ?? ""} the server runs as`);

/** What the start and check-config say of an output directory that holds the operator's own files. */
export const SHARED_OUTPUT_TEXT = "output.dir is the configuration's directory or holds a source, template or token file: reports there are never deleted to make room, so a full directory refuses new ones; give the reports a directory of their own";

/**
 * The real directories that hold the operator's own files: each source file, print template, view
 * file and token file, each folder of views, and the base directory (a configuration file's directory, unless it sets baseDir).
 * @param {import("./config.js").ServerOptions} options
 * @returns {Promise<string[]>}
 */
export async function ownFileDirs(options) {
    const files = [...Object.values(options.sources ?? {}).flatMap((s) => [s.file, s.template, ...Object.values(s.views ?? {})]), ...(options.auth?.tokens ?? []).map((t) => t.file)].filter((f) => typeof f === "string");
    const dirs = await Promise.all(files.map((f) => realpath(pathOf(options, f)).then(dirname, () => null)));
    // a folder of named views is the operator's itself
    const viewDirs = await Promise.all(Object.values(options.sources ?? {}).map((s) => (typeof s.viewsDir === "string" ? realpath(pathOf(options, s.viewsDir)).catch(() => null) : null)));
    const base = options.baseDir ? await realpath(options.baseDir).catch(() => null) : null;
    return [...dirs, ...viewDirs, base].filter((d) => d !== null);
}

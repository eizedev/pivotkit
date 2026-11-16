/*
 * The server's state directory and the secrets it makes where they are missing, so a container
 * started without any setup serves with a token of its own (docs/getting-started/server-in-5-minutes.md):
 *
 *   <state>/secrets/admin.token      the static token "admin", when auth needs one and none is given
 *   <state>/secrets/downloads.key    the download links' key, so links work after a restart
 *   <state>/secrets/audit.key        audit.subject "hash" without audit.key: the same hash after a restart
 *   <state>/out                      the reports of the image's built-in configuration
 *
 * The state directory is --state-dir or $PIVOTKIT_STATE_DIR (the image sets /var/lib/pivotkit); the
 * server never creates it, only secrets/ (0700) and out/ inside it. Without it nothing changes, except
 * that a file reference with `create: true` is made where it is missing (auth.tokens[], output.downloads.key,
 * audit.key).
 *
 * The defaults are file references with `create: true`, so the start (prepareHttpServe, before serve()
 * and pivotkit-mcp's listen() refuse an open address), check-config and `token show` resolve them by
 * one rule (planState) and differ only in what they do with a missing file: the start makes it
 * (secret-file.js placeSecret, which gives every process racing for one name the same value),
 * check-config says whether it could, `token show` says to start the server first. An existing path
 * (a mounted Secret is a symbolic link) is read, never written. Over stdio nothing is made.
 *
 * A token that cannot be made stops the start (never a fallback to no auth); a key that cannot be
 * made is a warning, and the key is the random one of each process, as without a state directory.
 * No line and no error holds a value.
 */

import { existsSync } from "node:fs";
import { access, constants, lstat, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { closest } from "pivotkit-core";
import { isInside } from "pivotkit-cli/files";
import { ConfigError, loadConfig, pathOf } from "./config.js";
import { isLoopback } from "./listen.js";
import { settingsOf } from "./options/downloads.js";
import { keyProblem, tokenProblem } from "./secret-rules.js";
import { EMPTY_RETRY, SECRET_BYTES, SecretFileError, newSecret, placeSecret } from "./secret-file.js";

/** The variable that names the state directory (the flag is --state-dir). */
export const STATE_ENV = "PIVOTKIT_STATE_DIR";

/**
 * The container image's paths (docker/Dockerfile sets the same; a test compares them): its
 * configuration file, its state directory, the example data of its built-in configuration, and the
 * directory an operator mounts data at.
 */
export const IMAGE_PATHS = Object.freeze({ config: "/config/pivotkit.json", stateDir: "/var/lib/pivotkit", example: "/app/examples/sales.csv", data: "/data" });

/**
 * Why a start on an open address without auth is refused (serve() and pivotkit-mcp's listen()), with
 * what makes it start.
 * @param {string} host
 */
export const openAddressRefusal = (host) => `--host ${host}: an address other than loopback needs --auth token or oauth (or --allow-unauthenticated for a network you trust); with --state-dir or $${STATE_ENV} the server makes a token itself`;

/**
 * Why a written auth.mode "token" that resolves no token is refused, and how to fix it: the start's
 * and check-config's words. The generated token is offered only with a state directory.
 * @param {string} tokenEnv
 * @param {string | null | undefined} stateDir
 */
export const noTokenText = (tokenEnv, stateDir) =>
    `auth.mode is "token", but neither auth.tokens nor $${tokenEnv} gives a token; set $${tokenEnv} or list tokens in auth.tokens${stateDir ? `, or remove auth.mode (and --auth token) to let the server make the token "${DEFAULT_TOKEN_NAME}" in ${join(stateDir, STATE_PARTS.secrets)}` : ""}`;

/** The name of the token the state directory holds when auth needs one and none is given. */
export const DEFAULT_TOKEN_NAME = "admin";

/** The directories pivotkit makes inside the state directory: the secrets (0700) and the built-in configuration's reports. */
export const STATE_PARTS = Object.freeze({ secrets: "secrets", out: "out" });

/** The default files in secrets/, by what they are for. */
const STATE_FILES = Object.freeze({ token: `${DEFAULT_TOKEN_NAME}.token`, downloads: "downloads.key", audit: "audit.key" });

/** What each kind of secret is, for the lines: its words, its bytes and its rule. */
const KINDS = Object.freeze({
    token: { words: (name) => `the token "${name}"`, bytes: SECRET_BYTES.token, kind: "token", usable: tokenProblem },
    downloads: { words: () => "the download links' key", bytes: SECRET_BYTES.key, kind: "key", usable: keyProblem("downloads") },
    audit: { words: () => "the audit key", bytes: SECRET_BYTES.key, kind: "key", usable: keyProblem("audit") }
});

/**
 * The state directory as the runners take it: --state-dir, else $PIVOTKIT_STATE_DIR (an empty
 * variable is unset), absolute; null without one.
 * @param {string | undefined} flag
 * @param {Record<string, string | undefined>} env
 * @param {string} [cwd]
 * @returns {string | null}
 */
export const stateDirOf = (flag, env, cwd = process.cwd()) => {
    const given = flag || env[STATE_ENV] || "";
    return given ? resolve(cwd, given) : null;
};

/**
 * The image's built-in configuration: the example data as the source "example", its reports in
 * <state>/out, results and data in the request allowed. Files by path (a mounted /data) are never a
 * default: the token "admin" holds every scope, so a configuration names them (files.allowDirs).
 * Without a state directory there is no output directory.
 * @param {string | null} stateDir
 * @param {typeof IMAGE_PATHS} [paths]
 * @returns {import("./config.js").ServerOptions}
 */
export function builtInConfig(stateDir, paths = IMAGE_PATHS) {
    return {
        sources: { example: { file: paths.example, title: "Example sales" } },
        ...(stateDir ? { output: { dir: join(stateDir, STATE_PARTS.out) } } : {}),
        policy: { results: true, data: true },
        baseDir: dirname(paths.config)
    };
}

/**
 * The configuration a runner starts with: the file --config names (flag), else the one the variable
 * names (fromEnv); the image's built-in configuration (builtInConfig) only where the variable names
 * the image's own path and its directory is missing or empty (names starting with "." do not count:
 * an empty ConfigMap's). A directory that holds other files is refused with their names, so a typo
 * (pivotkit.jsn) is not served as the example. null without any file.
 * @param {{ flag?: string, fromEnv?: string, stateDir: string | null, paths?: typeof IMAGE_PATHS }} given
 * @returns {Promise<{ options: import("./config.js").ServerOptions, builtIn: boolean } | null>}
 */
export async function configFrom({ flag, fromEnv, stateDir, paths = IMAGE_PATHS }) {
    const file = flag || fromEnv;
    if (!file) {
        return null;
    }
    if (!flag && file === paths.config && !(await stat(file).catch(() => null))) {
        const dir = dirname(file);
        const names = await readdir(dir).catch(() => []);
        const others = names.filter((n) => !n.startsWith("."));
        if (!others.length) {
            return { options: builtInConfig(stateDir, paths), builtIn: true };
        }
        const near = closest("pivotkit.json", others);
        throw new ConfigError(`${file}: not found, and ${dir} holds ${others.slice(0, 5).join(", ")}${others.length > 5 ? ", ..." : ""}${near ? `; did you mean to name ${near} pivotkit.json?` : ""} (an empty ${dir} starts the built-in example configuration)`);
    }
    return { options: await loadConfig(file), builtIn: false };
}

/**
 * @typedef {object} PlannedSecret  a secret file pivotkit makes where it is missing
 * @property {"token" | "downloads" | "audit"} use
 * @property {string} at  where the configuration names it (auth.tokens[0], output.downloads.key, audit.key)
 * @property {string} words  how a line names it ("the token \"admin\"")
 * @property {string} path  absolute
 * @property {boolean} fromState  a default of the state directory (not written in the configuration)
 * @property {boolean} soleAuth  the one token the server would accept
 */

/**
 * @typedef {object} StatePlan
 * @property {import("./config.js").ServerOptions} options  with the defaults as file references (create: true)
 * @property {PlannedSecret[]} secrets  every reference with create: true, the defaults among them
 * @property {string | null} stateDir
 * @property {string | null} secretsDir
 * @property {PlannedSecret | null} defaultToken  the token of the state directory, when it is used
 * @property {boolean} outInState  output.dir is <state>/out (made by prepareHttpServe, never by the context)
 */

/**
 * The state directory's defaults on the options, and every secret with create: true; reads and
 * writes nothing (the start, check-config and `token show` share it). Refuses an output.dir that is
 * the state directory or holds its secrets.
 *
 * - auth.mode unset on an address off loopback without allowUnauthenticated: "token" (such a
 *   configuration is refused without a state directory);
 * - auth.mode unset, so "token" by the rule above, without auth.tokens and without the token's
 *   variable: the token "admin" in <state>/secrets/admin.token, every scope, no profile (a written
 *   auth.mode "token" that resolves no token is refused by prepareHttpServe instead);
 * - download links on without output.downloads.key: <state>/secrets/downloads.key;
 * - audit.subject "hash" without audit.key: <state>/secrets/audit.key.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ env: Record<string, string | undefined>, host: string | null, tokenEnv: string, stateDir: string | null }} runtime  host null: not known (`token show`), taken as off loopback
 * @returns {StatePlan}
 */
export function planState(options, { env, host, tokenEnv, stateDir }) {
    const secretsDir = stateDir ? join(stateDir, STATE_PARTS.secrets) : null;
    const auth = { ...options.auth };
    const output = { ...options.output };
    const next = { ...options };
    if (secretsDir) {
        const out = output.dir ? pathOf(options, output.dir) : null;
        if (out && (out === stateDir || isInside(secretsDir, out) || isInside(out, secretsDir))) {
            throw new ConfigError(`output.dir: ${output.dir} would hold the state directory's secrets (${secretsDir}); reports are served and pruned there: use ${join(/** @type {string} */ (stateDir), STATE_PARTS.out)} or another directory`);
        }
        const openAddress = host === null || !isLoopback(host);
        if (auth.mode === undefined && openAddress && !auth.allowUnauthenticated) {
            auth.mode = "token";
            next.auth = auth;
        }
        // only where the configuration left auth to the server: a written auth.mode "token" names its
        // own tokens, and one that resolves none is refused (prepareHttpServe), never given admin
        if (auth.mode === "token" && options.auth?.mode === undefined && !auth.tokens?.length && !env[tokenEnv]) {
            auth.tokens = [{ name: DEFAULT_TOKEN_NAME, file: join(secretsDir, STATE_FILES.token), create: true }];
            next.auth = auth;
        }
        const downloads = { ...output.downloads };
        if (settingsOf(next).enabled && !downloads.key) {
            downloads.key = { file: join(secretsDir, STATE_FILES.downloads), create: true };
            next.output = { ...output, downloads };
        }
        if (options.audit?.subject === "hash" && !options.audit.key) {
            next.audit = { ...options.audit, key: { file: join(secretsDir, STATE_FILES.audit), create: true } };
        }
    }
    /** @type {PlannedSecret[]} */
    const secrets = [];
    const add = (use, at, ref, name = "") => {
        if (ref?.create && ref.file) {
            const path = pathOf(next, ref.file);
            secrets.push({ use, at, words: KINDS[use].words(name), path, fromState: Boolean(secretsDir) && dirname(path) === secretsDir && !isWritten(options, at), soleAuth: false });
        }
    };
    const tokens = next.auth?.mode === "token" ? (next.auth.tokens ?? []) : [];
    tokens.forEach((t, i) => add("token", `auth.tokens[${i}]`, t, t.name));
    if (tokens.length === 1 && secrets[0]) {
        secrets[0].soleAuth = true;
    }
    add("downloads", "output.downloads.key", next.output?.downloads?.key);
    add("audit", "audit.key", next.audit?.key);
    const defaultToken = secrets.find((s) => s.use === "token" && s.fromState) ?? null;
    const outInState = Boolean(stateDir && next.output?.dir && pathOf(next, next.output.dir) === join(/** @type {string} */ (stateDir), STATE_PARTS.out));
    return { options: next, secrets, stateDir, secretsDir, defaultToken, outInState };
}

/** Whether the configuration itself names the reference at `at` (not a default of the state directory). */
function isWritten(options, at) {
    if (at === "output.downloads.key") {
        return Boolean(options.output?.downloads?.key);
    }
    if (at === "audit.key") {
        return Boolean(options.audit?.key);
    }
    return Boolean(options.auth?.tokens?.length);
}

/** The file system facts tests replace: whether this runs in a container, and the mount table. */
export const stateMeans = {
    /** @returns {"kubernetes" | "docker" | "podman" | null} */
    container: (env = process.env) => (env.KUBERNETES_SERVICE_HOST ? "kubernetes" : existsSync("/.dockerenv") ? "docker" : existsSync("/run/.containerenv") ? "podman" : null),
    /** @returns {Promise<string | null>} */
    mountinfo: () => (process.platform === "linux" ? readFile("/proc/self/mountinfo", "utf8").catch(() => null) : Promise.resolve(null)),
    hostname: () => hostname(),
    /** The pod's namespace (the service account's mount), or null. @returns {Promise<string | null>} */
    namespace: () => readFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "utf8").then((t) => t.trim() || null, () => null)
};

/** A path of the mount table with its escapes (\040 for a space) read back. */
const unescape = (text) => text.replace(/\\([0-7]{3})/g, (_, n) => String.fromCharCode(parseInt(n, 8)));

/**
 * Whether a directory lies on a container's own layer: inside a container (stateMeans.container) on
 * Linux, where the mount it lies on (the longest mount point above it in /proc/self/mountinfo) is "/".
 * Its files go with the container then. false where it cannot tell.
 * @param {string} dir  absolute
 * @param {Record<string, string | undefined>} env
 */
export async function onContainerLayer(dir, env) {
    if (!stateMeans.container(env)) {
        return false;
    }
    const table = await stateMeans.mountinfo();
    if (!table) {
        return false;
    }
    const points = table.split("\n").map((line) => line.split(" ")[4]).filter(Boolean).map(unescape);
    const on = points.filter((p) => isInside(dir, p)).sort((a, b) => b.length - a.length)[0];
    return on === "/";
}

/** Single quotes for a shell: a path as one word. */
const quoted = (text) => (/^[\w./-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`);

/**
 * The command that prints a token of the state directory, for where the server runs: kubectl with the
 * pod's namespace and name (its own hostname), `docker exec <container>` or `podman exec <container>`
 * (a container's hostname is not always its name), else the command itself with --state-dir unless
 * $PIVOTKIT_STATE_DIR names it.
 * @param {string} name
 * @param {{ env: Record<string, string | undefined>, stateDir: string | null }} where
 * @returns {Promise<string>}
 */
export async function tokenShowHint(name, { env, stateDir }) {
    const command = `pivotkit-server token show ${name}`;
    const container = stateMeans.container(env);
    if (container === "kubernetes") {
        const namespace = await stateMeans.namespace();
        return `kubectl${namespace ? ` -n ${namespace}` : ""} exec ${stateMeans.hostname()} -- ${command} (in a pod with sidecars add -c <container>)`;
    }
    if (container) {
        return `${container} exec <container> ${command} (replace <container> with the container's name or ID)`;
    }
    return env[STATE_ENV] || !stateDir ? command : `${command} --state-dir ${quoted(stateDir)}`;
}

/**
 * What makes the state directory usable, for a message: a writable volume in a container, else the
 * directory itself.
 * @param {string} stateDir
 * @param {Record<string, string | undefined>} env
 */
export const stateDirFix = (stateDir, env) => (stateMeans.container(env) ? `mount a writable volume at ${stateDir} (docker run -v pivotkit:${stateDir})` : `create ${stateDir} and make it writable for the user this runs as`);

/** Why a file cannot be written where it would go, in words, from an error of mkdir or placeSecret. */
function whyNot(e) {
    if (e instanceof SecretFileError) {
        return e.message;
    }
    const code = e?.code;
    return code === "EROFS" ? "the file system is read-only" : code === "EACCES" || code === "EPERM" ? `permission denied for the user ${process.getuid?.() ?? ""} this runs as` : code === "ENOENT" ? "its directory does not exist" : String(e?.message ?? e).slice(0, 200);
}

/**
 * What waits on a file another process has just created in place (a file system without hard links):
 * until it holds a value, up to secret-file.js EMPTY_RETRY; the reader that follows says what is wrong
 * with one that stays empty.
 * @param {string} path
 */
async function settled(path) {
    for (let attempt = 1; attempt < EMPTY_RETRY.tries; attempt++) {
        const info = await stat(path).catch(() => null);
        if (!info?.isFile() || info.size > 0) {
            return;
        }
        // a ref'd timer: the start waits for it
        await new Promise((done) => setTimeout(done, EMPTY_RETRY.waitMs));
    }
}

/**
 * Makes a planned secret where nothing is there: an existing path (a link to a mounted Secret too)
 * is read later as configured, never written; a link to nothing is refused; else a new value goes in
 * by placeSecret, which keeps what a racing process put there first.
 * @param {PlannedSecret} secret
 * @returns {Promise<boolean>}  whether this process created it
 */
async function ensure(secret) {
    if (await stat(secret.path).catch((e) => (e?.code === "ENOENT" ? null : Promise.reject(e)))) {
        await settled(secret.path);
        return false;
    }
    if (await lstat(secret.path).catch(() => null)) {
        throw new SecretFileError("NOT_REGULAR_FILE", `${secret.path} is a symbolic link to nothing; not written`);
    }
    const { kind, bytes, usable } = KINDS[secret.use];
    const placed = await placeSecret(secret.path, newSecret(bytes), { keep: true, usable, kind, label: secret.path });
    return placed.created;
}

/**
 * Whether a planned secret is there, would be made at start, or why it could not be: check-config's
 * question, answered without writing anything.
 * @param {PlannedSecret} secret
 * @param {StatePlan} plan
 * @returns {Promise<{ state: "present" } | { state: "created" } | { state: "blocked", why: string }>}
 */
export async function secretState(secret, plan) {
    if (await stat(secret.path).catch(() => null)) {
        return { state: "present" };
    }
    if (await lstat(secret.path).catch(() => null)) {
        return { state: "blocked", why: "it is a symbolic link to nothing" };
    }
    const dir = dirname(secret.path);
    // secrets/ is made at start inside the state directory; any other directory must be there
    const where = !(await stat(dir).catch(() => null)) && dir === plan.secretsDir ? /** @type {string} */ (plan.stateDir) : dir;
    const info = await stat(where).catch(() => null);
    if (!info?.isDirectory()) {
        return { state: "blocked", why: `${where} does not exist` };
    }
    const writable = await access(where, constants.W_OK).then(() => true, (e) => e);
    return writable === true ? { state: "created" } : { state: "blocked", why: `${where} cannot be written (${whyNot(writable)})` };
}

/**
 * @typedef {{ level: "info" | "warn", text: string }} StateNote  a line for the log, written once it exists
 */

/**
 * The start's part over HTTP, before an open address is refused: the state directory's defaults
 * (planState) with each missing secret made, and the lines to log once the log exists. A token that
 * cannot be made, an explicit reference with create: true that cannot be written, and a link to
 * nothing are refused (ConfigError); a default key that cannot be made is a warning, and the key is
 * left out (a random one per process).
 * @param {import("./config.js").ServerOptions} options
 * @param {{ env: Record<string, string | undefined>, host: string, tokenEnv: string, stateDir?: string | null }} runtime
 * @returns {Promise<{ options: import("./config.js").ServerOptions, notes: StateNote[] }>}
 */
export async function prepareHttpServe(options, { env, host, tokenEnv, stateDir = null }) {
    if (stateDir && options.auth?.mode === "token" && !options.auth.tokens?.length && !env[tokenEnv]) {
        // fail closed: a typo in the variable's name must not become a generated token with every scope
        throw new ConfigError(noTokenText(tokenEnv, stateDir));
    }
    const plan = planState(options, { env, host, tokenEnv, stateDir });
    /** @type {StateNote[]} */
    const notes = [];
    const next = plan.options;
    const unused = unusedTokenText(options, next, env, tokenEnv);
    if (unused) {
        notes.push({ level: "warn", text: unused });
    }
    /** Why secrets/ cannot be made, or null once it is there. */
    let secretsProblem = null;
    if (plan.secretsDir && plan.secrets.some((s) => s.fromState)) {
        secretsProblem = await mkdir(plan.secretsDir, { mode: 0o700 }).then(
            () => null,
            (e) => (e?.code === "EEXIST" ? null : e?.code === "ENOENT" ? `the state directory ${plan.stateDir} does not exist` : `${plan.secretsDir} cannot be made: ${whyNot(e)}`)
        );
    }
    for (const secret of plan.secrets) {
        let created;
        try {
            if (secret.fromState && secretsProblem) {
                throw new ConfigError(secretsProblem);
            }
            created = await ensure(secret);
        } catch (e) {
            const why = e instanceof ConfigError ? e.message : whyNot(e);
            if (secret.fromState && secret.use !== "token") {
                notes.push({ level: "warn", text: `${secret.words} cannot be made in ${secret.path} (${why}): a random key is used, so ${secret.use === "downloads" ? "download links stop working on a restart" : "the same person gets another hash after a restart"}; ${stateDirFix(/** @type {string} */ (plan.stateDir), env)}` });
                if (secret.use === "downloads") {
                    next.output = { ...next.output, downloads: { ...next.output?.downloads, key: undefined } };
                } else {
                    next.audit = { ...next.audit, key: undefined };
                }
                continue;
            }
            if (secret.fromState) {
                throw new ConfigError(`auth: ${secret.words} cannot be made in ${secret.path} (${why}); ${stateDirFix(/** @type {string} */ (plan.stateDir), env)}, or give the token in $${tokenEnv} or auth.tokens`);
            }
            throw new ConfigError(`${secret.at}: ${secret.path} cannot be made (${why}); create: true makes a missing file, its directory must exist and be writable`);
        }
        if (created) {
            notes.push({ level: "info", text: `created ${secret.words} in ${secret.path}${secret.fromState ? " (keep this directory on a volume)" : ""}` });
        }
    }
    if (plan.outInState) {
        await mkdir(join(/** @type {string} */ (plan.stateDir), STATE_PARTS.out), { mode: 0o700 }).catch((e) => {
            if (e?.code !== "EEXIST") {
                throw new ConfigError(`output.dir: ${join(/** @type {string} */ (plan.stateDir), STATE_PARTS.out)} cannot be made (${e?.code === "ENOENT" ? `the state directory ${plan.stateDir} does not exist` : whyNot(e)}); ${stateDirFix(/** @type {string} */ (plan.stateDir), env)}`);
            }
        });
    }
    const usesState = plan.secrets.some((s) => s.fromState) || plan.outInState;
    if (usesState && plan.stateDir && (await onContainerLayer(plan.stateDir, env))) {
        notes.push({ level: "warn", text: `the state directory ${plan.stateDir} is on the container's own layer: its tokens, keys and reports are lost when the container is removed; mount a volume there (docker run -v pivotkit:${plan.stateDir})` });
    }
    if (plan.defaultToken && next.auth?.tokens?.some((t) => t.file === plan.defaultToken?.path)) {
        notes.push({ level: "info", text: `auth: token "${DEFAULT_TOKEN_NAME}" from ${plan.defaultToken.path}; read it with: ${await tokenShowHint(DEFAULT_TOKEN_NAME, { env, stateDir: plan.stateDir })}` });
    }
    return { options: next, notes };
}

/**
 * The warning for a token's variable that is set while auth stays none: the configuration and the
 * flags name no auth.mode, and the address is loopback. The mode is never switched for it. Null
 * otherwise.
 * @param {import("./config.js").ServerOptions} given  as written, with the flags
 * @param {import("./config.js").ServerOptions} planned  planState's
 * @param {Record<string, string | undefined>} env
 * @param {string} tokenEnv
 * @returns {string | null}
 */
export const unusedTokenText = (given, planned, env, tokenEnv) =>
    given.auth?.mode === undefined && (planned.auth?.mode ?? "none") === "none" && env[tokenEnv] ? `${tokenEnv} is set but auth is none; use --auth token (or auth.mode token)` : null;

/**
 * Writes the notes of prepareHttpServe on a log.
 * @param {{ info(text: string): void, warn(text: string): void }} log
 * @param {StateNote[]} notes
 */
export function logNotes(log, notes) {
    for (const note of notes) {
        log[note.level](note.text);
    }
}

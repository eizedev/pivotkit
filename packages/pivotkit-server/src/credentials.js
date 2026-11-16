/*
 * The commands that make the server's credentials, loaded by the runner only for them:
 *
 *   pivotkit-server token new [--file <path>] [--name <n>] [--profile <p>] [--scope <s>]...
 *                             [--if-missing | --force] [--print] [--config <file> [--add]] [--json]
 *   pivotkit-server token show <name> [--config <file>] [--json]
 *   pivotkit-server key new --for downloads|audit [--file <path>] [--if-missing | --force] [--print] [--json]
 *
 * A token is 32 random bytes and a key 48, in base64url. Without --file the value is the only line
 * on stdout; with --file it is written by secret-file.js and printed only with --print. Hints (the
 * configuration's lines, how to try it) go to stderr, and only on a terminal. `token new` and
 * `key new` read no configuration unless --config is given (the container image sets
 * $PIVOTKIT_CONFIG, and `docker run --rm <image> token new` must work without one); `token show`
 * reads $PIVOTKIT_CONFIG by default. Exit codes as the runner's: 0 done, 1 a file that is there,
 * missing or unusable, 2 a usage or configuration error. --json writes one object on stdout, as
 * pivotkit-cli's: { ok, exitCode, command, ..., error?: { kind, code, message } }; the value is in it
 * only where it would be printed. No message and no error holds a value.
 */

import { access, constants as fsConstants, lstat, readFile, unlink } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { closest } from "pivotkit-core";
import { isInside } from "pivotkit-cli/files";
import { ConfigError, REST_BASE, loadConfig, pathOf, validateOptions } from "./config.js";
import { KEY_USES, keyProblem, tokenProblem } from "./secret-rules.js";
import { UTF16_TEXT, readSecretFile, unreadable } from "./secrets.js";
import { CONFIG_ENV } from "./flags.js";
import { DEFAULT_PORT, TOKEN_ENV } from "./serve.js";
import { SECRET_BYTES, SecretFileError, newSecret, placeSecret, replaceFile, writeBackup } from "./secret-file.js";


/** Where the configuration names a key of each use (secret-rules.js KEY_USES), for the hints. */
const KEY_OPTIONS = Object.freeze({
    downloads: { option: "output.downloads.key", snippet: (file) => `"output": { "downloads": { "key": { "file": ${JSON.stringify(file)} } } }`, after: "The server reads it again within a second: no restart. Links made with an earlier key stop working." },
    audit: { option: "audit.key", snippet: (file) => `"audit": { "subject": "hash", "key": { "file": ${JSON.stringify(file)} } }`, after: "The server reads it at start: restart it." }
});

/** The flags of each command, defined once for the parser and the help. */
const FLAGS = Object.freeze({
    "token new": {
        file: { type: "string", value: "path", text: "Write the token to this file (mode 0600, one line) instead of printing it." },
        name: { type: "string", value: "name", text: "The token's name in auth.tokens and the log (default: the file's name without extension, else \"token\")." },
        profile: { type: "string", value: "profile", text: "The policy profile of the token (a name of policy.profiles)." },
        scope: { type: "string", multiple: true, value: "scope", text: "A scope the token holds (may be given more than once; none: every scope)." },
        "if-missing": { type: "boolean", text: "Keep a file that is there (checked: a token the server can use) and exit 0." },
        force: { type: "boolean", text: "Replace a file that is there (clients with the old token get 401 from then on)." },
        print: { type: "boolean", text: "Print the token also when it is written to --file." },
        config: { type: "string", value: "file", text: "The server's configuration file: checks the profile, the file's place, and the address in the hints." },
        add: { type: "boolean", text: "Add the token to auth.tokens of --config; needs --file (a backup <file>.bak-<time> first; the file is rewritten as pretty-printed JSON)." },
        json: { type: "boolean", text: "Write one JSON object on stdout." },
        help: { type: "boolean", short: "h", text: "Print this help and exit." }
    },
    "token show": {
        config: { type: "string", value: "file", text: "The configuration file (default $PIVOTKIT_CONFIG)." },
        json: { type: "boolean", text: "Write one JSON object on stdout." },
        help: { type: "boolean", short: "h", text: "Print this help and exit." }
    },
    "key new": {
        for: { type: "string", value: "downloads|audit", text: "What the key is for: output.downloads.key or audit.key (required)." },
        file: { type: "string", value: "path", text: "Write the key to this file (mode 0600, one line) instead of printing it." },
        "if-missing": { type: "boolean", text: "Keep a file that is there (checked: a key the server can use) and exit 0." },
        force: { type: "boolean", text: "Replace a file that is there." },
        print: { type: "boolean", text: "Print the key also when it is written to --file." },
        config: { type: "string", value: "file", text: "The server's configuration file: refuses a file inside output.dir." },
        add: { type: "boolean", text: "Name the key as output.downloads.key or audit.key of --config; needs --file (a backup first; pretty-printed JSON)." },
        json: { type: "boolean", text: "Write one JSON object on stdout." },
        help: { type: "boolean", short: "h", text: "Print this help and exit." }
    }
});

/** The help of `token` or `key`. */
function helpOf(group) {
    const lines = (flags) => Object.entries(flags).map(([name, f]) => `  --${name}${f.value ? ` <${f.value}>` : ""}`.padEnd(30) + f.text);
    const parts = Object.keys(FLAGS)
        .filter((command) => command.startsWith(group))
        .map((command) => `${command === "key new" ? "pivotkit-server key new --for downloads|audit [options]" : command === "token show" ? "pivotkit-server token show <name> [options]" : "pivotkit-server token new [options]"}\n${lines(FLAGS[command]).join("\n")}`);
    return `${parts.join("\n\n")}\n\nWithout --file the value is the only line on stdout. Exit codes: 0 done, 1 a file that is there, missing or not usable, 2 a usage or configuration error.\nDocs: https://pivotkit.eize.dev/reference/rest/#credentials\n`;
}

/** A refusal of the command: its exit code (2 usage, 1 a file), kind and code, as --json gives them. */
class CommandError extends Error {
    /**
     * @param {1 | 2} exitCode
     * @param {string} code
     * @param {string} message
     */
    constructor(exitCode, code, message) {
        super(message);
        this.exitCode = exitCode;
        this.kind = exitCode === 2 ? "usage" : "io";
        this.code = code;
    }
}

const usage = (code, message) => new CommandError(2, code, message);

/**
 * The flags of a command parsed; a usage error with "did you mean" for an unknown one.
 * @param {keyof typeof FLAGS} command
 * @param {string[]} argv
 * @param {boolean} [positionals]
 * @returns {{ values: Record<string, any>, positionals: string[] }}
 */
function parse(command, argv, positionals = false) {
    const flags = FLAGS[command];
    try {
        return parseArgs({ args: argv, options: /** @type {any} */ (flags), allowPositionals: positionals, strict: true });
    } catch (e) {
        const flag = /'(-{1,2}[^'\s]+)'/.exec(String(e.message))?.[1] ?? "";
        const near = closest(flag.replace(/^-+/, ""), Object.keys(flags));
        const what = e.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? `unknown option ${JSON.stringify(flag.slice(0, 40))}` : String(e.message).split("\n")[0].replace(/^./, (c) => c.toLowerCase());
        throw usage("UNKNOWN_OPTION", `${what}; ${near ? `did you mean --${near}? ` : ""}run "pivotkit-server ${command.split(" ")[0]} --help"`);
    }
}

/** --if-missing and --force exclude each other, and both need --file. */
function checkWriteFlags(values) {
    if (values["if-missing"] && values.force) {
        throw usage("CONFLICT", "--if-missing keeps a file and --force replaces it: give one of them");
    }
    if ((values["if-missing"] || values.force) && !values.file) {
        throw usage("NO_FILE", `--${values.force ? "force" : "if-missing"} acts on --file <path>`);
    }
}

/** A configuration file read and checked; a ConfigError is a usage error. */
async function configOf(file) {
    try {
        return await loadConfig(file);
    } catch (e) {
        // loadConfig names the file by its full path: the message by the name given is enough
        throw e instanceof ConfigError ? usage("CONFIG", e.message) : e;
    }
}

/** The secret written (or kept) or made: the value now in place, what happened to the file, and its warnings. */
async function secretOf(values, bytes, kind, usable, cwd) {
    if (!values.file) {
        return { value: newSecret(bytes), file: null, created: false, replaced: false, warnings: [] };
    }
    const path = resolve(cwd, values.file);
    try {
        const placed = await placeSecret(path, newSecret(bytes), { replace: values.force, keep: values["if-missing"], usable, kind, label: values.file });
        return { ...placed, file: path };
    } catch (e) {
        if (e instanceof SecretFileError) {
            throw new CommandError(1, e.code, e.message);
        }
        throw e;
    }
}

/** A path as the configuration writes it: relative to its base directory where the file lies below it, with "/" on every system. */
function configPath(file, baseDir) {
    const rel = relative(baseDir, file);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : file;
}

/** An object as the docs write a snippet: `{ "name": "reports", "file": "secrets/reports.token" }`. */
const snippetOf = (value) => (value && typeof value === "object" && !Array.isArray(value) ? `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${snippetOf(v)}`).join(", ")} }` : JSON.stringify(value));

/** Where clients reach the server: http.publicUrl, else loopback on its port. */
const baseUrlOf = (options) => (options?.http?.publicUrl ? options.http.publicUrl.replace(/\/+$/, "") : `http://127.0.0.1:${options?.http?.port || DEFAULT_PORT}`);

/** Single quotes for a shell (bash, PowerShell): a path as one word. */
const quoted = (text) => `'${text.replace(/'/g, "'\\''")}'`;
const psQuoted = (text) => `'${text.replace(/'/g, "''")}'`;

/**
 * The --config of `token new` or `key new`, read and checked; a file inside output.dir refused
 * (the server prunes and serves that directory: a secret there could be deleted or downloaded).
 * @param {Record<string, any>} values
 * @param {string} cwd
 * @param {string} what  "token" or "key", for the message
 */
async function configFor(values, cwd, what) {
    if (values.add && (!values.config || !values.file)) {
        throw usage("ADD_NEEDS", `--add writes the ${what} into --config <file> and needs --file <path> for its value`);
    }
    const options = values.config ? await configOf(resolve(cwd, values.config)) : null;
    const file = values.file ? resolve(cwd, values.file) : null;
    if (options && file && options.output?.dir && isInside(file, pathOf(options, options.output.dir))) {
        throw usage("IN_OUTPUT", `${values.file}: lies inside output.dir (${options.output.dir}); keep the ${what} outside the directory the server writes reports to`);
    }
    return { options, file };
}

/**
 * The configuration file changed by `change` (the parsed JSON in, the new JSON and notes out, or a
 * usage error), checked by validateOptions; refused before anything is written for a file --add
 * could not replace. The file's indentation, line ends and BOM are kept; it is written as
 * pretty-printed JSON.
 * @param {string} path  the configuration file, absolute
 * @param {string} config  as given, for messages
 * @param {any} options  the file as loadConfig read it
 * @param {(raw: any) => { next: any, notes: string[] } | { done: true }} change  `done`: the configuration has it already
 * @returns {Promise<{ path: string, before: string, text: string, mode: number, notes: string[], size: number, mtimeMs: number } | { done: true, path: string }>}
 */
async function changedConfig(path, config, options, change) {
    // replaceFile renames over it: a link (a mounted ConfigMap is one) or a directory that cannot be
    // written is refused now, before the secret's file is written
    const info = await lstat(path);
    if (!info.isFile()) {
        throw usage("CONFIG_NOT_WRITABLE", `${config}: is ${info.isSymbolicLink() ? "a symbolic link (a mounted ConfigMap is one)" : "not a regular file"}; --add replaces the file, so add the entry where the file comes from`);
    }
    const writable = await access(dirname(path), fsConstants.W_OK).then(() => true, () => false);
    if (!writable) {
        throw usage("CONFIG_NOT_WRITABLE", `${config}: its directory cannot be written (the backup and the new file go there); add the entry by hand`);
    }
    const before = await readFile(path, "utf8");
    const bom = before.startsWith("\uFEFF") ? "\uFEFF" : "";
    const changed = change(JSON.parse(before.slice(bom.length)));
    if ("done" in changed) {
        return { done: true, path };
    }
    const { next, notes } = changed;
    try {
        validateOptions({ ...structuredClone(next), baseDir: options.baseDir });
    } catch (e) {
        throw e instanceof ConfigError ? usage("CONFIG", e.message) : e;
    }
    const indent = /^([ \t]+)"/m.exec(before)?.[1] ?? "  ";
    const eol = before.includes("\r\n") ? "\r\n" : "\n";
    const body = JSON.stringify(next, null, indent).replace(/\n/g, eol);
    return { path, before, text: `${bom}${body}${/\r?\n$/.test(before) ? eol : ""}`, mode: info.mode & 0o777, notes, size: info.size, mtimeMs: info.mtimeMs };
}

/**
 * Writes a changed configuration with its backup, unless it changed since it was read (its size or
 * time): then nothing is replaced and the backup goes again. When that fails, says that the secret's
 * file is written and the configuration is not.
 * @param {{ path: string, before: string, text: string, mode: number, size: number, mtimeMs: number }} changed
 * @param {Record<string, any>} values
 * @returns {Promise<string>}  the backup's path
 */
async function writeConfig(changed, values) {
    const unchanged = async () => {
        const now = await lstat(changed.path);
        return now.size === changed.size && now.mtimeMs === changed.mtimeMs;
    };
    if (!(await unchanged())) {
        throw new CommandError(1, "CONFIG_CHANGED", `${values.config} changed since it was read and was not replaced; the file ${values.file} is written: run the same command with --if-missing to add it now`);
    }
    try {
        const backup = await writeBackup(changed.path, changed.before, changed.mode);
        // the last look right before the replace: the window that stays is this one step
        if (!(await unchanged())) {
            await unlink(backup).catch(() => undefined);
            throw new CommandError(1, "CONFIG_CHANGED", `${values.config} changed since it was read and was not replaced; the file ${values.file} is written: run the same command with --if-missing to add it now`);
        }
        await replaceFile(changed.path, changed.text, changed.mode, values.config);
        return backup;
    } catch (e) {
        if (e instanceof CommandError) {
            throw e;
        }
        const why = String(e?.message ?? e).slice(0, 200);
        throw new CommandError(1, "CONFIG_NOT_WRITTEN", `${values.config} was not changed (${why}); the file ${values.file} is written: run the same command with --if-missing instead of a new value`);
    }
}

/** The line of a configuration --add rewrote. */
const rewrittenLine = (values, backup) => `${values.config} is rewritten as pretty-printed JSON; the old file is kept as ${basename(backup)}.`;

/**
 * What a command did: the fields of its JSON, the value, whether it is printed and under which name,
 * the hints for a terminal and the warnings.
 * @typedef {{ json: Record<string, unknown>, value: string, printValue: boolean, field: "token" | "key", hints: string[], warnings: string[] }} Outcome
 */

/**
 * `token new`.
 * @returns {Promise<Outcome>}
 */
async function tokenNew(argv, io) {
    const { values } = parse("token new", argv);
    checkWriteFlags(values);
    const cwd = io.cwd ?? process.cwd();
    const name = values.name ?? (values.file ? basename(values.file, extname(values.file)) : "token");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
        throw usage("NAME", `--name ${JSON.stringify(name.slice(0, 40))}: a token's name is letters, digits, "_", "-" and "." (at most 64), starting with a letter or digit`);
    }
    const { options, file } = await configFor(values, cwd, "token");
    const profiles = Object.keys(options?.policy?.profiles ?? {});
    if (options && values.profile !== undefined && !profiles.includes(values.profile)) {
        const near = closest(values.profile, profiles);
        throw usage("PROFILE", `--profile: no profile "${values.profile.slice(0, 60)}" in policy.profiles of ${values.config}${near ? `; did you mean "${near}"?` : ""}`);
    }
    const entry = { name, ...(file ? { file: configPath(file, options?.baseDir ?? cwd) } : {}), ...(values.scope?.length ? { scopes: values.scope } : {}), ...(values.profile !== undefined ? { profile: values.profile } : {}) };
    // --add: the new configuration checked before anything is written
    const added = values.add ? await changedConfig(resolve(cwd, values.config), values.config, options, (raw) => withToken(raw, entry, values.config, values["if-missing"] && sameFileIn(options))) : null;
    const secret = await secretOf(values, SECRET_BYTES.token, "token", tokenProblem, cwd);
    const warnings = [...secret.warnings];
    if (secret.replaced) {
        warnings.push(`${values.file} replaced: clients that still send the old token get 401 from now on`);
    }
    const backup = added && !("done" in added) ? await writeConfig(added, values) : null;
    warnings.push(...(added && "notes" in added ? added.notes : []));
    const hints = added && "done" in added ? [`kept ${values.file} (usable); already configured in ${values.config}`] : tokenHints({ values, entry, options, backup, secret });
    const json = { name, ...(file ? { file: secret.file, created: secret.created, replaced: secret.replaced } : {}), ...(added ? { config: added.path, configured: "done" in added ? "already" : "added", backup } : {}) };
    return { json, value: secret.value, hints, warnings, printValue: !file || Boolean(values.print), field: "token" };
}

/**
 * With --if-missing, whether two file references of the configuration name one file (relative ones
 * from its base directory); else false.
 * @param {any} options  the configuration as loadConfig read it
 * @returns {(a: unknown, b: unknown) => boolean}
 */
const sameFileIn = (options) => (a, b) => typeof a === "string" && typeof b === "string" && pathOf(options, a) === pathOf(options, b);

/**
 * auth.tokens with the entry added; refused for a name that is there, for auth.mode oauth or none.
 * With --if-missing (`same`), an entry of that name with the same file, scopes and profile is done.
 * @param {any} raw  the configuration's JSON
 * @param {Record<string, any>} entry
 * @param {string} config  as given, for messages
 * @param {false | ((a: unknown, b: unknown) => boolean)} same
 * @returns {{ next: any, notes: string[] } | { done: true }}
 */
function withToken(raw, entry, config, same) {
    const auth = raw.auth ?? {};
    const tokens = auth.tokens ?? [];
    const there = tokens.find((t) => t?.name === entry.name);
    if (there && same && auth.mode === "token" && same(there.file, entry.file) && JSON.stringify(there.scopes ?? null) === JSON.stringify(entry.scopes ?? null) && (there.profile ?? null) === (entry.profile ?? null)) {
        return { done: /** @type {const} */ (true) };
    }
    if (there) {
        throw usage("DUPLICATE", `a token named "${entry.name}" is already in auth.tokens of ${config}; give another --name, or replace its file's value with --force`);
    }
    // a file without auth.mode gets "token"; one that chose none or oauth is not changed behind its back
    if (auth.mode !== undefined && auth.mode !== "token") {
        throw usage("AUTH_MODE", `auth.mode is "${auth.mode}" in ${config}: static tokens are used with auth.mode "token" only${auth.mode === "none" ? '; set it to "token" first' : ""}`);
    }
    /** @type {string[]} */
    const notes = [];
    if (auth.mode === undefined) {
        notes.push(`${config} had no auth.mode: it is "token" now, so every request needs a token`);
    }
    if (!tokens.length) {
        // auth.js staticTokens: the variable's token counts only while auth.tokens is empty
        notes.push(`$${TOKEN_ENV} (pivotkit-mcp: $PIVOTKIT_MCP_TOKEN) is no longer read once auth.tokens lists a token: clients that send it get 401 after the restart; give them a token of auth.tokens`);
    }
    return { next: { ...raw, auth: { ...auth, mode: "token", tokens: [...tokens, entry] } }, notes };
}

/** Whether the server of these options serves MCP: http.enable names it, or is not set (MCP where pivotkit-mcp is installed). */
const servesMcp = (options) => !options?.http?.enable || options.http.enable.includes("mcp");

/** What to do next with a new token, for a terminal. */
function tokenHints({ values, entry, options, backup, secret }) {
    if (values.file && !secret.created && !secret.replaced) {
        return [`kept ${values.file} (usable)`];
    }
    const hints = [];
    const config = values.config ?? "your configuration";
    if (backup) {
        hints.push(`Added the token "${entry.name}" to auth.tokens. ${rewrittenLine(values, backup)}`);
    } else if (!values.file) {
        hints.push(`Keep it where only the server reads it (pivotkit-server token new --file <path>), and add to auth.tokens of ${config}:`, `  ${snippetOf({ name: entry.name, file: "<path>" })}  or  ${snippetOf({ name: entry.name, env: "<VARIABLE>" })}`);
    } else if (!secret.replaced) {
        hints.push(`Add it to auth.tokens of ${config} (auth.mode "token"):`, `  ${snippetOf(entry)}`);
    }
    if (!values.profile && !secret.replaced && Object.keys(options?.policy?.profiles ?? {}).length) {
        hints.push(`It has no profile: --profile gives it one of ${Object.keys(options.policy.profiles).join(", ")} (policy.profiles).`);
    }
    hints.push(secret.replaced ? "The server reads the file on every request: no restart." : "Restart the server: it reads the list of tokens at start.");
    if (!values.file) {
        return hints;
    }
    const url = baseUrlOf(options);
    const file = values.file;
    hints.push(
        "Try it (curl reads the header from stdin, so the token is in no command line):",
        `  printf 'header = "Authorization: Bearer %s"\\n' "$(cat ${quoted(file)})" | curl -K - ${url}${REST_BASE}/sources`,
        `  PowerShell: Invoke-RestMethod -Headers @{ Authorization = "Bearer $(Get-Content ${psQuoted(file)})" } ${url}${REST_BASE}/sources`
    );
    if (servesMcp(options)) {
        // claude's own command line holds the header: it keeps it in its configuration anyway
        hints.push(
            `  claude mcp add --transport http pivotkit ${url}/mcp --header "Authorization: Bearer $(cat ${quoted(file)})"${options ? "" : "  (where the server serves MCP)"}`,
            "    (this line puts the token into the process list and your shell's history; Claude Code keeps it in its configuration)"
        );
    }
    if (process.platform === "win32") {
        hints.push(`On Windows the file takes the permissions of its folder. To keep it to your account (PowerShell): icacls ${JSON.stringify(file)} /inheritance:r /grant:r "\${env:USERNAME}:F"; that also takes away SYSTEM and Administrators, so a server that runs as a service needs its own grant (/grant "<account>:R").`);
    } else {
        hints.push("The file is readable by you only (0600): the server must run as the same user, or give it to the server's user (chown).");
    }
    return hints;
}

/** The usage line of `key new`, for its errors. */
const KEY_USAGE = "pivotkit-server key new --for downloads|audit [--file <path>] [--config <file> --add]";

/**
 * `key new`.
 * @returns {Promise<Outcome>}
 */
async function keyNew(argv, io) {
    const { values } = parse("key new", argv);
    if (!values.for || !KEY_USES.includes(values.for)) {
        const near = values.for ? closest(values.for, [...KEY_USES]) : null;
        throw usage("FOR", `--for must be ${KEY_USES.join(" or ")}${values.for ? `, not ${JSON.stringify(values.for.slice(0, 40))}` : ""}${near ? `; did you mean "${near}"?` : ""}\nusage: ${KEY_USAGE}`);
    }
    checkWriteFlags(values);
    const cwd = io.cwd ?? process.cwd();
    const use = KEY_OPTIONS[/** @type {keyof typeof KEY_OPTIONS} */ (values.for)];
    const { options, file } = await configFor(values, cwd, "key");
    const ref = file ? { file: configPath(file, options?.baseDir ?? cwd) } : null;
    const added = values.add ? await changedConfig(resolve(cwd, values.config), values.config, options, (raw) => withKey(raw, values.for, ref, values.config, values["if-missing"] && sameFileIn(options))) : null;
    const secret = await secretOf(values, SECRET_BYTES.key, "key", keyProblem(values.for), cwd);
    const warnings = [...secret.warnings];
    if (secret.replaced && values.for === "downloads") {
        warnings.push(`${values.file} replaced: download links made with the old key stop working within a second`);
    }
    const backup = added && !("done" in added) ? await writeConfig(added, values) : null;
    warnings.push(...(added && "notes" in added ? added.notes : []));
    let hints;
    if (values.file && !secret.created && !secret.replaced) {
        hints = [`kept ${values.file} (usable)${added && "done" in added ? `; already configured in ${values.config}` : ""}`];
    } else if (backup) {
        hints = [`Named it as ${use.option}. ${rewrittenLine(values, backup)}`, use.after];
    } else if (ref) {
        hints = [`Name it as ${use.option} in ${values.config ?? "your configuration"}:`, `  ${use.snippet(ref.file)}`, use.after];
    } else {
        hints = [`Keep it in a file only the server reads (pivotkit-server key new --for ${values.for} --file <path>) and name it as ${use.option}: ${snippetOf({ file: "<path>" })}.`];
    }
    const json = { for: values.for, ...(file ? { file: secret.file, created: secret.created, replaced: secret.replaced } : {}), ...(added ? { config: added.path, configured: "done" in added ? "already" : "added", backup } : {}) };
    return { json, value: secret.value, hints, warnings, printValue: !file || Boolean(values.print), field: "key" };
}

/**
 * output.downloads.key or audit.key named in the configuration; refused where it is set already,
 * unless --if-missing (`same`) finds it naming this file.
 * @param {any} raw  the configuration's JSON
 * @param {"downloads" | "audit"} use
 * @param {{ file: string }} ref
 * @param {string} config  as given, for messages
 * @param {false | ((a: unknown, b: unknown) => boolean)} same
 * @returns {{ next: any, notes: string[] } | { done: true }}
 */
function withKey(raw, use, ref, config, same) {
    /** @type {string[]} */
    const notes = [];
    const there = use === "downloads" ? raw.output?.downloads?.key : raw.audit?.key;
    if (there && same && same(there.file, ref.file)) {
        return { done: /** @type {const} */ (true) };
    }
    if (use === "downloads") {
        if (raw.output?.downloads?.key) {
            throw usage("DUPLICATE", `output.downloads.key is set already in ${config}; replace its file's value with --force instead`);
        }
        return { next: { ...raw, output: { ...raw.output, downloads: { ...raw.output?.downloads, key: ref } } }, notes };
    }
    if (raw.audit?.key) {
        throw usage("DUPLICATE", `audit.key is set already in ${config}; replace its file's value with --force instead`);
    }
    if (raw.audit?.subject !== "hash") {
        notes.push(`audit.key is used with audit.subject "hash" only; ${config} has ${raw.audit?.subject === undefined ? "no audit.subject" : `audit.subject "${raw.audit.subject}"`}`);
    }
    return { next: { ...raw, audit: { ...raw.audit, key: ref } }, notes };
}

/**
 * The value of the token `name` of auth.tokens as the server reads it (auth.js staticTokens: a file
 * trimmed, a variable as it is), checked by its rules; a usage error for a name that is not there, a
 * CommandError (1) for one that cannot be read or used.
 * @param {any} options  as loadConfig read them
 * @param {string} name
 * @param {Record<string, string | undefined>} env
 * @param {string} config  the file as given, for messages
 * @returns {Promise<string>}
 */
async function configuredToken(options, name, env, config) {
    const tokens = options.auth?.tokens ?? [];
    const token = tokens.find((t) => t.name === name);
    if (!token) {
        const near = closest(name, tokens.map((t) => t.name));
        throw usage("UNKNOWN_TOKEN", `no token "${name.slice(0, 60)}" in auth.tokens of ${config}${near ? `; did you mean "${near}"?` : tokens.length ? `; there are ${tokens.map((t) => t.name).join(", ")}` : ""}`);
    }
    let value;
    if (token.file) {
        value = await readSecretFile(pathOf(options, token.file)).then(
            (text) => text.trim(),
            (e) => {
                throw new CommandError(1, e?.code === "UTF16" ? "UTF16" : "UNREADABLE", e?.code === "UTF16" ? `the token "${name}" (${token.file}) ${UTF16_TEXT}` : `the token "${name}" (${token.file}) cannot be read (${unreadable(e?.code)})`);
            }
        );
    } else {
        value = env[/** @type {string} */ (token.env)] ?? "";
        if (!value) {
            throw new CommandError(1, "UNSET", `the token "${name}" comes from $${token.env}, which is not set here`);
        }
    }
    const why = tokenProblem(value);
    if (why) {
        throw new CommandError(1, "UNUSABLE", `the token "${name}" (${token.file ?? `$${token.env}`}) cannot be used: ${why}; make a new one with pivotkit-server token new${token.file ? " --file <its file> --force" : ""}`);
    }
    return value;
}

/**
 * `token show`.
 * @returns {Promise<Outcome>}
 */
async function tokenShow(argv, io) {
    const { values, positionals } = parse("token show", argv, true);
    if (positionals.length !== 1) {
        throw usage("NAME", "token show takes the name of one token of auth.tokens: pivotkit-server token show <name> [--config file]");
    }
    const [name] = positionals;
    const config = values.config ?? io.env[CONFIG_ENV];
    if (!config) {
        throw usage("NO_CONFIG", `token show reads the configuration file: give --config <file> or set $${CONFIG_ENV}`);
    }
    const options = await configOf(resolve(io.cwd ?? process.cwd(), config));
    const value = await configuredToken(options, name, io.env, config);
    return { json: { name }, value, hints: [], warnings: [], printValue: true, field: "token" };
}

/**
 * Runs `token ...` or `key ...` and writes its output.
 * @param {"token" | "key"} group
 * @param {string[]} argv  after the group's word
 * @param {any} io
 * @returns {Promise<number>}
 */
export async function credentialsCommand(group, argv, io) {
    const [sub, ...rest] = argv;
    const command = `${group} ${sub ?? ""}`.trim();
    // the flags as the command's parser reads them: a value or a word after "--" is no flag
    const seen = /** @type {Record<string, any>} */ (parseArgs({ args: rest, options: /** @type {any} */ (FLAGS[/** @type {keyof typeof FLAGS} */ (command)] ?? { help: FLAGS["token new"].help }), strict: false, allowPositionals: true }).values);
    const json = seen.json === true;
    if (!sub || sub === "--help" || sub === "-h" || seen.help === true) {
        io.stdout.write(helpOf(group));
        return sub ? 0 : 2;
    }
    try {
        const runner = command === "token new" ? tokenNew : command === "token show" ? tokenShow : command === "key new" ? keyNew : null;
        if (!runner) {
            const known = Object.keys(FLAGS).filter((c) => c.startsWith(group)).map((c) => c.split(" ")[1]);
            const near = closest(sub, known);
            throw usage("UNKNOWN_COMMAND", `unknown command "${group} ${sub.slice(0, 40)}"${near ? `; did you mean "${group} ${near}"?` : ""}; run "pivotkit-server ${group} --help"`);
        }
        const out = await runner(rest, io);
        if (json) {
            io.stdout.write(`${JSON.stringify({ ok: true, exitCode: 0, command, ...out.json, ...(out.printValue ? { [out.field]: out.value } : {}), warnings: out.warnings })}\n`);
            return 0;
        }
        if (out.printValue) {
            io.stdout.write(`${out.value}\n`);
        }
        for (const warning of out.warnings) {
            io.stderr.write(`pivotkit-server: warning: ${warning}\n`);
        }
        if (io.stderr.isTTY && out.hints.length) {
            io.stderr.write(`${out.hints.join("\n")}\n`);
        }
        return 0;
    } catch (e) {
        const error = e instanceof CommandError ? e : new CommandError(1, String(e?.code ?? "FAILED"), `${command}: ${String(e?.message ?? e).slice(0, 300)}`);
        if (json) {
            io.stdout.write(`${JSON.stringify({ ok: false, exitCode: error.exitCode, command, error: { kind: error.kind, code: error.code, message: error.message } })}\n`);
        } else {
            io.stderr.write(`pivotkit-server: ${error.message}\n`);
        }
        return error.exitCode;
    }
}

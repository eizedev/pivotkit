/*
 * The commands that make the server's credentials, loaded by the runner only for them:
 *
 *   pivotkit-server token new [--file <path>] [--name <n>] [--profile <p>] [--scope <s>]...
 *                             [--if-missing | --force] [--print] [--config <file> [--add]] [--json]
 *   pivotkit-server token show <name> [--config <file>] [--state-dir <dir>] [--json]
 *   pivotkit-server key new --for downloads|audit [--file <path>] [--if-missing | --force] [--print] [--json]
 *
 * A token is 32 random bytes and a key 48, in base64url. Without --file the value is the only line
 * on stdout; with --file it is written by secret-file.js and printed only with --print. Hints (the
 * configuration's lines, how to try it) go to stderr, and only on a terminal. `token new` and
 * `key new` read no configuration unless --config is given (the container image sets
 * $PIVOTKIT_CONFIG, and `docker run --rm <image> token new` must work without one); `token show`
 * reads $PIVOTKIT_CONFIG and $PIVOTKIT_STATE_DIR by default and resolves the tokens as the server
 * does (state.js), so `token show admin` prints the token the server made at its first start. Exit codes as the runner's: 0 done, 1 a file that is there,
 * missing or unusable, 2 a usage or configuration error. --json writes one object on stdout, as
 * pivotkit-cli's: { ok, exitCode, command, ..., error?: { kind, code, message } }; the value is in it
 * only where it would be printed. No message and no error holds a value.
 */

import { access, constants as fsConstants, lstat, readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { closest } from "pivotkit-core";
import { isInside } from "pivotkit-cli/files";
import { ConfigError, REST_BASE, loadConfig, pathOf, validateOptions } from "./config.js";
import { madeAtStart } from "./secrets.js";
import { STATE_ENV, configFrom, planState, stateDirOf } from "./state.js";
import { KEY_USES, keyProblem, tokenProblem } from "./secret-rules.js";
import { DEFAULT_PORT, TOKEN_ENV } from "./serve.js";
import { SECRET_BYTES, SecretFileError, newSecret, placeSecret, replaceFile, writeBackup } from "./secret-file.js";

/** The variable that names the configuration file (the runner's CONFIG_ENV, defined there). */
const CONFIG_ENV = "PIVOTKIT_CONFIG";

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
        add: { type: "boolean", text: "Add the token to auth.tokens of --config (a backup <file>.bak first)." },
        json: { type: "boolean", text: "Write one JSON object on stdout." },
        help: { type: "boolean", short: "h", text: "Print this help and exit." }
    },
    "token show": {
        config: { type: "string", value: "file", text: "The configuration file (default $PIVOTKIT_CONFIG)." },
        "state-dir": { type: "string", value: "dir", text: "The server's state directory, where it keeps the tokens it made (default $PIVOTKIT_STATE_DIR)." },
        json: { type: "boolean", text: "Write one JSON object on stdout." },
        help: { type: "boolean", short: "h", text: "Print this help and exit." }
    },
    "key new": {
        for: { type: "string", value: "downloads|audit", text: "What the key is for: output.downloads.key or audit.key (required)." },
        file: { type: "string", value: "path", text: "Write the key to this file (mode 0600, one line) instead of printing it." },
        "if-missing": { type: "boolean", text: "Keep a file that is there (checked: a key the server can use) and exit 0." },
        force: { type: "boolean", text: "Replace a file that is there." },
        print: { type: "boolean", text: "Print the key also when it is written to --file." },
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

/** The secret written (or kept) or made: the value now in place and what happened to the file. */
async function secretOf(values, bytes, kind, usable, cwd) {
    if (!values.file) {
        return { value: newSecret(bytes), file: null, created: false, replaced: false };
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

/** Where clients reach the server: http.publicUrl, else loopback on its port. */
const baseUrlOf = (options) => (options?.http?.publicUrl ? options.http.publicUrl.replace(/\/+$/, "") : `http://127.0.0.1:${options?.http?.port || DEFAULT_PORT}`);

/** Single quotes for a shell (bash, PowerShell): a path as one word. */
const quoted = (text) => `'${text.replace(/'/g, "'\\''")}'`;
const psQuoted = (text) => `'${text.replace(/'/g, "''")}'`;

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
    if (values.add && (!values.config || !values.file)) {
        throw usage("ADD_NEEDS", "--add writes the token into --config <file> and needs --file <path> for the token's value");
    }
    const cwd = io.cwd ?? process.cwd();
    const name = values.name ?? (values.file ? basename(values.file, extname(values.file)) : "token");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
        throw usage("NAME", `--name ${JSON.stringify(name.slice(0, 40))}: a token's name is letters, digits, "_", "-" and "." (at most 64), starting with a letter or digit`);
    }
    const options = values.config ? await configOf(resolve(cwd, values.config)) : null;
    const profiles = Object.keys(options?.policy?.profiles ?? {});
    if (options && values.profile !== undefined && !profiles.includes(values.profile)) {
        const near = closest(values.profile, profiles);
        throw usage("PROFILE", `--profile: no profile "${values.profile.slice(0, 60)}" in policy.profiles of ${values.config}${near ? `; did you mean "${near}"?` : ""}`);
    }
    const file = values.file ? resolve(cwd, values.file) : null;
    if (options && file && options.output?.dir) {
        // the server prunes and serves output.dir: a token there could be deleted or downloaded
        const out = pathOf(options, options.output.dir);
        if (isInside(file, out)) {
            throw usage("IN_OUTPUT", `${values.file}: lies inside output.dir (${options.output.dir}); keep the token outside the directory the server writes reports to`);
        }
    }
    const entry = { name, ...(file ? { file: configPath(file, options?.baseDir ?? cwd) } : {}), ...(values.scope?.length ? { scopes: values.scope } : {}), ...(values.profile !== undefined ? { profile: values.profile } : {}) };
    // --add: the new configuration checked before anything is written
    const added = values.add ? await withToken(resolve(cwd, values.config), values.config, entry, /** @type {any} */ (options)) : null;
    const secret = await secretOf(values, SECRET_BYTES.token, "token", tokenProblem, cwd);
    const warnings = [];
    if (secret.replaced) {
        warnings.push(`${values.file} replaced: clients that still send the old token get 401 from now on`);
    }
    let backup = null;
    if (added) {
        try {
            backup = await writeBackup(added.path, added.before, added.mode);
            await replaceFile(added.path, added.text, added.mode, values.config);
        } catch (e) {
            const why = String(e?.message ?? e).slice(0, 200);
            throw new CommandError(1, "CONFIG_NOT_WRITTEN", `${values.config} was not changed (${why}); the token's file ${values.file} is written: run the same command with --if-missing instead of a new token`);
        }
        warnings.push(...added.notes);
    }
    const hints = tokenHints({ values, entry, options, added: Boolean(added), backup, secret });
    const json = { name, ...(file ? { file: secret.file, created: secret.created, replaced: secret.replaced } : {}), ...(added ? { config: added.path, backup } : {}) };
    return { json, value: secret.value, hints, warnings, printValue: !file || Boolean(values.print), field: "token" };
}

/**
 * The configuration file with the entry added to auth.tokens, checked by validateOptions; refused for
 * a name that is there, for auth.mode oauth or none. The file's indentation, line ends and BOM kept.
 * @param {string} path  the configuration file, absolute
 * @param {string} config  as given, for messages
 * @param {Record<string, unknown>} entry
 * @param {any} options  the file as loadConfig read it
 */
async function withToken(path, config, entry, options) {
    // replaceFile renames over it: a link (a mounted ConfigMap is one) or a directory that cannot be
    // written is refused now, before the token's file is written
    const info = await lstat(path);
    if (!info.isFile()) {
        throw usage("CONFIG_NOT_WRITABLE", `${config}: is ${info.isSymbolicLink() ? "a symbolic link (a mounted ConfigMap is one)" : "not a regular file"}; --add replaces the file, so add the entry where the file comes from`);
    }
    const writable = await access(dirname(path), fsConstants.W_OK).then(() => true, () => false);
    if (!writable) {
        throw usage("CONFIG_NOT_WRITABLE", `${config}: its directory cannot be written (the backup and the new file go there); add the entry by hand`);
    }
    const before = await readFile(path, "utf8");
    const mode = info.mode & 0o777;
    const bom = before.startsWith("\uFEFF") ? "\uFEFF" : "";
    const raw = JSON.parse(before.slice(bom.length));
    const auth = raw.auth ?? {};
    const tokens = auth.tokens ?? [];
    if (tokens.some((t) => t?.name === entry.name)) {
        throw usage("DUPLICATE", `a token named "${entry.name}" is already in auth.tokens of ${config}; give another --name, or replace its file's value with --force`);
    }
    // a file without auth.mode gets "token"; one that chose none or oauth is not changed behind its back
    if (auth.mode !== undefined && auth.mode !== "token") {
        throw usage("AUTH_MODE", `auth.mode is "${auth.mode}" in ${config}: static tokens are used with auth.mode "token" only${auth.mode === "none" ? '; set it to "token" first' : ""}`);
    }
    const next = { ...raw, auth: { ...auth, mode: "token", tokens: [...tokens, entry] } };
    const notes = [];
    if (auth.mode === undefined) {
        notes.push(`${config} had no auth.mode: it is "token" now, so every request needs a token`);
    }
    if (!tokens.length) {
        // auth.js staticTokens: the variable's token counts only while auth.tokens is empty
        notes.push(`$${TOKEN_ENV} (pivotkit-mcp: $PIVOTKIT_MCP_TOKEN) is no longer read once auth.tokens lists a token: clients that send it get 401 after the restart; give them a token of auth.tokens`);
    }
    try {
        validateOptions({ ...structuredClone(next), baseDir: options.baseDir });
    } catch (e) {
        throw e instanceof ConfigError ? usage("CONFIG", e.message) : e;
    }
    const indent = /^([ \t]+)"/m.exec(before)?.[1] ?? "  ";
    const eol = before.includes("\r\n") ? "\r\n" : "\n";
    const body = JSON.stringify(next, null, indent).replace(/\n/g, eol);
    const text = `${bom}${body}${/\r?\n$/.test(before) ? eol : ""}`;
    return { path, before, text, mode, notes };
}

/** What to do next with a new token, for a terminal. */
function tokenHints({ values, entry, options, added, backup, secret }) {
    const hints = [];
    const config = values.config ?? "your configuration";
    if (added) {
        hints.push(`Added the token "${entry.name}" to auth.tokens of ${values.config} (the old file kept as ${basename(/** @type {string} */ (backup))}).`);
    } else if (!values.file) {
        hints.push(`Keep it where only the server reads it, e.g. pivotkit-server token new --file <path>, and add to auth.tokens of ${config}:`, `  { "name": "${entry.name}", "file": "<path>" }  or  { "name": "${entry.name}", "env": "<VARIABLE>" }`);
    } else if (!secret.replaced) {
        hints.push(`Add it to auth.tokens of ${config} (auth.mode "token"):`, `  ${JSON.stringify(entry)}`);
    }
    if (!values.profile && !secret.replaced && Object.keys(options?.policy?.profiles ?? {}).length) {
        hints.push(`It has no profile: --profile gives it one of ${Object.keys(options.policy.profiles).join(", ")} (policy.profiles).`);
    }
    if (!secret.replaced) {
        hints.push("Restart the server: it reads the list of tokens at start.");
    } else {
        hints.push("The server reads the file on every request: no restart.");
    }
    if (values.file) {
        const url = baseUrlOf(options);
        const file = values.file;
        hints.push(
            "Try it:",
            `  curl -H "Authorization: Bearer $(cat ${quoted(file)})" ${url}${REST_BASE}/sources`,
            `  PowerShell: $t = (Get-Content -Raw ${psQuoted(file)}).Trim(); Invoke-RestMethod -Headers @{ Authorization = "Bearer $t" } ${url}${REST_BASE}/sources`,
            `  claude mcp add --transport http pivotkit ${url}/mcp --header "Authorization: Bearer $(cat ${quoted(file)})"`
        );
        if (process.platform === "win32") {
            hints.push(`On Windows the file takes the permissions of its folder; to keep it to your account (PowerShell): icacls ${JSON.stringify(file)} /inheritance:r /grant:r "\${env:USERNAME}:F"`);
        } else if (!secret.created && !secret.replaced) {
            // kept: nothing to say about its owner
        } else {
            hints.push("The file is readable by you only (0600): the server must run as the same user, or give it to the server's user (chown).");
        }
    }
    return hints;
}

/**
 * `key new`.
 * @returns {Promise<Outcome>}
 */
async function keyNew(argv, io) {
    const { values } = parse("key new", argv);
    const uses = [...KEY_USES];
    if (!values.for || !uses.includes(values.for)) {
        const near = values.for ? closest(values.for, uses) : null;
        throw usage("FOR", `--for must be ${uses.join(" or ")}${values.for ? `, not ${JSON.stringify(values.for.slice(0, 40))}` : ""}${near ? `; did you mean "${near}"?` : ""}`);
    }
    checkWriteFlags(values);
    const use = KEY_OPTIONS[/** @type {keyof typeof KEY_OPTIONS} */ (values.for)];
    const secret = await secretOf(values, SECRET_BYTES.key, "key", keyProblem(values.for), io.cwd ?? process.cwd());
    const warnings = secret.replaced && values.for === "downloads" ? [`${values.file} replaced: download links made with the old key stop working within a second`] : [];
    const hints = values.file ? [`Name it as ${use.option} in your configuration:`, `  ${use.snippet(values.file)}`, use.after] : [`Keep it in a file only the server reads (pivotkit-server key new --for ${values.for} --file <path>) and name it as ${use.option}: { "file": "<path>" }.`];
    const json = { for: values.for, ...(values.file ? { file: secret.file, created: secret.created, replaced: secret.replaced } : {}) };
    return { json, value: secret.value, hints, warnings, printValue: !values.file || Boolean(values.print), field: "key" };
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
    // auth.js staticTokens: the variable's token, named "token", while auth.tokens lists none
    const tokens = options.auth?.tokens?.length ? options.auth.tokens : options.auth?.mode === "token" ? [{ name: "token", env: TOKEN_ENV }] : [];
    const token = tokens.find((t) => t.name === name);
    if (!token) {
        const near = closest(name, tokens.map((t) => t.name));
        throw usage("UNKNOWN_TOKEN", `no token "${name.slice(0, 60)}" in auth.tokens of ${config}${near ? `; did you mean "${near}"?` : tokens.length ? `; there are ${tokens.map((t) => t.name).join(", ")}` : ""}`);
    }
    if (await madeAtStart(token, options)) {
        throw new CommandError(1, "NOT_CREATED", `the token "${name}" is not created yet (${token.file}); start the server first, it makes the token at its first start`);
    }
    let value;
    if (token.file) {
        value = await readFile(pathOf(options, token.file), "utf8").then(
            (text) => text.trim(),
            (e) => {
                throw new CommandError(1, "UNREADABLE", `the token "${name}" (${token.file}) cannot be read (${e?.code === "ENOENT" ? "no such file" : e?.code === "EACCES" ? "permission denied" : "unreadable"})`);
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
 * `token show`: the token as the server resolves it (state.js planState): auth.tokens, the token the
 * state directory holds where auth needs one and none is given, and the one of $PIVOTKIT_TOKEN
 * ("token"); a token made at the first start that is not there yet is not made here.
 * @returns {Promise<Outcome>}
 */
async function tokenShow(argv, io) {
    const { values, positionals } = parse("token show", argv, true);
    if (positionals.length !== 1) {
        throw usage("NAME", "token show takes the name of one token of auth.tokens: pivotkit-server token show <name> [--config file] [--state-dir dir]");
    }
    const [name] = positionals;
    const cwd = io.cwd ?? process.cwd();
    const stateDir = stateDirOf(values["state-dir"], io.env, cwd);
    const config = values.config ?? io.env[CONFIG_ENV];
    if (!config && !stateDir) {
        throw usage("NO_CONFIG", `token show reads the configuration file or the state directory: give --config <file> or --state-dir <dir>, or set $${CONFIG_ENV} or $${STATE_ENV}`);
    }
    let options;
    try {
        options = (await configFrom({ flag: values.config && resolve(cwd, values.config), fromEnv: io.env[CONFIG_ENV] && resolve(cwd, io.env[CONFIG_ENV]), stateDir }))?.options ?? { baseDir: cwd };
        // the address is not known here (the image passes --host to serve): taken as off loopback
        options = planState(options, { env: io.env, host: null, tokenEnv: TOKEN_ENV, stateDir }).options;
    } catch (e) {
        throw e instanceof ConfigError ? usage("CONFIG", e.message) : e;
    }
    const value = await configuredToken(options, name, io.env, config ?? stateDir);
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
    const json = rest.includes("--json");
    if (!sub || sub === "--help" || sub === "-h" || rest.includes("--help") || rest.includes("-h")) {
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

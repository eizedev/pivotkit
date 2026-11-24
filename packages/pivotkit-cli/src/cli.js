/*
 * pivotkit: the command line of pivotkit-report. `main()` runs one command with its input and output
 * streams given (bin/pivotkit.js passes the process's), so tests can run it in the process too.
 *
 * Contract (docs/reference/cli.md): exit code 0 done, 1 findings (an error in the view, or a warning
 * with --strict), 2 a usage, file, limit or template error, 3 the sign-in has ended (pivotkit token:
 * run pivotkit login again). --json writes one object on stdout:
 * { ok, exitCode, command, findings: [{ severity, code, path, message, suggestion }], error?: { kind,
 * code, message }, output?, ... }; a server's error (kind "remote") adds its status and retryAfter.
 * Locally no network; with --now the output is the same on every run. With --url or --source,
 * render, validate and describe run on a pivotkit-server's source and `sources` lists them
 * (remote-commands.js); which options act where is the option table's `where` (commands.js).
 *
 * This file takes the command and its options, runs it and writes its outcome. Each command is a
 * module of its own: render.js, validate.js, describe.js (suggest.js), examples.js, sign-in.js and
 * remote-commands.js.
 */

import { COMMANDS, GLOBAL_OPTIONS, SHELLS } from "./commands.js";
import { CliError, asCliError, printable } from "pivotkit-node/files";
import { describeCommand } from "./describe.js";
import { RemoteError } from "./errors.js";
import { exampleCommand } from "./examples.js";
import { completionScript, helpText } from "./help.js";
import { context } from "./inputs.js";
import { checkChoices, checkValues, checkWhere, didYouMean, envDefaults, parse } from "./options.js";
import { remoteCommand } from "./remote-commands.js";
import { renderCommand } from "./render.js";
import { loginCommand, logoutCommand, tokenCommand } from "./sign-in.js";
import { validateCommand } from "./validate.js";
import { environment, versions } from "./versions.js";

export { environment, versions };

/**
 * @typedef {object} Io
 * @property {AsyncIterable<Uint8Array> & { isTTY?: boolean }} stdin
 * @property {{ write(chunk: string | Uint8Array): unknown, isTTY?: boolean }} stdout
 * @property {{ write(chunk: string | Uint8Array): unknown }} stderr
 * @property {Record<string, string | undefined>} env
 * @property {string} cwd
 * @property {string} [program]  how the user ran it, for the pointers to its help (default "pivotkit"; pivotkit-server: "pivotkit-server cli")
 */

/**
 * @typedef {object} Outcome  what a command gives back
 * @property {any[]} findings
 * @property {Record<string, any>} [extra]  its fields of the --json object
 * @property {string | null} [note]  the line for a person: what was written or checked
 * @property {boolean} [noteIsError]  the note says why nothing was written: shown with -q too
 */

/**
 * @typedef {object} Output  how main() writes
 * @property {boolean} json  --json: one object on stdout
 * @property {string} program  the name a user typed to run it, for the pointers to its help
 * @property {(text: string) => void} say  a line on stderr
 */

/** The most findings stderr lists; --json has them all. */
const PRINTED_FINDINGS = 200;

/** The commands that run on local files; with --url or --source they run on a server (remote-commands.js). */
const LOCAL_COMMANDS = Object.freeze({ render: renderCommand, validate: validateCommand, describe: describeCommand, example: exampleCommand });

/**
 * Runs one command. Never throws: every error ends in its exit code and message.
 * @param {string[]} argv  the arguments after "pivotkit"
 * @param {Io} io
 * @returns {Promise<number>}  the exit code
 */
export async function main(argv, io) {
    /** @type {Output} */
    const out = { json: argv.includes("--json"), program: io.program ?? "pivotkit", say: (text) => io.stderr.write(`${text}\n`) };
    /** @type {any[]} */
    let findings = [];
    try {
        const ran = await run(argv, io, out);
        if (typeof ran === "number") {
            return ran;
        }
        findings = ran.outcome.findings;
        return report(ran, io, out);
    } catch (e) {
        return failure(e, { command: commandOf(argv), findings }, io, out);
    }
}

/**
 * The command an error is reported for: the first argument; with an option first, the command named
 * after it, if any. Without a command run (no arguments, --version, --help), the first word.
 * @param {string[]} argv
 */
function commandOf(argv) {
    if (argv.length === 0 || ["--version", "-v", "--help", "-h"].includes(argv[0])) {
        return argv.find((a) => !a.startsWith("-")) ?? "";
    }
    if (argv[0].startsWith("-")) {
        return argv.find((a) => Object.hasOwn(COMMANDS, a)) ?? "";
    }
    return argv[0];
}

/**
 * Runs what the arguments ask for: the exit code of the help, the version, the completions and the
 * sign-in commands, which write their own output; else the command and its outcome.
 * @param {string[]} argv
 * @param {Io} io
 * @param {Output} out
 * @returns {Promise<number | { command: string, values: Record<string, any>, outcome: Outcome }>}
 */
async function run(argv, io, out) {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
        io.stdout.write(helpText());
        return 0;
    }
    if (argv[0] === "--version" || argv[0] === "-v") {
        const v = versions();
        io.stdout.write(out.json ? `${JSON.stringify({ ...v, environment: environment(io.env) })}\n` : `pivotkit-cli ${v["pivotkit-cli"]} (pivotkit-report ${v["pivotkit-report"]}, pivotkit-core ${v["pivotkit-core"]})\n`);
        return 0;
    }
    const command = knownCommand(argv, out.program);
    const { values, positionals } = parse(command, argv.slice(1));
    if (values.help) {
        io.stdout.write(helpText(command));
        return 0;
    }
    checkChoices(command, values);
    if (command === "help" || command === "completion") {
        return helpCommand(command, positionals, io);
    }
    if (command === "login" || command === "token" || command === "logout") {
        return signInCommand(command, values, { io }, out);
    }
    return { command, values, outcome: await runCommand(command, positionals, values, io, out) };
}

/**
 * The command the first argument names: an option there, the server's `serve` or an unknown name is
 * a usage error that says what to run.
 * @param {string[]} argv
 * @param {string} program
 */
function knownCommand(argv, program) {
    const command = argv[0];
    if (command.startsWith("-")) {
        // an option before the command: say where it goes, and claim no command that is none
        const named = argv.find((a) => Object.hasOwn(COMMANDS, a));
        const global = Object.hasOwn(GLOBAL_OPTIONS, command.replace(/^-+/, "").split("=")[0]);
        throw new CliError("usage", "UNKNOWN_OPTION", named && global ? `${printable(JSON.stringify(command))} comes after the command: ${program} ${named} ${printable(command)}; run "${program} --help"` : `unknown option ${printable(JSON.stringify(command))}; run "${program} --help"`);
    }
    if (command === "serve") {
        throw new CliError("usage", "UNKNOWN_COMMAND", 'the server is a package of its own: use "pivotkit-server serve" (npm install --global pivotkit-server pivotkit-mcp)');
    }
    if (!Object.hasOwn(COMMANDS, command)) {
        const near = didYouMean(command, Object.keys(COMMANDS));
        throw new CliError("usage", "UNKNOWN_COMMAND", `unknown command ${printable(JSON.stringify(command))}${near}${near ? " " : "; "}run "${program} --help"`);
    }
    return command;
}

/**
 * help [command] and completion <shell>: the text on stdout.
 * @param {"help" | "completion"} command
 * @param {string[]} positionals
 * @param {Io} io
 */
function helpCommand(command, positionals, io) {
    if (command === "help") {
        if (positionals[0] && !Object.hasOwn(COMMANDS, positionals[0])) {
            throw new CliError("usage", "UNKNOWN_COMMAND", `unknown command ${printable(JSON.stringify(positionals[0]))}${didYouMean(positionals[0], Object.keys(COMMANDS))}`);
        }
        io.stdout.write(helpText(positionals[0]));
        return 0;
    }
    const shell = positionals[0];
    if (!SHELLS.includes(shell)) {
        throw new CliError("usage", "BAD_VALUE", `completion takes one of ${SHELLS.join(", ")}`);
    }
    io.stdout.write(completionScript(/** @type {any} */ (shell)));
    return 0;
}

/**
 * login, token and logout (sign-in.js). token writes the access token alone on stdout (with --json
 * as the object's accessToken); the others write their line on stderr.
 * @param {"login" | "token" | "logout"} command
 * @param {Record<string, any>} values
 * @param {{ io: Io }} ctx
 * @param {Output} out
 * @returns {Promise<number>}
 */
async function signInCommand(command, values, ctx, { json, say }) {
    /** @type {any} */
    const outcome = command === "login" ? await loginCommand(values, ctx) : command === "token" ? await tokenCommand(values, ctx) : await logoutCommand(values, ctx);
    // a warning goes to stderr also with --json and -q: it says where a secret went
    for (const warning of outcome.warnings ?? []) {
        say(`warning: ${warning}`);
    }
    if (json) {
        ctx.io.stdout.write(`${JSON.stringify({ ok: true, exitCode: 0, command, findings: [], ...outcome.extra, ...("token" in outcome ? { accessToken: outcome.token } : {}) })}\n`);
    } else if ("token" in outcome) {
        ctx.io.stdout.write(`${outcome.token}\n`);
    } else if (!values.quiet) {
        say(outcome.note);
    }
    return 0;
}

/**
 * render, validate, describe, example and sources: the options checked and completed from the
 * environment, then the command run locally or on a server (--url or --source on the command line;
 * PIVOTKIT_URL alone is only the address).
 * @param {string} command
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {Io} io
 * @param {Output} out
 * @returns {Promise<Outcome>}
 */
async function runCommand(command, positionals, values, io, { say }) {
    const remote = command === "sources" || values.url !== undefined || values.source !== undefined;
    checkWhere(command, values, remote);
    const { fromEnv, unused } = envDefaults(command, values, io.env, remote);
    if (unused.length && !values.quiet) {
        say(`note: ${unused.join(", ")} ${unused.length === 1 ? "is" : "are"} not used with a server (the server's settings and the view's apply)`);
    }
    checkValues(values, fromEnv);
    const ctx = await context(values, io);
    return remote ? remoteCommand(/** @type {any} */ (command), positionals, values, ctx) : LOCAL_COMMANDS[command](positionals, values, ctx);
}

/**
 * A command's outcome written: --json's object, else its findings and its note on stderr. The exit
 * code: 1 for an error, or a warning with --strict.
 * @param {{ command: string, values: Record<string, any>, outcome: Outcome }} ran
 * @param {Io} io
 * @param {Output} out
 */
function report({ command, values, outcome }, io, { json, say }) {
    const findings = outcome.findings;
    const failing = findings.filter((f) => f.severity === "error" || (values.strict && f.severity === "warning"));
    const exitCode = failing.length > 0 ? 1 : 0;
    if (json) {
        io.stdout.write(`${JSON.stringify({ ok: exitCode === 0, exitCode, command, findings, ...outcome.extra })}\n`);
        return exitCode;
    }
    printFindings(findings, values, say);
    // what was written or checked: a line for a person (not with -q, and an error's line always)
    if (outcome.note && (!values.quiet || outcome.noteIsError)) {
        say(outcome.note);
    }
    return exitCode;
}

/**
 * Whether stderr shows a finding: errors always, warnings without -q, info with --verbose.
 * @param {any} f
 * @param {Record<string, any>} values
 */
const shown = (f, values) => f.severity === "error" || (f.severity === "warning" && !values.quiet) || (f.severity === "info" && values.verbose && !values.quiet);

/**
 * The findings on stderr, a line each with its details. One that follows from another (the fields a
 * data mismatch is about) is counted there; a long list (a server may send many) is cut. --json keeps
 * them all.
 * @param {any[]} findings
 * @param {Record<string, any>} values
 * @param {(text: string) => void} say
 */
function printFindings(findings, values, say) {
    let printed = 0;
    let more = 0;
    for (const f of findings) {
        if (f.followsFrom || !shown(f, values)) {
            continue;
        }
        if (printed >= PRINTED_FINDINGS) {
            more++;
            continue;
        }
        printed++;
        say(`${f.severity} ${f.code}${f.path ? ` at ${f.path}` : ""}: ${f.message}${f.suggestion ? ` (did you mean "${f.suggestion}"?)` : ""}`);
        for (const line of f.details ?? []) {
            say(`  ${line}`);
        }
    }
    if (more > 0) {
        say(`and ${more} more finding${more === 1 ? "" : "s"} (--json lists them all)`);
    }
}

/**
 * An error written: --json's object with the error, else its message on stderr. A usage error ends
 * with the way to the command's help. The exit code: 3 when the sign-in has ended and pivotkit login
 * is needed (sign-in.js SIGN_IN_AGAIN), 2 for every other error.
 * @param {unknown} e
 * @param {{ command: string, findings: any[] }} at  the command and the findings so far
 * @param {Io} io
 * @param {Output} out
 */
function failure(e, { command, findings }, io, { json, program, say }) {
    const error = asCliError(e);
    const failed = /** @type {any} */ (e)?.exitCode === 3 ? 3 : 2;
    // a usage error ends with the way to the command's help, in the form every program of pivotkit uses
    if (error.kind === "usage" && Object.hasOwn(COMMANDS, command) && command !== "help" && !/ help"| --help"/.test(error.message)) {
        error.message = `${error.message}${error.message.endsWith("?") ? " " : "; "}run "${program} ${command} --help"`;
    }
    if (json) {
        // a server's error: its HTTP status (null without an answer) and the seconds it asks to wait
        const remote = error instanceof RemoteError ? { status: error.status, retryAfter: error.retryAfter } : {};
        io.stdout.write(`${JSON.stringify({ ok: false, exitCode: failed, command: command || null, findings, error: { kind: error.kind, code: error.code, message: error.message, ...remote } })}\n`);
    } else {
        say(`pivotkit: ${error.message}`);
    }
    return failed;
}

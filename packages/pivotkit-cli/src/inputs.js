/*
 * The inputs of a command: the context every local command reads its files and stdin through (inside
 * the allowed directories, within --limit's sizes, at most one input from stdin), and the check that
 * an output does not replace one of the inputs.
 */

import { stat } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { LIMITS, OUTSIDE_LIMITS } from "pivotkit-core";
import { CliError, allowedDirs, asCliError, readSafe, readStdin } from "pivotkit-node/files";
import { limitsOf } from "./options.js";

/** The most bytes a view or a template file may have (a view file's characters as UTF-8). */
export const VIEW_BYTES = OUTSIDE_LIMITS.json * 4;
export const TEMPLATE_BYTES = 262_144 * 4;

/**
 * What every command needs: the limits, the allowed directories and how to read a file.
 * @param {Record<string, any>} values
 * @param {import("./cli.js").Io} io
 */
export async function context(values, io) {
    const limits = limitsOf(values.limit);
    const allow = await allowedDirs(values["allow-dir"] ?? [], io.cwd);
    let stdinUsed = null;
    /** Reads a file or stdin ("-"), at most one input from stdin. */
    const readInput = async (path, what, maxBytes, limit) => {
        if (path === "-") {
            if (stdinUsed) {
                throw new CliError("usage", "STDIN_TWICE", `only one input can come from stdin (${stdinUsed} does already)`);
            }
            stdinUsed = what;
            // a terminal, not a pipe: the CLI waits for what is typed, so it says so
            if (io.stdin.isTTY && !values.quiet) {
                io.stderr.write(`reading ${what} from stdin: type or paste it, then Ctrl-D (Ctrl-Z, Enter on Windows)\n`);
            }
            return readStdin(io.stdin, maxBytes, limit);
        }
        try {
            return await readSafe(path, { cwd: io.cwd, allow, maxBytes, limit });
        } catch (e) {
            throw asCliError(e, path);
        }
    };
    const fileLimits = { ...LIMITS, ...limits };
    return { limits, allow, readInput, io, fileLimits, now: values.now, locale: values.locale, timeZone: values["time-zone"] };
}

/** A context whose reader hands back the bytes already read (stdin is read once). */
export function withBytes(ctx, input, bytes) {
    return { ...ctx, readInput: async (path, ...rest) => (path === input ? bytes : ctx.readInput(path, ...rest)) };
}

/** The text of a view or template file, as UTF-8. */
export const textOf = (bytes) => new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");

/**
 * An output (-o, --save-view) that names one of the command's input files would replace it: refused
 * before anything is read or written. stdin and a view as JSON text name no file.
 * @param {any} ctx
 * @param {string} flag
 * @param {string} output
 * @param {Array<[string | undefined, string]>} inputs  each input's path and what it is ("data", "view")
 * @param {string} written  what the output is ("output", "draft")
 */
export async function checkNotInput(ctx, flag, output, inputs, written) {
    // the file -o names, if it is there: one file under another name (a link to its directory, another
    // case of its name where the file system ignores case) is the same device and inode
    const target = await stat(resolvePath(ctx.io.cwd, output)).catch(() => null);
    for (const [path, what] of inputs) {
        if (path === undefined || path === "-" || path.trimStart().startsWith("{")) {
            continue;
        }
        const same = resolvePath(ctx.io.cwd, path) === resolvePath(ctx.io.cwd, output) || (target !== null && (await stat(resolvePath(ctx.io.cwd, path)).then((s) => s.dev === target.dev && s.ino === target.ino, () => false)));
        if (same) {
            throw new CliError("usage", "SAME_FILE", `${flag} names the ${what} file: the ${written} would replace the ${what}; give it another name`);
        }
    }
}

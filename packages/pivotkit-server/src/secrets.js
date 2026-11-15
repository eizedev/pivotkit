/*
 * Secrets the options name by reference (options/shared.js SECRET_REF): `{ env }` or `{ file }`, read
 * on every use, so a rotated file or variable works without a restart. One trailing newline (LF or
 * CR LF) is trimmed; a value with another line break or a NUL, or an empty one, is refused. A
 * SecretError names the reference (the variable, the file as configured), never the value or a full
 * path; nothing here logs. check-config warns of a secret file other users can read
 * (secretFileWarning).
 */

import { readFile, stat } from "node:fs/promises";
import { pathOf } from "./config.js";

export class SecretError extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = "SecretError";
        this.code = "SECRET";
    }
}

/** Why a file could not be read, in words (never the error's own message, which holds the path). */
const unreadable = (code) => (code === "ENOENT" ? "no such file" : code === "EACCES" ? `permission denied for the user ${process.getuid?.() ?? ""} the server runs as` : "unreadable");

/**
 * The value of a secret reference, read now.
 * @param {{ env?: string, file?: string }} ref  checked by SECRET_REF
 * @param {{ baseDir?: string }} options  where a relative file starts
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<string>}
 */
export async function readSecret(ref, options, env = process.env) {
    const where = ref.env ? `$${ref.env}` : `the file ${ref.file}`;
    let text;
    if (ref.env) {
        text = env[ref.env];
        if (text === undefined) {
            throw new SecretError(`${where} is not set`);
        }
    } else {
        try {
            text = await readFile(pathOf(options, /** @type {string} */ (ref.file)), "utf8");
        } catch (e) {
            throw new SecretError(`${where} cannot be read (${unreadable(/** @type {any} */ (e)?.code)})`);
        }
    }
    const value = text.replace(/\r?\n$/, "");
    if (!value) {
        throw new SecretError(`${where} is empty`);
    }
    if (/[\r\n]/.test(value)) {
        throw new SecretError(`${where} holds a line break inside the value; a secret is one line`);
    }
    if (value.includes("\u0000")) {
        throw new SecretError(`${where} holds a NUL character`);
    }
    return value;
}

/**
 * check-config's warning for a secret file other users of the machine can read (group or world
 * bits), or null: for an environment variable, a file only its owner reads, a missing file (said
 * elsewhere) and on Windows (no such modes).
 * @param {{ env?: string, file?: string }} ref
 * @param {{ baseDir?: string }} options
 * @param {string} [label]  how the line names the file
 * @returns {Promise<string | null>}
 */
export async function secretFileWarning(ref, options, label = `the file ${ref.file}`) {
    if (!ref.file || process.platform === "win32") {
        return null;
    }
    const info = await stat(pathOf(options, ref.file)).catch(() => null);
    if (!info || (info.mode & 0o077) === 0) {
        return null;
    }
    return `warning: ${label} can be read by other users of this machine (mode ${(info.mode & 0o777).toString(8)}); make it readable by the server's user only (chmod 600)`;
}

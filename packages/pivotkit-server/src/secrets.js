/*
 * Secrets the options name by reference (options/shared.js SECRET_REF): `{ env }` or `{ file }`, read
 * on every use, so a rotated file or variable works without a restart. One trailing newline (LF or
 * CR LF) is trimmed; a value with another line break or a NUL, or an empty one, is refused. A
 * SecretError names the reference (the variable, the file as configured), never the value or a full
 * path; nothing here logs. check-config warns of a secret file other users can read
 * (secretFileWarning). readSecretFile is the one read of a secret's file (static tokens too): a
 * regular file only (a FIFO or a device is never waited for), at most MAX_SECRET_BYTES, and a file
 * in UTF-16 (PowerShell 5.1's ">") named as such. A key's file that starts with a UTF-8 byte order
 * mark is refused (UTF8_BOM_TEXT): the mark would be part of the key, unseen. A token is trimmed,
 * which removes it.
 */

import { CodedError } from "pivotkit-core/internal";
import { constants } from "node:fs";
import { lstat, open, stat } from "node:fs/promises";
import { pathOf } from "./config.js";

/** @extends {CodedError<string, undefined>} */
export class SecretError extends CodedError {
    /** @param {string} message */
    constructor(message) {
        super("SECRET", message);
        this.name = "SecretError";
    }
}

/** The longest secret file read; a secret is one short line. */
export const MAX_SECRET_BYTES = 4096;

/** What a secret file in UTF-16 is told. */
export const UTF16_TEXT = "looks like UTF-16 (PowerShell 5.1's > writes it); write it with pivotkit-server token new --file <path> --force (a key: key new --for downloads|audit|browser)";

/** What a key's file that starts with a UTF-8 byte order mark is told. */
const UTF8_BOM_TEXT = "starts with a UTF-8 byte order mark (Windows PowerShell 5.1's -Encoding UTF8 writes one), which would become part of the key; save it as UTF-8 without one, or write it with pivotkit-server key new --for downloads|audit|browser --file <path> --force";

/**
 * Why a key's text cannot be used as it is read, or null: a UTF-8 byte order mark at its start. A
 * token is trimmed (secretValue), which removes the mark, so only a key is refused.
 * @param {string} text  the file's text
 * @param {string} kind  "token", or another kind of secret
 */
export const bomProblem = (text, kind) => (kind !== "token" && text.startsWith("\uFEFF") ? UTF8_BOM_TEXT : null);

/**
 * Whether a file's bytes are UTF-16 rather than UTF-8: a byte order mark FF FE or FE FF, or NUL bytes
 * in a quarter or more of them (UTF-16 without a mark: ASCII text has one in every other byte). A
 * lone NUL is no UTF-16: readSecret refuses it as such.
 * @param {Uint8Array} bytes
 */
export const looksUtf16 = (bytes) => (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes.length > 1 && bytes.filter((b) => b === 0).length * 4 >= bytes.length);

/**
 * Why a file could not be read, in words (never the error's own message, which holds the path).
 * @param {string | undefined} code  a system error's code or readSecretFile's
 */
export function unreadable(code) {
    /** @type {Record<string, () => string>} */
    const words = {
        ENOENT: () => "no such file",
        EACCES: () => `permission denied for the user ${process.getuid?.() ?? ""} the server runs as`,
        NOT_REGULAR_FILE: () => "not a regular file",
        TOO_LARGE: () => `longer than ${MAX_SECRET_BYTES} bytes`,
        UTF16: () => UTF16_TEXT
    };
    return code !== undefined && Object.hasOwn(words, code) ? words[code]() : "unreadable";
}

/**
 * A secret's value from its text, as the server reads each kind: a static token without the
 * whitespace around it (a bearer token holds none), any other secret (a key) without one trailing
 * line ending, since spaces may be part of a key.
 * @param {string} text
 * @param {string} kind  "token", or another kind of secret
 */
export const secretValue = (text, kind) => (kind === "token" ? text.trim() : text.replace(/\r?\n$/, ""));

/**
 * The text of an open secret file and its stats: a regular file, at most MAX_SECRET_BYTES however
 * much the file grows while it is read, UTF-8. An error with the code NOT_REGULAR_FILE, TOO_LARGE
 * or UTF16. readSecretFile and a kept secret (secret-file.js) read through it.
 * @param {import("node:fs/promises").FileHandle} handle
 * @returns {Promise<{ text: string, info: import("node:fs").Stats }>}
 */
export async function readSecretHandle(handle) {
    const info = await handle.stat();
    if (!info.isFile()) {
        throw Object.assign(new Error("not a regular file"), { code: "NOT_REGULAR_FILE" });
    }
    const buffer = Buffer.alloc(MAX_SECRET_BYTES + 1);
    let length = 0;
    for (;;) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0 || (length += bytesRead) > MAX_SECRET_BYTES) {
            break;
        }
    }
    if (length > MAX_SECRET_BYTES) {
        throw Object.assign(new Error("too large"), { code: "TOO_LARGE" });
    }
    const bytes = buffer.subarray(0, length);
    if (looksUtf16(bytes)) {
        throw Object.assign(new Error("UTF-16"), { code: "UTF16" });
    }
    return { text: bytes.toString("utf8"), info };
}

/**
 * A secret file's text: a regular file (a link to one is followed, as a mounted Secret is), opened
 * without waiting for a writer, read by readSecretHandle. An error with the code NOT_REGULAR_FILE,
 * TOO_LARGE or UTF16, or the system's (ENOENT, EACCES, ...); `unreadable` words it.
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function readSecretFile(path) {
    const handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    try {
        return (await readSecretHandle(handle)).text;
    } finally {
        await handle.close();
    }
}

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
            text = await readSecretFile(pathOf(options, /** @type {string} */ (ref.file)));
        } catch (e) {
            const code = /** @type {any} */ (e)?.code;
            throw new SecretError(code === "UTF16" ? `${where} ${UTF16_TEXT}` : `${where} cannot be read (${unreadable(code)})`);
        }
        const bom = bomProblem(text, "key");
        if (bom) {
            throw new SecretError(`${where} ${bom}`);
        }
    }
    const value = secretValue(text, "key");
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
 * check-config's warning (its text, without a marker) for a secret file other users of the machine can read (group or world
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
    return `${label} can be read by other users of this machine (mode ${(info.mode & 0o777).toString(8)}); make it readable by the server's user only (chmod 600)`;
}

/**
 * Whether a reference with `create: true` names a file that is not there yet (nor a link): the start
 * makes it (state.js), so check-config says so under Credentials instead of calling it unreadable.
 * @param {{ env?: string, file?: string, create?: boolean }} ref
 * @param {{ baseDir?: string }} options
 * @returns {Promise<boolean>}
 */
export async function madeAtStart(ref, options) {
    return Boolean(ref.create && ref.file) && !(await lstat(pathOf(options, /** @type {string} */ (ref.file))).catch(() => null));
}

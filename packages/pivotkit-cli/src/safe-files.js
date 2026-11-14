/*
 * Reading and writing files the same safe way, with or without allowed directories:
 *
 * - `--allow-dir` is a hard limit: every file read or written must lie inside one of the directories
 *   after its real path is resolved (symbolic links and ".." followed), checked on the path and again
 *   on the opened file (its device and inode against the real path's). Without it the CLI reads and
 *   writes with the user's own rights, as any command-line tool does.
 * - A file is opened once, without following a symbolic link at its end where the system can
 *   (O_NOFOLLOW) and without waiting for a writer (O_NONBLOCK, so a FIFO cannot hang the CLI), then
 *   checked on the handle: a regular file only, and its size against the limit before a byte is read.
 * - A file is written to a new temporary file next to it (exclusive create), then renamed over the
 *   target: no half-written output, and a symbolic link, a directory or another non-regular file at
 *   the target is refused, never replaced.
 *
 * Not a sandbox against another process of the same user that changes the directories while the CLI
 * runs: the checks narrow that window, they do not close it. A hard link inside an allowed directory
 * to a file outside it is that file's name inside: no path check can tell it apart. A temporary file
 * of a run that is killed between its creation and the rename stays behind (".<name>.<pid>-<random>.tmp").
 * `hardLinks: false` refuses a file with more than one name (a hard link), for callers that read on
 * behalf of someone else (pivotkit-mcp). `writeNew` never replaces a file: the final name is created
 * by link(), which fails when the name exists. The module is exported as `pivotkit-cli/files`.
 */

import { constants } from "node:fs";
import { link, lstat, open, realpath, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { CliError, shortName } from "./errors.js";

const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/** True when `real` is `dir` or lies inside it (both real paths). */
export function isInside(real, dir) {
    const rel = relative(dir, real);
    // "..foo" is a name inside the directory; only ".." as the first part leaves it
    return rel === "" || (!isAbsolute(rel) && rel.split(sep)[0] !== "..");
}

/**
 * The allowed directories as real paths; each must exist and be a directory.
 * @param {string[]} dirs
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
export async function allowedDirs(dirs, cwd) {
    const out = [];
    for (const dir of dirs) {
        let real;
        try {
            real = await realpath(resolve(cwd, dir));
        } catch {
            throw new CliError("usage", "ALLOW_DIR_NOT_FOUND", `--allow-dir ${shortName(dir)}: not found`);
        }
        if (!(await stat(real)).isDirectory()) {
            throw new CliError("usage", "ALLOW_DIR_NOT_DIRECTORY", `--allow-dir ${shortName(dir)}: not a directory`);
        }
        out.push(real);
    }
    return out;
}

/** Refuses a real path outside the allowed directories (none given: every path is allowed). */
function checkAllowed(real, allow, path) {
    if (allow.length > 0 && !allow.some((dir) => isInside(real, dir))) {
        // the directories by their base names, as every path in a message
        throw new CliError("io", "OUTSIDE_ALLOWED_DIR", `${shortName(path)}: outside the allowed directories (--allow-dir ${allow.map(shortName).join(", ")})`);
    }
}

/**
 * Reads a regular file of at most `maxBytes` bytes.
 * @param {string} path
 * @param {{ cwd: string, allow: string[], maxBytes: number, limit?: string, hardLinks?: boolean }} options  `limit`: the limit's name for
 *   the message; `hardLinks: false` refuses a file with more than one name (default true)
 * @returns {Promise<Uint8Array>}
 */
export async function readSafe(path, { cwd, allow, maxBytes, limit = "fileBytes", hardLinks = true }) {
    const full = resolve(cwd, path);
    let real;
    try {
        real = await realpath(full);
    } catch (e) {
        throw e?.code === "ENOENT" ? new CliError("io", "NOT_FOUND", `${shortName(path)}: not found`) : e;
    }
    checkAllowed(real, allow, path);
    const handle = await open(real, READ_FLAGS);
    try {
        const info = await handle.stat();
        if (!info.isFile()) {
            throw new CliError("io", "NOT_REGULAR_FILE", `${shortName(path)}: not a regular file`);
        }
        const now = await stat(real);
        // the path again after the open: a directory on the way replaced by a link in between
        // gives another real path, the file replaced another device or inode
        const again = await realpath(full).catch(() => null);
        if (now.dev !== info.dev || now.ino !== info.ino || again !== real) {
            throw new CliError("io", "CHANGED", `${shortName(path)}: changed while it was opened`);
        }
        if (!hardLinks && info.nlink > 1) {
            throw new CliError("io", "HARD_LINK", `${shortName(path)}: has more than one name (a hard link); not read`);
        }
        if (info.size > maxBytes) {
            throw tooLarge(path, info.size, maxBytes, limit);
        }
        // the size the file had at the check, plus one byte: a file that has more by then grew (or, as
        // a file of /proc, says it has none): over the limit it is refused as too large, else as changed,
        // never cut
        const buffer = new Uint8Array(Math.min(maxBytes + 1, info.size + 1));
        let length = 0;
        for (;;) {
            const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
            if (bytesRead === 0) {
                break;
            }
            length += bytesRead;
            if (length > maxBytes) {
                throw tooLarge(path, length, maxBytes, limit);
            }
            if (length > info.size) {
                throw new CliError("io", "CHANGED", `${shortName(path)}: changed while it was read (it has more than the ${info.size.toLocaleString("en-US")} bytes it had)`);
            }
        }
        return buffer.subarray(0, length);
    } finally {
        await handle.close();
    }
}

/** A file over its limit, named by its base name. */
const tooLarge = (path, size, max, limit) => new CliError("limit", "LIMIT_EXCEEDED", `${shortName(path)}: ${size.toLocaleString("en-US")} bytes exceed the limit of ${max.toLocaleString("en-US")} (limits.${limit})`);

/**
 * Reads stdin up to `maxBytes` bytes.
 * @param {AsyncIterable<Uint8Array>} stdin
 * @param {number} maxBytes
 * @param {string} [limit]
 */
export async function readStdin(stdin, maxBytes, limit = "fileBytes") {
    const chunks = [];
    let length = 0;
    for await (const chunk of stdin) {
        length += chunk.length;
        if (length > maxBytes) {
            throw tooLarge("-", length, maxBytes, limit);
        }
        chunks.push(chunk);
    }
    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }
    return out;
}

/**
 * Writes `bytes` to `path`: into a new temporary file in the target's directory, then renamed over it.
 * @param {string} path
 * @param {Uint8Array} bytes
 * @param {{ cwd: string, allow: string[] }} options
 * @returns {Promise<string>}  the real path written
 */
export async function writeSafe(path, bytes, { cwd, allow }) {
    const full = resolve(cwd, path);
    let dir;
    try {
        dir = await realpath(dirname(full));
    } catch {
        throw new CliError("io", "NOT_FOUND", `${shortName(path)}: its directory is not found`);
    }
    const target = join(dir, basename(full));
    checkAllowed(target, allow, path);
    const existing = await lstat(target).catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)));
    if (existing && !existing.isFile()) {
        const what = existing.isSymbolicLink() ? "a symbolic link" : existing.isDirectory() ? "a directory" : "a device or another special file";
        throw new CliError("io", existing.isSymbolicLink() || existing.isDirectory() ? "NOT_REGULAR_FILE" : "SPECIAL_FILE", `${shortName(path)}: exists and is ${what}; not replaced`);
    }
    // the temporary name stays within a file name's 255 bytes, however long the target's name is: 50
    // characters of at most 4 bytes each, then about 25 for the process, a random part and ".tmp"
    const stem = Array.from(basename(full)).slice(0, 50).join("");
    const temp = join(dir, `.${stem}.${process.pid}-${Math.random().toString(36).slice(2, 10)}.tmp`);
    const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), existing ? existing.mode & 0o777 : 0o644);
    try {
        await handle.writeFile(bytes);
        await handle.sync();
    } catch (e) {
        await handle.close();
        await unlink(temp).catch(() => undefined);
        throw e;
    }
    await handle.close();
    try {
        await rename(temp, target);
    } catch (e) {
        await unlink(temp).catch(() => undefined);
        throw e;
    }
    return target;
}

/** The characters a name of writeNew keeps; the others become "-". */
const NAME_CHARS = /[^A-Za-z0-9 ._-]/g;

/**
 * A file name from a name given from outside: letters, digits, space, ".", "_" and "-" only, no
 * leading dot, at most `max` characters; "report" when nothing is left.
 * @param {unknown} name
 * @param {number} [max]
 */
export function cleanFileName(name, max = 80) {
    const clean = String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(NAME_CHARS, "-").replace(/-{2,}/g, "-").replace(/^[.\s-]+|[.\s-]+$/g, "").slice(0, max).trim();
    return clean || "report";
}

/**
 * Writes `bytes` as a new file in `dir` (a real path), never replacing one: `<name>.<extension>`, or
 * with "-2", "-3" ... when the name is taken (at most `tries`). The bytes go to a temporary file first,
 * then link() gives it its name (link fails when the name exists, so a file that appears in between
 * is never replaced), then the temporary name is removed.
 * @param {string} dir  a directory's real path
 * @param {string} name  the file's name without extension (cleaned with cleanFileName)
 * @param {string} extension  without the dot
 * @param {Uint8Array} bytes
 * @param {{ prefix?: string, tries?: number }} [options]  `prefix`: put before the name (a random part)
 * @returns {Promise<string>}  the file's base name
 */
export async function writeNew(dir, name, extension, bytes, { prefix = "", tries = 100 } = {}) {
    const stem = `${prefix}${cleanFileName(name)}`;
    const temp = join(dir, `.${stem.slice(0, 50)}.${process.pid}-${Math.random().toString(36).slice(2, 10)}.tmp`);
    const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o644);
    try {
        await handle.writeFile(bytes);
        await handle.sync();
    } finally {
        await handle.close();
    }
    try {
        for (let n = 1; n <= tries; n++) {
            const base = `${stem}${n === 1 ? "" : `-${n}`}.${extension}`;
            try {
                await link(temp, join(dir, base));
                return base;
            } catch (e) {
                if (e?.code !== "EEXIST") {
                    throw e;
                }
            }
        }
        throw new CliError("io", "EXISTS", `${shortName(stem)}: ${tries} files of this name exist already`);
    } finally {
        await unlink(temp).catch(() => undefined);
    }
}

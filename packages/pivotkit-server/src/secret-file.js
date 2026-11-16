/*
 * Writing a secret to a file, and a configuration file next to its backup, so that a reader never
 * sees half a value and nothing is replaced by accident. The commands of credentials.js use it; a
 * start that creates a missing secret can use placeSecret the same way.
 *
 * - The value goes into a new temporary file in the target's directory (O_CREAT | O_EXCL |
 *   O_NOFOLLOW, mode 0600), with one LF, and is synced to disk before it gets its name.
 * - A new file gets its name by link(), which fails when the name exists (also when another process
 *   made it a moment ago): EXISTS, or with `keep` that other file is read and kept, so several runs
 *   at once end with one value. Where the file system has no hard links, the file is created with
 *   O_EXCL in place instead (a reader at that moment may see it before its value is written).
 * - `replace` renames over the old file, atomically (on Windows retried briefly while a reader holds
 *   it open).
 * - A symbolic link (a mounted Kubernetes Secret is one), a directory and any other file that is not
 *   a regular file are refused, never written through; so is a directory that does not exist.
 * - On Windows the mode bits do not apply: the file takes the permissions of its folder.
 *
 * No message holds the value; a path is named as the caller labels it.
 */

import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

/** The random bytes of each kind of secret: a token of 43 base64url characters, a key of 64. */
export const SECRET_BYTES = Object.freeze({ token: 32, key: 48 });

/** A new random secret of `bytes` random bytes, base64url (no padding: only characters a bearer token and a file line carry). */
export const newSecret = (bytes) => randomBytes(bytes).toString("base64url");

/** The mode of a secret file: its owner reads and writes it, nobody else. */
export const SECRET_MODE = 0o600;

/** The longest file a kept secret is read from; a secret is one short line. */
const MAX_SECRET_BYTES = 4096;

/** How often, and how long apart, a rename is tried again on Windows while another process holds the file. */
const RENAME_RETRY = Object.freeze({ tries: 3, waitMs: 50 });

/**
 * How long a kept file that is still empty is read again: another process that created it in place
 * (no hard links) may not have written its value yet. About a second.
 */
export const EMPTY_RETRY = Object.freeze({ tries: 20, waitMs: 50 });

/** The file system calls tests replace (a file system without hard links). */
export const secretFileMeans = { link };

/** The codes of link() where a file system has no hard links. */
const NO_HARD_LINKS = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV", "EMLINK"]);

export class SecretFileError extends Error {
    /**
     * @param {"EXISTS" | "NOT_REGULAR_FILE" | "NO_DIRECTORY" | "READ_ONLY" | "UNUSABLE" | "UNREADABLE"} code
     * @param {string} message
     */
    constructor(code, message) {
        super(message);
        this.name = "SecretFileError";
        this.code = code;
    }
}

/** A temporary file's name next to `name`: ".<name>.<pid>-<random>.tmp". */
const tempName = (name) => `.${name.slice(0, 50)}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;

/** What lstat found at a path that is not a regular file, in words. */
const whatIs = (info) => (info.isSymbolicLink() ? "a symbolic link (a mounted Secret is one)" : info.isDirectory() ? "a directory" : "a device or another special file");

/**
 * The target's real directory and full path; a NO_DIRECTORY error when the directory is missing.
 * @param {string} path  absolute
 * @param {string} label
 */
async function targetOf(path, label) {
    let dir;
    try {
        dir = await realpath(dirname(path));
    } catch {
        throw new SecretFileError("NO_DIRECTORY", `${label}: its directory does not exist; create it first`);
    }
    return { dir, target: join(dir, basename(path)) };
}

/**
 * lstat of the target: null when there is nothing, the stats of a regular file, else a refusal.
 * @param {string} target
 * @param {string} label
 */
async function existingFile(target, label) {
    const info = await lstat(target).catch((e) => (e?.code === "ENOENT" ? null : Promise.reject(e)));
    if (info && !info.isFile()) {
        throw new SecretFileError("NOT_REGULAR_FILE", `${label}: is ${whatIs(info)}; not written`);
    }
    return info;
}

/** An error of creating a file in a directory, as a READ_ONLY refusal where it is one. */
function writeRefusal(e, label) {
    if (e?.code === "EROFS") {
        return new SecretFileError("READ_ONLY", `${label}: cannot write there, the file system is read-only (a mounted Secret or ConfigMap, or a read-only volume?)`);
    }
    if (e?.code === "EACCES" || e?.code === "EPERM") {
        return new SecretFileError("READ_ONLY", `${label}: cannot write in its directory (permission denied for the user ${process.getuid?.() ?? ""} this runs as)`);
    }
    return e;
}

/**
 * Creates a new file with exactly `mode` and writes `bytes` into it, synced; the file is removed again
 * when the write fails.
 * @param {string} path
 * @param {Uint8Array | string} bytes
 * @param {number} mode
 * @param {string} label
 */
async function createWith(path, bytes, mode, label) {
    let handle;
    try {
        handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), mode);
    } catch (e) {
        throw e?.code === "EEXIST" ? e : writeRefusal(e, label);
    }
    try {
        if (process.platform !== "win32") {
            // the umask does not narrow or widen it
            await handle.chmod(mode);
        }
        await handle.writeFile(bytes);
        await handle.sync();
    } catch (e) {
        await handle.close();
        await unlink(path).catch(() => undefined);
        throw e;
    }
    await handle.close();
}

/** Syncs a directory, so a new name in it survives a crash; not on Windows, where a directory cannot be opened so. */
async function syncDir(dir) {
    if (process.platform === "win32") {
        return;
    }
    const handle = await open(dir, constants.O_RDONLY).catch(() => null);
    await handle?.sync().catch(() => undefined);
    await handle?.close();
}

/**
 * rename(), tried again on Windows while another process holds the target open (EPERM, EACCES, EBUSY).
 * @param {string} from
 * @param {string} to
 */
export async function renameOver(from, to) {
    for (let attempt = 1; ; attempt++) {
        try {
            await rename(from, to);
            return;
        } catch (e) {
            if (process.platform !== "win32" || attempt >= RENAME_RETRY.tries || !["EPERM", "EACCES", "EBUSY"].includes(e?.code)) {
                throw e;
            }
            // a ref'd timer: the process waits for it
            await new Promise((done) => setTimeout(done, RENAME_RETRY.waitMs));
        }
    }
}

/**
 * Reads a kept secret file (a regular file, not followed through a link), its value without the
 * one line ending, checked by `usable`; a file its owner (this user) has open to others gets mode 0600.
 * @param {string} target
 * @param {string} label
 * @param {(value: string) => string | null} usable  why a value cannot be used, or null
 * @param {string} kind  "token" or "key", for the message
 */
async function readKept(target, label, usable, kind) {
    let handle;
    try {
        handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    } catch (e) {
        if (e?.code === "ELOOP") {
            throw new SecretFileError("NOT_REGULAR_FILE", `${label}: is a symbolic link (a mounted Secret is one); not written`);
        }
        throw new SecretFileError("UNREADABLE", `${label}: is there but cannot be read (${e?.code === "EACCES" ? "permission denied" : "unreadable"})`);
    }
    try {
        const info = await handle.stat();
        if (!info.isFile()) {
            throw new SecretFileError("NOT_REGULAR_FILE", `${label}: is ${whatIs(info)}; not written`);
        }
        if (info.size > MAX_SECRET_BYTES) {
            throw new SecretFileError("UNUSABLE", `${label}: is there but not a usable ${kind} (more than ${MAX_SECRET_BYTES} bytes); replace it with --force`);
        }
        const value = (await handle.readFile("utf8")).replace(/\r?\n$/, "");
        if (!value) {
            throw new EmptyFile();
        }
        const why = usable(value);
        if (why) {
            throw new SecretFileError("UNUSABLE", `${label}: is there but not a usable ${kind} (${why}); replace it with --force`);
        }
        if (process.platform !== "win32" && info.uid === process.getuid?.() && (info.mode & 0o777) !== SECRET_MODE) {
            await handle.chmod(SECRET_MODE);
        }
        return value;
    } finally {
        await handle.close();
    }
}

/** A kept file that is empty so far. */
class EmptyFile extends Error {}

/**
 * readKept, read again while the file is empty (another process may be between creating it and
 * writing it), up to EMPTY_RETRY; then UNUSABLE.
 * @param {string} target
 * @param {string} label
 * @param {(value: string) => string | null} usable
 * @param {string} kind
 */
async function readSettled(target, label, usable, kind) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await readKept(target, label, usable, kind);
        } catch (e) {
            if (!(e instanceof EmptyFile)) {
                throw e;
            }
            if (attempt >= EMPTY_RETRY.tries) {
                throw new SecretFileError("UNUSABLE", `${label}: is there but empty; replace it with --force`);
            }
            // a ref'd timer: the process waits for it
            await new Promise((done) => setTimeout(done, EMPTY_RETRY.waitMs));
        }
    }
}

/**
 * @typedef {object} PlaceOptions
 * @property {boolean} [replace]  replace an existing file (rename over it)
 * @property {boolean} [keep]  keep an existing file, checked by `usable`, and give its value
 * @property {(value: string) => string | null} [usable]  why a kept value cannot be used, or null
 * @property {string} [kind]  "token" or "key", for the messages
 * @property {string} [label]  how a message names the file (default: the path)
 */

/**
 * Puts `value` into the file `path` (absolute), with mode 0600 and one LF.
 * @param {string} path
 * @param {string} value
 * @param {PlaceOptions} [options]
 * @returns {Promise<{ path: string, value: string, created: boolean, replaced: boolean }>}  the real path, and the value in the file now (another one when a file was kept)
 */
export async function placeSecret(path, value, { replace = false, keep = false, usable = () => null, kind = "secret", label = path } = {}) {
    const { dir, target } = await targetOf(resolve(path), label);
    const existing = await existingFile(target, label);
    if (existing && keep) {
        return { path: target, value: await readSettled(target, label, usable, kind), created: false, replaced: false };
    }
    if (existing && !replace) {
        throw new SecretFileError("EXISTS", `${label}: is already there; not replaced (--force replaces it, --if-missing keeps it)`);
    }
    const bytes = `${value}\n`;
    const temp = join(dir, tempName(basename(target)));
    await createWith(temp, bytes, SECRET_MODE, label);
    try {
        if (replace) {
            await renameOver(temp, target);
            await syncDir(dir);
            return { path: target, value, created: !existing, replaced: Boolean(existing) };
        }
        try {
            // link() never replaces: a file made since the check stays as it is
            await secretFileMeans.link(temp, target);
        } catch (e) {
            if (e?.code === "EEXIST") {
                return lost(target, label, keep, usable, kind);
            }
            if (!NO_HARD_LINKS.has(e?.code)) {
                throw writeRefusal(e, label);
            }
            // no hard links here: create the name itself exclusively
            try {
                await createWith(target, bytes, SECRET_MODE, label);
            } catch (inPlace) {
                if (inPlace?.code === "EEXIST") {
                    return lost(target, label, keep, usable, kind);
                }
                throw inPlace;
            }
        }
        await syncDir(dir);
        return { path: target, value, created: true, replaced: false };
    } finally {
        await unlink(temp).catch(() => undefined);
    }
}

/** Another process named the file first: keep its value, or EXISTS. */
async function lost(target, label, keep, usable, kind) {
    if (!keep) {
        throw new SecretFileError("EXISTS", `${label}: is already there; not replaced (--force replaces it, --if-missing keeps it)`);
    }
    return { path: target, value: await readSettled(target, label, usable, kind), created: false, replaced: false };
}

/**
 * Replaces a file (a configuration) with `bytes` atomically: a temporary file next to it with `mode`,
 * synced, renamed over it.
 * @param {string} path
 * @param {string} bytes
 * @param {number} mode
 * @param {string} [label]
 */
export async function replaceFile(path, bytes, mode, label = path) {
    const { dir, target } = await targetOf(resolve(path), label);
    await existingFile(target, label);
    const temp = join(dir, tempName(basename(target)));
    await createWith(temp, bytes, mode, label);
    try {
        await renameOver(temp, target);
        await syncDir(dir);
    } catch (e) {
        await unlink(temp).catch(() => undefined);
        throw writeRefusal(e, label);
    }
}

/**
 * A copy of a file's old content beside it that nothing replaces: `<path>.bak`, else `.bak.1`, `.bak.2`, ...
 * @param {string} path
 * @param {string} bytes
 * @param {number} mode
 * @returns {Promise<string>}  the backup's path
 */
export async function writeBackup(path, bytes, mode) {
    for (let n = 0; n < 100; n++) {
        const name = `${path}.bak${n ? `.${n}` : ""}`;
        try {
            await createWith(name, bytes, mode, name);
            return name;
        } catch (e) {
            if (e?.code !== "EEXIST") {
                throw e;
            }
        }
    }
    throw new SecretFileError("EXISTS", `${path}: 100 backups are there already; remove old ones (${basename(path)}.bak.*)`);
}

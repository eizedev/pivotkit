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
 * - A file that replaces another keeps the old one's owner and group where this process may set them
 *   (run as root). A file that is mounted on its own (a bind mount of one file, a Kubernetes subPath)
 *   cannot be replaced: MOUNTED.
 * - A replacement keeps the old file's group bits where it keeps its group, never the world's; an
 *   owner, group or mode it could not keep gets a warning.
 * - A kept file loses only its world bits (with a warning); a group's bits stay (a group may share
 *   it), with a warning, as does a file of another user than this one or root. A kept file behind a
 *   symbolic link (a mounted Kubernetes Secret) is only read through it, never changed.
 * - The temporary file is removed when SIGINT or SIGTERM comes during the write.
 * - On Windows the mode bits do not apply: the file takes the permissions of its folder.
 *
 * No message holds the value; a path is named as the caller labels it.
 *
 * Why not pivotkit-cli's writeSafe (pivotkit-cli/files): it writes a file and refuses or replaces
 * what is there, which is right for a report. A secret needs more: keeping the file that is there and
 * reading it back checked (--if-missing, several runs at once), a mode of 0600 whatever the umask, the
 * old file's owner and group on a replacement, a clear word for a mounted file, and the temporary
 * file removed on a signal. pivotkit-cli also ships on its own release line, so its writer is not
 * changed for the server's needs.
 */

import { randomBytes } from "node:crypto";
import { constants, unlinkSync } from "node:fs";
import { link, lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { MAX_SECRET_BYTES, UTF16_TEXT, looksUtf16 } from "./secrets.js";

/** The random bytes of each kind of secret: a token of 43 base64url characters, a key of 64. */
export const SECRET_BYTES = Object.freeze({ token: 32, key: 48 });

/** A new random secret of `bytes` random bytes, base64url (no padding: only characters a bearer token and a file line carry). */
export const newSecret = (bytes) => randomBytes(bytes).toString("base64url");

/** The mode of a secret file: its owner reads and writes it, nobody else. */
export const SECRET_MODE = 0o600;

/** How often, and how long apart, a rename is tried again on Windows while another process holds the file. */
const RENAME_RETRY = Object.freeze({ tries: 3, waitMs: 50 });

/**
 * How long a kept file that is still empty is read again: another process that created it in place
 * (no hard links) may not have written its value yet. About a second.
 */
const EMPTY_RETRY = Object.freeze({ tries: 20, waitMs: 50 });

/** The calls tests replace: a file system without hard links, a mounted file, another user. */
export const secretFileMeans = { link, rename, uid: () => process.getuid?.(), chown: (handle, uid, gid) => handle.chown(uid, gid) };

/** The signals during which a temporary file is removed. */
const SIGNALS = Object.freeze(["SIGINT", "SIGTERM"]);

/** The codes of link() where a file system has no hard links. */
const NO_HARD_LINKS = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV", "EMLINK"]);

export class SecretFileError extends Error {
    /**
     * @param {"EXISTS" | "NOT_REGULAR_FILE" | "NO_DIRECTORY" | "READ_ONLY" | "MOUNTED" | "UNUSABLE" | "UNREADABLE"} code
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
 * when the write fails. With `owner` (the file it replaces), the owner and group are set to its where
 * this process may (root, or a group it is in); its group bits are added only where the group is its.
 * @param {string} path
 * @param {Uint8Array | string} bytes
 * @param {number} mode
 * @param {string} label
 * @param {{ uid: number, gid: number, mode: number } | null} [owner]
 * @returns {Promise<{ uid: number, gid: number, mode: number } | null>}  the new file's owner, group and mode (null on Windows)
 */
async function createWith(path, bytes, mode, label, owner = null) {
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
            if (owner) {
                await secretFileMeans.chown(handle, owner.uid, owner.gid).catch((e) => (e?.code === "EPERM" ? undefined : Promise.reject(e)));
            }
        }
        const made = process.platform === "win32" ? null : await handle.stat();
        if (made && owner && made.gid === owner.gid && owner.mode & 0o070) {
            // the group that may read it is the old one: it keeps its group bits, never the world's
            await handle.chmod(mode | (owner.mode & 0o070));
        }
        await handle.writeFile(bytes);
        await handle.sync();
        const after = made ? await handle.stat() : null;
        await handle.close();
        return after ? { uid: after.uid, gid: after.gid, mode: after.mode & 0o777 } : null;
    } catch (e) {
        await handle.close();
        await unlink(path).catch(() => undefined);
        throw e;
    }
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
 * Runs `work` while SIGINT or SIGTERM removes `temp` first: the signal is raised again when nothing
 * else of the process listens for it, so the process still ends as it would have.
 * @template T
 * @param {string} temp
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function cleaningUp(temp, work) {
    const onSignal = (signal) => {
        try {
            unlinkSync(temp);
        } catch {
            // not made yet, or gone
        }
        off();
        if (process.listenerCount(signal) === 0) {
            process.kill(process.pid, signal);
        }
    };
    const off = () => SIGNALS.forEach((signal) => process.off(signal, onSignal));
    SIGNALS.forEach((signal) => process.on(signal, onSignal));
    try {
        return await work();
    } finally {
        off();
    }
}

/**
 * rename(), tried again on Windows while another process holds the target open (EPERM, EACCES, EBUSY);
 * a target mounted on its own (EBUSY elsewhere, or still on Windows) is MOUNTED.
 * @param {string} from
 * @param {string} to
 * @param {string} [label]
 */
export async function renameOver(from, to, label = to) {
    for (let attempt = 1; ; attempt++) {
        try {
            await secretFileMeans.rename(from, to);
            return;
        } catch (e) {
            if (process.platform !== "win32" || attempt >= RENAME_RETRY.tries || !["EPERM", "EACCES", "EBUSY"].includes(e?.code)) {
                if (e?.code === "EBUSY") {
                    throw new SecretFileError("MOUNTED", `${label}: a mounted file cannot be replaced (a bind mount of the file, or a Kubernetes subPath); change it where it comes from, or mount its directory instead`);
                }
                throw e;
            }
            // a ref'd timer: the process waits for it
            await new Promise((done) => setTimeout(done, RENAME_RETRY.waitMs));
        }
    }
}

/**
 * Reads a kept secret file (a regular file, not followed through a link), its value without the
 * one line ending, checked by `usable`. A file of this user that everyone may read loses the world's
 * bits; one a group may still read, and one of another user than this one or root, gets a warning.
 * @param {string} target
 * @param {string} label
 * @param {(value: string) => string | null} usable  why a value cannot be used, or null
 * @param {string} kind  "token" or "key", for the message
 * @param {boolean} [throughLink]  the name is a symbolic link: read the file behind it, change nothing
 * @returns {Promise<{ value: string, warnings: string[] }>}
 */
async function readKept(target, label, usable, kind, throughLink = false) {
    let handle;
    try {
        handle = await open(target, constants.O_RDONLY | (throughLink ? 0 : (constants.O_NOFOLLOW ?? 0)) | (constants.O_NONBLOCK ?? 0));
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
        const bytes = await handle.readFile();
        if (looksUtf16(bytes)) {
            throw new SecretFileError("UNUSABLE", `${label}: ${UTF16_TEXT}`);
        }
        const value = bytes.toString("utf8").replace(/\r?\n$/, "");
        if (!value) {
            throw new EmptyFile();
        }
        const why = usable(value);
        if (why) {
            throw new SecretFileError("UNUSABLE", `${label}: is there but not a usable ${kind} (${why}); replace it with --force`);
        }
        const warnings = [];
        if (process.platform !== "win32" && !throughLink) {
            const me = secretFileMeans.uid();
            let mode = info.mode & 0o777;
            if (info.uid === me && mode & 0o007) {
                const was = mode;
                mode &= ~0o007;
                await handle.chmod(mode);
                warnings.push(`${label}: removed everyone's read access (mode ${mode.toString(8)}, was ${was.toString(8)})`);
            }
            if (mode & 0o077) {
                warnings.push(`${label} is readable by others than its owner (mode ${mode.toString(8)}); chmod 600 it unless a group shares it on purpose`);
            }
            if (info.uid !== me && info.uid !== 0) {
                warnings.push(`${label} is owned by user ${info.uid}, not by ${me} (this user) or root; check who else can change it`);
            }
        }
        return { value, warnings };
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
 * @param {boolean} [throughLink]
 * @returns {Promise<{ value: string, warnings: string[] }>}
 */
async function readSettled(target, label, usable, kind, throughLink = false) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await readKept(target, label, usable, kind, throughLink);
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
 * @returns {Promise<{ path: string, value: string, created: boolean, replaced: boolean, warnings: string[] }>}  the real path, and the value in the file now (another one when a file was kept)
 */
export async function placeSecret(path, value, { replace = false, keep = false, usable = () => null, kind = "secret", label = path } = {}) {
    const { dir, target } = await targetOf(resolve(path), label);
    if (keep && (await lstat(target).catch(() => null))?.isSymbolicLink()) {
        // a mounted Secret: checked through the link, never written
        return { path: target, ...(await readSettled(target, label, usable, kind, true)), created: false, replaced: false };
    }
    const existing = await existingFile(target, label);
    if (existing && keep) {
        return { path: target, ...(await readSettled(target, label, usable, kind)), created: false, replaced: false };
    }
    if (existing && !replace) {
        throw new SecretFileError("EXISTS", `${label}: is already there; not replaced (--force replaces it, --if-missing keeps it)`);
    }
    const bytes = `${value}\n`;
    const temp = join(dir, tempName(basename(target)));
    return cleaningUp(temp, () => placeNew(temp, target, dir, bytes, { value, existing, replace, keep, usable, kind, label }));
}

/** placeSecret's write, from the temporary file to its name; the temporary file is gone after it. */
async function placeNew(temp, target, dir, bytes, { value, existing, replace, keep, usable, kind, label }) {
    const made = await createWith(temp, bytes, SECRET_MODE, label, existing && replace ? existing : null);
    try {
        if (replace) {
            await renameOver(temp, target, label);
            await syncDir(dir);
            return { path: target, value, created: !existing, replaced: Boolean(existing), warnings: existing && made ? keptWarnings(label, existing, made) : [] };
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
        return { path: target, value, created: true, replaced: false, warnings: [] };
    } finally {
        await unlink(temp).catch(() => undefined);
    }
}

/**
 * What a replacement could not keep of the old file: its owner or group (another user's file, as
 * someone that is not root), or read bits (the world's always go; a group's where its group went).
 * @param {string} label
 * @param {{ uid: number, gid: number, mode: number }} old
 * @param {{ uid: number, gid: number, mode: number }} made
 */
function keptWarnings(label, old, made) {
    const warnings = [];
    if (made.uid !== old.uid || made.gid !== old.gid) {
        warnings.push(`${label}: owner or group not kept (now ${made.uid}:${made.gid}, was ${old.uid}:${old.gid}); the server's user may no longer read it: chown it, or run this as that user or root`);
    }
    const oldMode = old.mode & 0o777;
    if (oldMode & ~made.mode & 0o077) {
        warnings.push(`${label}: read access narrowed (mode ${made.mode.toString(8)}, was ${oldMode.toString(8)})`);
    }
    return warnings;
}

/** Another process named the file first: keep its value, or EXISTS. */
async function lost(target, label, keep, usable, kind) {
    if (!keep) {
        throw new SecretFileError("EXISTS", `${label}: is already there; not replaced (--force replaces it, --if-missing keeps it)`);
    }
    return { path: target, ...(await readSettled(target, label, usable, kind)), created: false, replaced: false };
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
    const existing = await existingFile(target, label);
    const temp = join(dir, tempName(basename(target)));
    await cleaningUp(temp, async () => {
        await createWith(temp, bytes, mode, label, existing);
        try {
            await renameOver(temp, target, label);
            await syncDir(dir);
        } catch (e) {
            await unlink(temp).catch(() => undefined);
            throw writeRefusal(e, label);
        }
    });
}

/**
 * A copy of a file's old content beside it that nothing replaces: `<path>.bak-<UTC time>` (such as
 * `pivotkit.json.bak-20261116T093000Z`), with `-2`, `-3` ... for another one in the same second.
 * @param {string} path
 * @param {string} bytes
 * @param {number} mode
 * @returns {Promise<string>}  the backup's path
 */
export async function writeBackup(path, bytes, mode) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    for (let n = 1; n <= 100; n++) {
        const name = `${path}.bak-${stamp}${n > 1 ? `-${n}` : ""}`;
        try {
            await createWith(name, bytes, mode, name);
            return name;
        } catch (e) {
            if (e?.code !== "EEXIST") {
                throw e;
            }
        }
    }
    throw new SecretFileError("EXISTS", `${path}: 100 backups of this second are there already`);
}

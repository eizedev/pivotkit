/*
 * Where `pivotkit login` keeps a refresh token: the system's keychain through the system's own tool,
 * else a file only the user reads (mode 0600 in a 0700 directory). No crypto of our own.
 *
 * - macOS: /usr/bin/security. The secret goes through its stdin (`security -i`, hex with -X), never
 *   into the arguments, which other users can see in the process list.
 * - Linux: secret-tool (libsecret). `store` reads the secret from stdin. Without a running secret
 *   service it fails, and the file is used.
 * - Windows: the Credential Manager (CredWrite, CredRead, CredDelete) through Windows PowerShell. The
 *   secret goes through stdin.
 *
 * The keychain entry's account is a digest of the server's address, so no address is parsed by a tool.
 * The list of sign-ins (logins.json) holds no secret: the server, its issuer, the client, the scope
 * and where the refresh token is.
 */

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, stat, unlink, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError, readSafe, writeSafe } from "pivotkit-node/files";

/** The keychain service name of every entry. */
export const KEYCHAIN_SERVICE = "pivotkit";

/** The largest refresh token or list of sign-ins read back. */
const MAX_SECRET_BYTES = 16_384;
const MAX_LOGINS_BYTES = 262_144;

/** How long a keychain tool may take: long enough for a person to answer an unlock dialog. */
const TOOL_MS = 120_000;

/** The most bytes the Windows Credential Manager keeps in one credential (CRED_MAX_CREDENTIAL_BLOB_SIZE, 5 * 512). */
export const WINDOWS_BLOB_BYTES = 2560;

/**
 * The directory of pivotkit's sign-ins: %APPDATA%\pivotkit on Windows, else
 * $XDG_CONFIG_HOME/pivotkit or ~/.config/pivotkit.
 * @param {Record<string, string | undefined>} env
 */
export function configDirOf(env) {
    if (process.platform === "win32") {
        return join(env.APPDATA || join(env.USERPROFILE || homedir(), "AppData", "Roaming"), "pivotkit");
    }
    return join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config"), "pivotkit");
}

/** The keychain account of a server: 32 hex characters of its address's digest. */
export const accountOf = (resource) => createHash("sha256").update(resource, "utf8").digest("hex").slice(0, 32);

/**
 * Runs a tool with the secret on stdin (`missing`: the tool is not installed). Tests replace `run`,
 * `platform` and the lock's waits.
 * @type {{ platform: NodeJS.Platform, lockWaitMs: number, lockStaleMs: number, lockBeatMs: number, lockPollMs: number, run(command: string, args: string[], input: string): Promise<{ code: number | null, stdout: string, missing?: boolean }> }}
 */
export const storeMeans = {
    platform: process.platform,
    // a holder may wait TOOL_MS for an unlock dialog and a request's time limit; a waiting run waits as long
    lockWaitMs: 150_000,
    lockStaleMs: 180_000,
    lockBeatMs: 5000,
    lockPollMs: 100,
    run(command, args, input) {
        return new Promise((done) => {
            let child;
            try {
                child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
            } catch (e) {
                done({ code: null, stdout: "", missing: /** @type {any} */ (e)?.code === "ENOENT" });
                return;
            }
            const chunks = [];
            let size = 0;
            // a ref'd timer: the wait keeps the process alive until the tool ends or is stopped
            const timer = setTimeout(() => child.kill(), TOOL_MS);
            child.stdout.on("data", (chunk) => {
                size += chunk.length;
                if (size <= MAX_SECRET_BYTES) {
                    chunks.push(chunk);
                }
            });
            child.on("error", (e) => {
                clearTimeout(timer);
                done({ code: null, stdout: "", missing: /** @type {any} */ (e)?.code === "ENOENT" });
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                done({ code: size > MAX_SECRET_BYTES ? null : code, stdout: Buffer.concat(chunks).toString("utf8") });
            });
            child.stdin.on("error", () => undefined);
            child.stdin.end(input);
        });
    }
};

/** Windows PowerShell's own path, so no other program of that name is run. */
const powershell = () => join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

/**
 * The Credential Manager's calls for Windows PowerShell. It reads the action, the target and, to
 * write, the secret from stdin (one line each), so none of them is an argument.
 */
const WINDOWS_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PivotkitCredential {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct CREDENTIAL {
        public int Flags; public int Type; public string TargetName; public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
        public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
    }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWriteW(ref CREDENTIAL credential, int flags);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredReadW(string target, int type, int flags, out IntPtr credential);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDeleteW(string target, int type, int flags);
    [DllImport("advapi32.dll")] static extern void CredFree(IntPtr credential);
    public static bool Write(string target, string secret) {
        byte[] bytes = Encoding.UTF8.GetBytes(secret);
        IntPtr blob = Marshal.AllocHGlobal(bytes.Length);
        try {
            Marshal.Copy(bytes, 0, blob, bytes.Length);
            CREDENTIAL c = new CREDENTIAL();
            c.Type = 1; c.TargetName = target; c.CredentialBlobSize = bytes.Length; c.CredentialBlob = blob; c.Persist = 2; c.UserName = "pivotkit";
            return CredWriteW(ref c, 0);
        } finally { Marshal.FreeHGlobal(blob); }
    }
    public static string Read(string target) {
        IntPtr p;
        if (!CredReadW(target, 1, 0, out p)) { return null; }
        try {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            byte[] bytes = new byte[c.CredentialBlobSize];
            Marshal.Copy(c.CredentialBlob, bytes, 0, c.CredentialBlobSize);
            return Encoding.UTF8.GetString(bytes);
        } finally { CredFree(p); }
    }
    public static bool Delete(string target) { return CredDeleteW(target, 1, 0); }
}
'@
$action = [Console]::In.ReadLine()
$target = [Console]::In.ReadLine()
switch ($action) {
    'write' { if (-not [PivotkitCredential]::Write($target, [Console]::In.ReadLine())) { exit 3 } }
    'read' { $secret = [PivotkitCredential]::Read($target); if ($null -eq $secret) { exit 4 }; [Console]::Out.Write($secret) }
    'delete' { if (-not [PivotkitCredential]::Delete($target)) { exit 4 } }
}`;

/** The Credential Manager's target name of an account. */
const windowsTarget = (account) => `${KEYCHAIN_SERVICE}:${account}`;

/**
/**
 * @typedef {{ name: string, missing: string, write(account: string, secret: string): Promise<{ code: number | null, missing?: boolean }>, read(account: string): Promise<string | null>, remove(account: string): Promise<void> }} Keychain
 *   missing: what to install when the tool is not there
 */

/**
 * The system keychain, or null where pivotkit knows none.
 * @returns {Keychain | null}
 */
export function keychainOf() {
    const { platform, run } = storeMeans;
    if (platform === "darwin") {
        const tool = "/usr/bin/security";
        return {
            name: "the macOS keychain",
            missing: "/usr/bin/security, which macOS brings",
            write: (account, secret) => run(tool, ["-i"], `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${account} -l ${KEYCHAIN_SERVICE} -X ${Buffer.from(secret, "utf8").toString("hex")}\n`),
            read: async (account) => {
                const r = await run(tool, ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"], "");
                return r.code === 0 ? r.stdout.replace(/\r?\n$/, "") : null;
            },
            remove: async (account) => void (await run(tool, ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account], ""))
        };
    }
    if (platform === "linux") {
        const tool = "secret-tool";
        const attributes = (account) => ["service", KEYCHAIN_SERVICE, "account", account];
        return {
            name: "the secret service (secret-tool)",
            missing: "secret-tool (the package libsecret-tools, or libsecret on some systems)",
            write: (account, secret) => run(tool, ["store", `--label=${KEYCHAIN_SERVICE}`, ...attributes(account)], secret),
            read: async (account) => {
                const r = await run(tool, ["lookup", ...attributes(account)], "");
                return r.code === 0 && r.stdout ? r.stdout.replace(/\r?\n$/, "") : null;
            },
            remove: async (account) => void (await run(tool, ["clear", ...attributes(account)], ""))
        };
    }
    if (platform === "win32") {
        // the script is the encoded command; stdin holds only its input lines
        const call = (lines) => run(powershell(), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(WINDOWS_SCRIPT, "utf16le").toString("base64")], `${lines.join("\n")}\n`);
        return {
            name: "the Windows Credential Manager",
            missing: "Windows PowerShell",
            write: (account, secret) => call(["write", windowsTarget(account), secret]),
            read: async (account) => {
                const r = await call(["read", windowsTarget(account)]);
                return r.code === 0 && r.stdout ? r.stdout : null;
            },
            remove: async (account) => void (await call(["delete", windowsTarget(account)]))
        };
    }
    return null;
}

/** The file of a server's refresh token when no keychain keeps it. */
const tokenFileOf = (dir, account) => join(dir, "tokens", `${account}.token`);

/** A directory only its owner enters (0700); one there already is set to 0700 on POSIX. */
async function privateDir(path) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (!info.isDirectory()) {
        throw new CliError("io", "NOT_REGULAR_FILE", `${path}: is not a directory`);
    }
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
        await chmod(path, 0o700);
    }
}

/**
 * A file's text, or null when it is missing. A symbolic link, a file with a second name or anything
 * but a regular file is refused; the read is the CLI's own (readSafe, O_NOFOLLOW).
 */
async function readPrivate(path, max) {
    const info = await lstat(path).catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)));
    if (!info) {
        return null;
    }
    if (!info.isFile() || info.size > max) {
        throw new CliError("io", "NOT_REGULAR_FILE", `${path}: is not a file pivotkit wrote; remove it and sign in again`);
    }
    try {
        return new TextDecoder("utf-8").decode(await readSafe(path, { cwd: dirname(path), allow: [], maxBytes: max, hardLinks: false }));
    } catch (e) {
        throw e instanceof CliError ? new CliError(e.kind, e.code, `${path}: ${e.message.replace(/^[^:]*: /, "")}; remove it and sign in again`) : e;
    }
}

/** What the file store says it is, for the messages: Windows has no file modes to name. */
export const fileStoreText = () => (storeMeans.platform === "win32" ? "a file in your user profile" : "a file only you can read (mode 0600)");

/** Whether the lock file at `path` still holds this run's id. */
const ownsLock = (path, id) => readFile(path, "utf8").then((text) => text === id, () => false);

/** A takeover lock older than this is a crashed run's: a takeover takes milliseconds. */
const guardStaleMs = () => Math.min(GUARD_STALE_MS, storeMeans.lockStaleMs);
const GUARD_STALE_MS = 10_000;

/** The takeover lock beside a lock file (takeOver). */
const guardOf = (path) => `${path}.takeover`;

/** A file's age in ms, or null when it is not there. */
const ageOf = (file) => stat(file).then((info) => Date.now() - info.mtimeMs, () => null);

/** Removes a takeover lock a crashed run left (older than guardStaleMs). */
async function clearCrashedGuard(path) {
    if (((await ageOf(guardOf(path))) ?? 0) > guardStaleMs()) {
        await unlink(guardOf(path)).catch(() => undefined);
    }
}

/**
 * Takes over a stale lock, for a run that read its age as stale. Only one run at a time may: it
 * holds a second lock, the takeover lock, made with O_EXCL. Holding it, the run reads the lock's
 * age again and removes the lock only if it is still stale, so a lock another run made since the
 * first read is never moved. A run that makes a lock while a takeover lock is there backs off
 * (locked), so a lock made between the age and the removal is never used. A takeover lock older
 * than guardStaleMs is a crashed run's and is removed. Exported for the tests.
 * @param {string} path  the lock file
 * @returns {Promise<boolean>}  whether this run removed the stale lock
 */
export async function takeOver(path) {
    const guard = guardOf(path);
    let handle;
    try {
        handle = await open(guard, "wx", 0o600);
    } catch (e) {
        if (/** @type {any} */ (e)?.code === "EEXIST") {
            await clearCrashedGuard(path);
        }
        return false;
    }
    try {
        await handle.close();
        if (((await ageOf(path)) ?? 0) > storeMeans.lockStaleMs) {
            return await unlink(path).then(
                () => true,
                () => false
            );
        }
        return false;
    } finally {
        await unlink(guard).catch(() => undefined);
    }
}

/** Writes a file only its owner reads, through a temporary file. */
const writePrivate = (dir, path, text) => writeSafe(path, Buffer.from(text, "utf8"), { cwd: dir, allow: [], mode: 0o600 });

/**
 * @typedef {object} Login
 * @property {string} resource  the server's REST address, as its metadata names it
 * @property {string} issuer
 * @property {string} clientId
 * @property {string} scope
 * @property {string} tokenEndpoint
 * @property {"keychain" | "file"} store
 * @property {string} [revocationEndpoint]  the issuer's RFC 7009 endpoint, when its metadata names one
 */

/**
 * The sign-ins of this user.
 * @param {Record<string, string | undefined>} env
 */
export function credentialStore(env) {
    const dir = configDirOf(env);
    const listFile = join(dir, "logins.json");

    /** @returns {Promise<Record<string, Login>>} */
    async function list() {
        const text = await readPrivate(listFile, MAX_LOGINS_BYTES);
        if (text === null) {
            return {};
        }
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new CliError("io", "BAD_LOGINS", `${listFile}: cannot be read; remove it and sign in again`);
        }
        const logins = data && typeof data === "object" && data.logins && typeof data.logins === "object" ? data.logins : {};
        return Object.fromEntries(Object.entries(logins).filter(([key, l]) => l && typeof l === "object" && l.resource === key && ["keychain", "file"].includes(l.store)));
    }

    async function saveList(logins) {
        await privateDir(dir);
        await writePrivate(dir, listFile, `${JSON.stringify({ version: 1, logins }, null, 2)}\n`);
    }

    /**
     * Keeps a refresh token. "auto" tries the keychain and falls back to the file, with why.
     * @param {string} resource
     * @param {string} secret
     * @param {"auto" | "keychain" | "file"} want
     * @returns {Promise<{ store: "keychain" | "file", where: string, fellBack: boolean, why: string | null }>}
     */
    async function put(resource, secret, want) {
        const account = accountOf(resource);
        let why = null;
        if (want !== "file") {
            const keychain = keychainOf();
            if (!keychain) {
                why = "pivotkit knows no keychain on this system";
            } else if (storeMeans.platform === "win32" && Buffer.byteLength(secret, "utf8") > WINDOWS_BLOB_BYTES) {
                why = `the token is longer than the ${WINDOWS_BLOB_BYTES} bytes ${keychain.name} keeps`;
            } else {
                const written = await keychain.write(account, secret);
                // written, then read back: a tool that says yes but keeps nothing does not count
                if (written.code === 0 && (await keychain.read(account)) === secret) {
                    await unlink(tokenFileOf(dir, account)).catch(() => undefined);
                    return { store: "keychain", where: keychain.name, fellBack: false, why: null };
                }
                why = written.missing ? `${keychain.missing} is not installed` : `${keychain.name} cannot keep the token`;
            }
            if (want === "keychain") {
                throw new CliError("io", "NO_KEYCHAIN", `${why}; use --store file`);
            }
        }
        await privateDir(join(dir, "tokens"));
        const file = tokenFileOf(dir, account);
        await writePrivate(join(dir, "tokens"), file, secret);
        return { store: "file", where: file, fellBack: want === "auto", why };
    }

    /**
     * Runs `work` while this process alone may refresh the server's token: a lock file made with
     * O_EXCL that holds a random id. While held, its time is renewed every lockBeatMs, so a lock
     * whose time is older than lockStaleMs is a crashed run's. One run at a time takes such a lock
     * over (takeOver), and only while it is still stale; a run that made its lock during a takeover
     * backs off. The owner removes only a lock that still holds its own id.
     * @template T
     * @param {string} resource
     * @param {() => Promise<T>} work
     * @returns {Promise<T>}
     */
    async function locked(resource, work) {
        const locks = join(dir, "locks");
        await privateDir(locks);
        const path = join(locks, `${accountOf(resource)}.lock`);
        const id = randomBytes(16).toString("hex");
        const start = Date.now();
        for (;;) {
            try {
                const handle = await open(path, "wx", 0o600);
                await handle.writeFile(id);
                await handle.close();
                // a takeover runs: it may have read the lock before this one as stale and remove
                // this one, so this run backs off and tries again
                if (!(await lstat(guardOf(path)).then(() => true, () => false))) {
                    break;
                }
                if (await ownsLock(path, id)) {
                    await unlink(path).catch(() => undefined);
                }
                await clearCrashedGuard(path);
            } catch (e) {
                if (/** @type {any} */ (e)?.code !== "EEXIST") {
                    throw e;
                }
            }
            const age = await stat(path).then((info) => Date.now() - info.mtimeMs, () => 0);
            // a takeover that removed the lock tries again at once; one that did not waits as any run
            if (age > storeMeans.lockStaleMs && (await takeOver(path))) {
                continue;
            }
            if (Date.now() - start > storeMeans.lockWaitMs) {
                throw new CliError("io", "LOCKED", `another pivotkit token run has held ${path} for ${Math.round(storeMeans.lockWaitMs / 1000)} s; it may wait for a keychain unlock dialog. Try again when it ends`);
            }
            // a ref'd timer: the wait keeps the process alive
            await new Promise((done) => setTimeout(done, storeMeans.lockPollMs));
        }
        // nothing awaits the heartbeat, so it does not keep the process alive
        const beat = setInterval(() => {
            const now = new Date();
            void ownsLock(path, id).then((own) => (own ? utimes(path, now, now) : undefined)).catch(() => undefined);
        }, storeMeans.lockBeatMs);
        beat.unref();
        try {
            return await work();
        } finally {
            clearInterval(beat);
            if (await ownsLock(path, id)) {
                await unlink(path).catch(() => undefined);
            }
        }
    }

    /** A login's refresh token, or null. */
    async function get(login) {
        const account = accountOf(login.resource);
        if (login.store === "keychain") {
            return (await keychainOf()?.read(account)) ?? null;
        }
        const text = await readPrivate(tokenFileOf(dir, account), MAX_SECRET_BYTES);
        return text === null ? null : text.replace(/\r?\n$/, "");
    }

    /** Removes a login's refresh token from the store the login names, and only from there. */
    async function drop(login) {
        const account = accountOf(login.resource);
        if (login.store === "keychain") {
            await keychainOf()?.remove(account);
        } else {
            await unlink(tokenFileOf(dir, account)).catch(() => undefined);
        }
    }

    return {
        dir,
        list,
        put,
        get,
        drop,
        locked,
        /** Records a login, replacing one of the same server. */
        async record(login) {
            const logins = await list();
            logins[login.resource] = login;
            await saveList(logins);
        },
        /** Removes a login and its token. Whether there was one. */
        async remove(resource) {
            const logins = await list();
            const login = logins[resource];
            if (!login) {
                return false;
            }
            await drop(login);
            delete logins[resource];
            await saveList(logins);
            return true;
        }
    };
}

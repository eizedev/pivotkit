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
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CliError } from "./errors.js";
import { writeSafe } from "./safe-files.js";

/** The keychain service name of every entry. */
export const KEYCHAIN_SERVICE = "pivotkit";

/** The largest refresh token or list of sign-ins read back. */
const MAX_SECRET_BYTES = 16_384;
const MAX_LOGINS_BYTES = 262_144;

/** How long a keychain tool may take. */
const TOOL_MS = 15_000;

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
 * Runs a tool with the secret on stdin. Tests replace `run` and `platform`.
 * @type {{ platform: NodeJS.Platform, run(command: string, args: string[], input: string): Promise<{ code: number | null, stdout: string }> }}
 */
export const storeMeans = {
    platform: process.platform,
    run(command, args, input) {
        return new Promise((done) => {
            let child;
            try {
                child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
            } catch {
                done({ code: null, stdout: "" });
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
            child.on("error", () => {
                clearTimeout(timer);
                done({ code: null, stdout: "" });
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
 * The system keychain, or null where pivotkit knows none.
 * @returns {{ name: string, write(account: string, secret: string): Promise<boolean>, read(account: string): Promise<string | null>, remove(account: string): Promise<void> } | null}
 */
export function keychainOf() {
    const { platform, run } = storeMeans;
    if (platform === "darwin") {
        const tool = "/usr/bin/security";
        return {
            name: "the macOS keychain",
            write: async (account, secret) => (await run(tool, ["-i"], `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${account} -l ${KEYCHAIN_SERVICE} -X ${Buffer.from(secret, "utf8").toString("hex")}\n`)).code === 0,
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
            write: async (account, secret) => (await run(tool, ["store", `--label=${KEYCHAIN_SERVICE}`, ...attributes(account)], secret)).code === 0,
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
            write: async (account, secret) => (await call(["write", windowsTarget(account), secret])).code === 0,
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

/** A file's text, or null when it is missing; a symbolic link or anything but a file is refused. */
async function readPrivate(path, max) {
    const info = await lstat(path).catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)));
    if (!info) {
        return null;
    }
    if (!info.isFile() || info.size > max) {
        throw new CliError("io", "NOT_REGULAR_FILE", `${path}: is not a file pivotkit wrote; remove it and sign in again`);
    }
    return readFile(path, "utf8");
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
     * Keeps a refresh token. "auto" tries the keychain and falls back to the file.
     * @param {string} resource
     * @param {string} secret
     * @param {"auto" | "keychain" | "file"} want
     * @returns {Promise<{ store: "keychain" | "file", where: string, fellBack: boolean }>}
     */
    async function put(resource, secret, want) {
        const account = accountOf(resource);
        if (want !== "file") {
            const keychain = keychainOf();
            // written, then read back: a tool that says yes but keeps nothing does not count
            if (keychain && (await keychain.write(account, secret)) && (await keychain.read(account)) === secret) {
                await unlink(tokenFileOf(dir, account)).catch(() => undefined);
                return { store: "keychain", where: keychain.name, fellBack: false };
            }
            if (want === "keychain") {
                throw new CliError("io", "NO_KEYCHAIN", `${keychain ? `${keychain.name} cannot keep the token` : "pivotkit knows no keychain on this system"}; use --store file`);
            }
        }
        await privateDir(join(dir, "tokens"));
        const file = tokenFileOf(dir, account);
        await writePrivate(join(dir, "tokens"), file, secret);
        return { store: "file", where: file, fellBack: want === "auto" };
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

    /** Removes a login's refresh token from where it is. */
    async function drop(login) {
        const account = accountOf(login.resource);
        if (login.store === "keychain") {
            await keychainOf()?.remove(account);
        }
        await unlink(tokenFileOf(dir, account)).catch(() => undefined);
    }

    return {
        dir,
        list,
        put,
        get,
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

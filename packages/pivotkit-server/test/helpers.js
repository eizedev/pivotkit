// Runs the REST service as a program meets it: serve() on a free port, requests with fetch or raw
// node:http (for what fetch will not send: two Authorization headers, a lying Content-Length), the
// command as an operator runs it, and a certificate for TLS on loopback.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { tempDir as sharedTempDir } from "../../../tests/temp-dir.js";
import { serve } from "pivotkit-server";

export const BIN = fileURLToPath(new URL("../bin/pivotkit-server.js", import.meta.url));

/** Mode bits and symbolic links are POSIX facts: tests of them are left out on Windows. */
export const POSIX = process.platform !== "win32";

/**
 * Runs the command as an operator does (the container image runs it the same way): a fresh process
 * with only PATH, HOME and SystemRoot of this one's environment, plus `env`.
 * @param {string[]} args
 * @param {{ env?: Record<string, string>, cwd?: string }} [options]
 */
export const runBin = (args, { env = {}, cwd } = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env }, timeout: 30_000 });

/** Orders of a made-up shop: a personal field (Customer), dates over two years, a one-letter field. */
export const SALES_CSV = ["Region,Product,Customer,Sales,OrderDate,Q", "North,A,Alice Example,10,2025-11-05,1", "South,B,Bob Example,20,2026-09-01,2", "North,B,Carol Example,5,2026-10-01,3", "West,A,Dan Example,7,2026-10-20,1", ",A,Eve Example,3,2024-12-31,2"].join("\n") + "\n";

/** A token long enough for auth.mode "token". */
export const TOKEN = "a-test-token-that-is-long-enough-0123456789";
export const OTHER_TOKEN = "another-test-token-long-enough-9876543210";

/** A new empty directory (its real path), removed when the test file ends (tests/temp-dir.js). */
export const tempDir = (prefix = "pivotkit-server-") => sharedTempDir(prefix);

/** A directory with data/sales.csv and an empty out/. */
export function workspace(files = { "sales.csv": SALES_CSV }) {
    const dir = tempDir();
    mkdirSync(join(dir, "data"));
    mkdirSync(join(dir, "out"));
    for (const [name, text] of Object.entries(files)) {
        writeFileSync(join(dir, "data", name), text);
    }
    return dir;
}

/**
 * check-config's text with each wrapped fact joined back into one line (check/format.js: a wrapped
 * line goes on four spaces further in than the fact it continues), so a test can match a fact
 * whatever the width cuts it at.
 * @param {string} text
 */
export function factsOf(text) {
    const out = [];
    let indent = -1;
    for (const line of text.split("\n")) {
        const own = line.length - line.trimStart().length;
        if (out.length && line.trim() && indent >= 0 && own >= indent + 4) {
            out[out.length - 1] += ` ${line.trim()}`;
            continue;
        }
        out.push(line);
        indent = line.trim() ? own : -1;
    }
    return out.join("\n");
}

/**
 * A certificate and its key for TLS on loopback, made for this run with the openssl command (it must
 * be on the PATH), so no key is kept in the repository. The first name is the subject; every name
 * goes into subjectAltName, an IP address as one.
 * @param {...string} names
 */
export function loopbackCert(...names) {
    const dir = tempDir();
    const keyFile = join(dir, "key.pem");
    const certFile = join(dir, "cert.pem");
    const alt = names.map((n) => (/^[\d.]+$|:/.test(n) ? `IP:${n}` : `DNS:${n}`)).join(",");
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "2", "-subj", `/CN=${names[0]}`, "-addext", `subjectAltName=${alt}`], { stdio: "ignore" });
    return { key: readFileSync(keyFile), cert: readFileSync(certFile), certFile };
}

/** The REST service on a free port, its log kept as parsed lines. */
export async function restServer(options, { env = {}, enable = ["rest"] } = {}) {
    const log = [];
    const server = await serve({ ...options, http: { port: 0, enable, ...options.http } }, { env, stderr: { write: (t) => log.push(...String(t).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) } });
    return { ...server, log, api: `${server.url}/api/v1` };
}

/**
 * A request: JSON in, the status, headers and body (parsed when JSON) out.
 * @param {string} url
 * @param {{ method?: string, body?: unknown, token?: string, headers?: Record<string, string> }} [init]
 */
export async function call(url, { method, body, token, headers = {} } = {}) {
    const response = await fetch(url, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)
    });
    const type = response.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await response.json() : new Uint8Array(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, data };
}

/** A raw HTTP request with any headers (repeated ones as arrays) and body. */
export function raw(url, { method = "GET", headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = httpRequest({ host: u.hostname, port: u.port, path: `${u.pathname}${u.search}`, method, headers }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                let data = text;
                try {
                    data = JSON.parse(text);
                } catch {
                    // not JSON
                }
                resolve({ status: res.statusCode, headers: res.headers, data });
            });
        });
        req.on("error", reject);
        if (body !== undefined) {
            req.write(body);
        }
        req.end();
    });
}

/**
 * Waits until the server is ready (/readyz answers 200), such as after it loaded its OAuth issuer.
 * Throws when it is not ready after `tries` polls 50 ms apart.
 */
export async function untilReady(server, tries = 50) {
    for (let i = 0; i < tries; i++) {
        if ((await call(`${server.url}/readyz`)).status === 200) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("the server did not get ready");
}

/** A view of the sales data. */
export const BY_REGION = Object.freeze({ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] });

/** Every field of the sales data shown. */
export const ALL_SHOWN = Object.freeze({ default: "show" });

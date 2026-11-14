// Runs the REST service as a program meets it: serve() on a free port, requests with fetch or raw
// node:http (for what fetch will not send: two Authorization headers, a lying Content-Length).
import { mkdtempSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { serve } from "pivotkit-server";

export const BIN = fileURLToPath(new URL("../bin/pivotkit-server.js", import.meta.url));

/** Orders of a made-up shop: a personal field (Customer), dates over two years, a one-letter field. */
export const SALES_CSV = ["Region,Product,Customer,Sales,OrderDate,Q", "North,A,Alice Example,10,2025-11-05,1", "South,B,Bob Example,20,2026-09-01,2", "North,B,Carol Example,5,2026-10-01,3", "West,A,Dan Example,7,2026-10-20,1", ",A,Eve Example,3,2024-12-31,2"].join("\n") + "\n";

/** A token long enough for auth.mode "token". */
export const TOKEN = "a-test-token-that-is-long-enough-0123456789";
export const OTHER_TOKEN = "another-test-token-long-enough-9876543210";

/** A new empty directory (its real path). */
export const tempDir = (prefix = "pivotkit-server-") => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

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

/** A view of the sales data. */
export const BY_REGION = Object.freeze({ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] });

/** Every field of the sales data shown. */
export const ALL_SHOWN = Object.freeze({ default: "show" });

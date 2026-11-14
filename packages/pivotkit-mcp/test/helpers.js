// Runs the server as a client meets it: the runner over stdio (a spawned process) or Streamable HTTP
// (listen() on a free port), with the SDK's own client, in either protocol era.
import { mkdtempSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { listen } from "pivotkit-mcp";

export const BIN = fileURLToPath(new URL("../bin/pivotkit-mcp.js", import.meta.url));

/** The protocol eras a client speaks: the 2025 handshake (the SDK client's default) and 2026-07-28. */
export const ERAS = Object.freeze({ legacy: undefined, modern: { mode: { pin: "2026-07-28" } } });

/** Orders of a made-up shop: a personal field (Customer), dates over two years, a one-letter field. */
export const SALES_CSV = ["Region,Product,Customer,Sales,OrderDate,Q", "North,A,Alice Example,10,2025-11-05,1", "South,B,Bob Example,20,2026-09-01,2", "North,B,Carol Example,5,2026-10-01,3", "West,A,Dan Example,7,2026-10-20,1", ",A,Eve Example,3,2024-12-31,2"].join("\n") + "\n";

/** A new empty directory (its real path). */
export const tempDir = (prefix = "pivotkit-mcp-") => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

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

/** A client of the runner over stdio. */
export async function stdioClient(args, { era = "legacy", cwd, env = {} } = {}) {
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN, ...args], cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, stderr: "pipe" });
    const stderr = [];
    transport.stderr?.on("data", (c) => stderr.push(String(c)));
    const client = new Client({ name: "pivotkit-mcp-test", version: "1.0.0" }, ERAS[era] ? { versionNegotiation: ERAS[era] } : {});
    await client.connect(transport);
    return { client, stderr, close: () => client.close() };
}

/** The runner's HTTP server on a free port, its log kept. */
export async function httpServer(options, { env = {} } = {}) {
    const log = [];
    const server = await listen({ http: { port: 0, ...options.http }, ...options, baseDir: options.baseDir }, { env, stderr: { write: (t) => log.push(...String(t).trim().split("\n").map((l) => JSON.parse(l))) } });
    return { ...server, log };
}

/** A client of an HTTP server. */
export async function httpClient(url, { era = "legacy", token, headers = {} } = {}) {
    const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } } });
    const client = new Client({ name: "pivotkit-mcp-test", version: "1.0.0" }, ERAS[era] ? { versionNegotiation: ERAS[era] } : {});
    await client.connect(transport);
    return { client, close: () => client.close() };
}

/** Calls a tool; its text, structured content and whether it is an error. */
export async function call(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    return { text: result.content.map((c) => c.text ?? "").join("\n"), data: result.structuredContent, isError: Boolean(result.isError), raw: result };
}

/** A view of the sales data. */
export const BY_REGION = Object.freeze({ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] });
